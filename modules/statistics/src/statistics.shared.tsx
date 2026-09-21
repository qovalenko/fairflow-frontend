/**
 * Общий слой области «Статистика и дашборд» (SCR-STATISTICS-DASHBOARD /
 * SCR-STATISTICS-ANALYTICS) — заметка реализации SCREENS §15: «общий слой
 * загрузки/период/scope в shared-хук».
 *
 * Источник данных (C1-stats-be, statistics-TZ §5.5):
 *  - DASHBOARD → `GET /api/v1/dashboard?projectId&period` → `DashboardMetrics`;
 *  - ANALYTICS → `GET /api/v1/statistics?projectId&period&slices[]` → `StatisticsMetrics`;
 *  - экспорт   → `GET /api/v1/statistics/export` (на экране ANALYTICS).
 * `projectId` + `period` реально уходят в запрос (route-guard + visibility +
 * period на gateway). Мета `asOf`/`partial`/`scopeLevel` читается прямо из
 * типизированного `DashboardData` (DTO §5.5). Мок-fallback убран — `undefined`
 * → пустое/skeleton-состояние, не фейк.
 *
 * Гейт запроса (T-003-FE): включённость модуля `statistics` в
 * `effectiveModules` проекта (Contextual UI) И право `statistics:read`
 * (FR-MSTAT-1, FR-SHELL-3/20a). Без обоих — dashboard/statistics НЕ дёргается
 * (нет 403-спама на проектах с выключенной статистикой; be route-guard дублирует
 * fail-closed). Метод-уровневый `@RequireModule('statistics')` — на be.
 */
import { useCallback, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router'
import useSWR from 'swr'
import { Card } from '@fairflow/shared-ui'
import { apiGetDashboard, apiGetStatistics } from '@/services/CrmService'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { useProjectStore, getEnabledModules } from '@/store/projectStore'
import type { DashboardData } from '@/@types/crm'
import { qa } from './qa'

// ── Период (EL-DASH-1 / EL-ANL-1, FR-MSTAT-7/8) ───────────────────────────────
// `custom` поддержан gateway (`?from&?to`) и доменом (resolvePeriod: custom
// требует from ≤ to, epoch **ms**) — без него произвольный диапазон с фронта
// не уходил вообще.
export type Period = 'today' | 'week' | 'month' | 'quarter' | 'custom'

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
    { value: 'today', label: 'Сегодня' },
    { value: 'week', label: 'Неделя' },
    { value: 'month', label: 'Месяц' },
    { value: 'quarter', label: 'Квартал' },
    { value: 'custom', label: 'Произвольный' },
]

export const DEFAULT_PERIOD: Period = 'month'

/** Произвольный диапазон в виде `YYYY-MM-DD` (то, что даёт `<input type="date">`). */
export type CustomRange = { from: string; to: string }

export const EMPTY_RANGE: CustomRange = { from: '', to: '' }

/** `YYYY-MM-DD` → epoch ms (начало/конец локальных суток). Пусто/мусор → null. */
export function rangeToEpochMs(
    range: CustomRange,
): { from: number; to: number } | null {
    if (!range.from || !range.to) return null
    const from = new Date(`${range.from}T00:00:00`).getTime()
    const to = new Date(`${range.to}T23:59:59.999`).getTime()
    if (Number.isNaN(from) || Number.isNaN(to)) return null
    if (from > to) return null
    return { from, to }
}

// ── Вид области в URL (TODO-496, FR-MSTAT-7/17) ───────────────────────────────
/**
 * Период/произвольный диапазон/активный срез живут в query-строке, а НЕ в
 * `useState`. Две причины, обе проверены по коду обоих концов:
 *  1. слоты `dashboard.*` читают период из URL через `useStatistics` /
 *     `slotContext` в `Dashboard.tsx` (host больше не дублирует слоты вокруг
 *     remote — FR-STAT-170). При локальном `useState` смена периода на экране
 *     не доезжала бы до вкладов других модулей;
 *  2. F5 / шаринг ссылки восстанавливают ровно тот же вид.
 * Дефолт в URL не пишем: чистая ссылка = дефолтный вид, и это тот же дефолт,
 * который читает host (`month`).
 */
export const PERIOD_PARAM = 'period'
export const FROM_PARAM = 'from'
export const TO_PARAM = 'to'
export const SLICE_PARAM = 'slice'

const PERIOD_VALUES: readonly string[] = PERIOD_OPTIONS.map((o) => o.value)
/** `YYYY-MM-DD` — ровно то, что даёт/принимает `<input type="date">`. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** `?period=` → валидный `Period`; мусор/пусто → дефолт (не 400 с домена). */
export function parsePeriodParam(value: string | null | undefined): Period {
    return value && PERIOD_VALUES.includes(value)
        ? (value as Period)
        : DEFAULT_PERIOD
}

/** `?from=&?to=` → `CustomRange`; невалидная дата отбрасывается (→ ST-3). */
export function parseRangeParams(
    from: string | null | undefined,
    to: string | null | undefined,
): CustomRange {
    return {
        from: from && ISO_DATE_RE.test(from) ? from : '',
        to: to && ISO_DATE_RE.test(to) ? to : '',
    }
}

/**
 * Новый набор query-параметров под выбранный период/диапазон. Чужие параметры
 * (drill'ы, `pid` и пр.) сохраняются. `from`/`to` живут только при
 * `period=custom` — иначе висли бы в ссылке, ничего не задавая.
 */
export function writePeriodParams(
    prev: URLSearchParams,
    period: Period,
    range: CustomRange,
): URLSearchParams {
    const next = new URLSearchParams(prev)
    if (period === DEFAULT_PERIOD) next.delete(PERIOD_PARAM)
    else next.set(PERIOD_PARAM, period)
    const custom =
        period === 'custom'
            ? parseRangeParams(range.from, range.to)
            : EMPTY_RANGE
    if (custom.from) next.set(FROM_PARAM, custom.from)
    else next.delete(FROM_PARAM)
    if (custom.to) next.set(TO_PARAM, custom.to)
    else next.delete(TO_PARAM)
    return next
}

// ── Scope зрителя (EL-DASH-3, FR-MSTAT-4/26, ST-13) ───────────────────────────
export type ScopeLevel =
    | 'only_own'
    | 'own_and_shared'
    | 'own_and_subordinates'
    | 'own_and_department'
    | 'all'

const SCOPE_LABELS: Record<ScopeLevel, string> = {
    only_own: 'мои данные',
    own_and_shared: 'мои и общие данные',
    own_and_subordinates: 'данные моей команды',
    own_and_department: 'данные отдела',
    all: 'все данные проекта',
}

export function scopeLabel(level?: ScopeLevel): string | null {
    if (!level) return null
    return SCOPE_LABELS[level] ?? null
}

/** scope ≥ own_and_subordinates → видны breakdown'ы по менеджерам/отделам. */
export function scopeSeesTeam(level?: ScopeLevel): boolean {
    return (
        level === 'own_and_subordinates' ||
        level === 'own_and_department' ||
        level === 'all'
    )
}

/** Какой экран области тянет данные — выбирает эндпоинт (TZ §5.5 таблица). */
export type StatisticsVariant = 'dashboard' | 'analytics'

/**
 * Срезы аналитики (`/api/v1/statistics?slices[]`, FR-MSTAT-17).
 *
 * TODO-272 (состав срезов FE↔BE↔proto), про `order_types` — читать перед тем,
 * как его отсюда убрать. На момент волны «Заказы» срез перестал быть заглушкой:
 * цепочка данных существует целиком —
 *   `proto/fairflow/reports/v1/reports.proto`: `StatOrderTypeRow` +
 *   `GetMetricsResponse.order_types = 14` (поле добавлено, слот не reserved);
 *   `reports/src/reports/reports.service.ts#getMetrics` — считает срез из
 *   заказов и гейтит его модулем `orders` в `enabledModules`;
 *   `gateway/src/bff/statistics-bff.controller.ts#orderTypesFe` — маппит
 *   `order_types[] → orderTypes[] {orderTypeId, orderTypeName, count}`
 *   (имя типа резолвится на gateway, id сохраняется как ключ drill'а);
 *   `Analytics.tsx` — рисует срез и drill'ит в `/orders?typeId=<id>`, который
 *   `modules/orders/src/OrderList.tsx` снимает с URL при монтировании.
 * Поэтому старое обоснование «данных не существует ни в одном звене» после
 * волны «Заказы» неверно: удаление `order_types` отсюда не «убирает пустую
 * вкладку», а обрывает работающую цепочку до пользователя. Убирать — только
 * вместе с proto+доменом+BFF+`Analytics.tsx`, иначе останется реализованный
 * backend без экрана.
 */
export type StatSlice =
    | 'sales'
    | 'funnel'
    | 'sources'
    | 'team'
    | 'by_department'
    | 'order_types'
    | 'stage_timing'

/** Полный список срезов — он же whitelist для `?slice=` (см. `parseSliceParam`). */
export const STAT_SLICES: readonly StatSlice[] = [
    'sales',
    'funnel',
    'sources',
    'team',
    'by_department',
    'order_types',
    'stage_timing',
]

export const DEFAULT_SLICE: StatSlice = 'sales'

/** `?slice=` → валидный срез; неизвестное значение → дефолт. */
export function parseSliceParam(value: string | null | undefined): StatSlice {
    return value && (STAT_SLICES as readonly string[]).includes(value)
        ? (value as StatSlice)
        : DEFAULT_SLICE
}

/** Записать активный срез в query (дефолт — убрать параметр). */
export function writeSliceParam(
    prev: URLSearchParams,
    slice: StatSlice,
): URLSearchParams {
    const next = new URLSearchParams(prev)
    if (slice === DEFAULT_SLICE) next.delete(SLICE_PARAM)
    else next.set(SLICE_PARAM, slice)
    return next
}

export type StatisticsState = {
    /** Идёт первичная загрузка (ST-1) — данных ещё нет. */
    isInitialLoading: boolean
    /** Идёт фоновый refetch поверх данных (ST-2). */
    isRefreshing: boolean
    /** Ошибка загрузки (ST-6). */
    error: unknown
    /** Данные есть. */
    data: DashboardData | null
    /** Мета-поля ответа. */
    asOf: number | string | null
    partial: boolean
    scopeLevel?: ScopeLevel
    /** Проект не выбран (ST-19). */
    noProject: boolean
    /** Право `statistics:read` (ST-10). */
    canRead: boolean
    /** Право `statistics:export` (ST-11 на ANALYTICS, FR-MSTAT-2). */
    canExport: boolean
    /** Включённые модули проекта (Contextual UI источников — ST-17). */
    enabledModules: string[]
    period: Period
    setPeriod: (p: Period) => void
    /** Произвольный диапазон (активен только при `period === 'custom'`). */
    range: CustomRange
    setRange: (r: CustomRange) => void
    /** `period === 'custom'`, но диапазон ещё не задан/некорректен (ST-3 вместо 400). */
    rangeIncomplete: boolean
    /** Ручной refetch (EL-DASH-2 / EL-ANL-4, FR-MSTAT-14). */
    refresh: () => void
    projectId?: string
}

/**
 * Единый хук загрузки/период/scope/прав для обоих экранов области.
 * SWR-ключ несёт `projectId` + `period` → смена проекта/периода = teardown
 * данных и refetch (ST-20, ST-2). `keepPreviousData` даёт overlay-режим
 * (данные не сбрасываются в skeleton при смене периода — ST-2).
 */
export function useStatistics(
    variant: StatisticsVariant = 'dashboard',
    slices?: StatSlice[],
): StatisticsState {
    const pid = useCurrentProjectId()
    const can = usePermission()
    const canRead = can('statistics', 'read')
    const canExport = can('statistics', 'export')

    const currentProject = useProjectStore((s) => s.currentProject)
    const enabledModules = useMemo(
        () => getEnabledModules(currentProject),
        [currentProject],
    )
    // FAIL-CLOSED gate source (T-003-FE): only trust the module set when it belongs
    // to the project we would actually fetch (`pid`). `getEnabledModules(null)` is
    // fail-OPEN (defaults incl. `statistics`), so a deep-link to a statistics-off
    // project before the store hydrates must NOT fire a dashboard/statistics call.
    const statisticsEnabled =
        currentProject != null &&
        currentProject.id === pid &&
        enabledModules.includes('statistics')

    // Период/диапазон — из URL (TODO-496): host читает `?period=` для
    // context-пропсов дашборд-слотов, а F5/шаринг ссылки восстанавливают вид.
    // `replace: true` — переключение периода не засоряет историю браузера.
    const [searchParams, setSearchParams] = useSearchParams()
    const periodParam = searchParams.get(PERIOD_PARAM)
    const fromParam = searchParams.get(FROM_PARAM)
    const toParam = searchParams.get(TO_PARAM)
    const period = parsePeriodParam(periodParam)
    const range = useMemo(
        () => parseRangeParams(fromParam, toParam),
        [fromParam, toParam],
    )
    const setPeriod = useCallback(
        (next: Period) => {
            setSearchParams(
                (prev) =>
                    writePeriodParams(
                        prev,
                        next,
                        parseRangeParams(
                            prev.get(FROM_PARAM),
                            prev.get(TO_PARAM),
                        ),
                    ),
                { replace: true },
            )
        },
        [setSearchParams],
    )
    const setRange = useCallback(
        (next: CustomRange) => {
            setSearchParams(
                (prev) =>
                    writePeriodParams(
                        prev,
                        parsePeriodParam(prev.get(PERIOD_PARAM)),
                        next,
                    ),
                { replace: true },
            )
        },
        [setSearchParams],
    )

    // custom без корректного диапазона НЕ отправляем: домен ответит
    // INVALID_ARGUMENT («period=custom requires from and to»), а пользователь
    // увидит ложную «ошибку загрузки» вместо подсказки «выберите даты».
    const customMs = period === 'custom' ? rangeToEpochMs(range) : null
    const rangeIncomplete = period === 'custom' && customMs === null

    // SWR-ключ несёт endpoint+projectId+period(+slices) → смена любого =
    // teardown+refetch (ST-20/ST-2); проект/право/модуль отсутствуют → запрос
    // не идёт (route-guard на be дублирует это fail-closed).
    // T-003-FE: гейт по включённости модуля `statistics` в effectiveModules
    // проекта (Contextual UI, fail-closed `statisticsEnabled` выше) В ДОПОЛНЕНИЕ
    // к праву `statistics:read` — без включённого модуля dashboard/statistics НЕ
    // дёргается (нет 403-спама на проектах с выключенной статистикой; deep-link
    // на экран данные не тянет).
    const slicesKey = slices?.length ? slices.slice().sort().join(',') : ''
    const endpoint =
        variant === 'analytics' ? '/api/v1/statistics' : '/api/v1/dashboard'
    const shouldFetch =
        Boolean(pid) && canRead && statisticsEnabled && !rangeIncomplete
    const { data, error, isLoading, isValidating, mutate } = useSWR<DashboardData>(
        shouldFetch
            ? [endpoint, pid, period, slicesKey, customMs?.from ?? 0, customMs?.to ?? 0]
            : null,
        () =>
            variant === 'analytics'
                ? apiGetStatistics<DashboardData>({
                      projectId: pid,
                      period,
                      from: customMs?.from,
                      to: customMs?.to,
                      slices: slices?.length ? slices : undefined,
                  })
                : apiGetDashboard<DashboardData>({
                      projectId: pid,
                      period,
                      from: customMs?.from,
                      to: customMs?.to,
                  }),
        {
            revalidateOnFocus: false,
            keepPreviousData: true,
            shouldRetryOnError: false,
        },
    )

    const refresh = useCallback(() => {
        void mutate()
    }, [mutate])

    return {
        isInitialLoading: shouldFetch && isLoading && !data,
        isRefreshing: isValidating && Boolean(data),
        error: error ?? null,
        data: data ?? null,
        asOf: data?.asOf ?? null,
        partial: data?.partial === true,
        scopeLevel: data?.scopeLevel,
        noProject: !pid,
        canRead,
        canExport,
        enabledModules,
        period,
        setPeriod,
        range,
        setRange,
        rangeIncomplete,
        refresh,
        projectId: pid,
    }
}

/**
 * Ссылка drill'а в целевой список (FR-MSTAT-24).
 *
 * ПРАВИЛО КОНТРАКТА: эмитим ТОЛЬКО те параметры, которые целевой список
 * реально принимает. Пустые значения не эмитим вовсе — `?assigneeId=` открывал
 * бы несфильтрованный список под видом фильтра.
 *
 * Почему здесь больше нет `period`/`from`/`to` (раньше их клал `drillQuery`):
 * ни один целевой список их не читает и не может — gateway
 * (`crm-bff.controller.ts` @Get('deals')) принимает у сделок
 * `query/pipelineId/stageId/assigneeId/departmentId/status/contactId/companyId/
 * source/amountMin/amountMax` и НИ ОДНОГО параметра диапазона по created-at,
 * а у активностей (@Get('activities')) окно задаётся `dateFrom`/`dateTo`, и
 * списки overdue/upcoming дашборда вообще не период-зависимы (домен считает их
 * от `asOf`, `reports.service.ts`). Односторонняя ссылка — тот самый класс
 * дефекта «эмитим то, что нечем принять»; вернуть период можно только вместе с
 * серверным фильтром по дате создания сделки.
 */
/**
 * База drill-ссылки в целевой модуль.
 *
 * Префикс `/p/:pid` ставим ТОЛЬКО когда он есть в текущем URL. В host'е
 * маршрутов вида `/p/:pid/deals|orders|activities` не существует вовсе —
 * `routes.config.ts` знает лишь `/p/:pid`, `/p/:pid/settings[...]`, а списки
 * живут портфельными путями (`/deals`, `/deals/:id`, `/orders`,
 * `/activities/*`; проект берётся из store). Раньше база собиралась от
 * `projectId` из store (он в host'е есть ВСЕГДА), поэтому каждый drill
 * дашборда/аналитики уходил на несуществующий путь и попадал в catch-all
 * «Страница не найдена» (`AllRoutes.tsx`).
 *
 * Под standalone-сборкой модуля `/p/:pid/...` в URL реально бывает
 * (`StandaloneModuleApp`: `path="/p/:pid<modulePath>/*"`) — там pid берётся из
 * параметров маршрута, и префикс сохраняется, как и было.
 */
export function drillBase(routePid: string | undefined, path: string): string {
    return routePid ? `/p/${routePid}${path}` : path
}

/** pid ИЗ URL (а не из store) — источник префикса для `drillBase`. */
export function useRoutePid(): string | undefined {
    return useParams<{ pid?: string }>().pid
}

export function drillTo(
    base: string,
    params: Record<string, string | undefined | null>,
): string {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
        if (value) qs.set(key, value)
    })
    const query = qs.toString()
    return query ? `${base}?${query}` : base
}

// ── Хелперы безопасного чтения массивов из ответа ─────────────────────────────
export const asArray = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[]
    if (
        value &&
        typeof value === 'object' &&
        'list' in value &&
        Array.isArray((value as { list?: unknown }).list)
    ) {
        return (value as { list: T[] }).list
    }
    return []
}

export function formatAsOf(asOf: number | string | null): string | null {
    if (asOf == null) return null
    const d =
        typeof asOf === 'number'
            ? new Date(asOf < 1e12 ? asOf * 1000 : asOf)
            : new Date(asOf)
    if (Number.isNaN(d.getTime())) return null
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `данные на ${hh}:${mm}`
}

// ── EL-WF-* — единый контракт деградации врезки (SCR-STATISTICS-WIDGET-FALLBACK)
// FR-MSTAT-13/15, FR-SHELL-5, OQ-UX-STATISTICS-7 (единый стиль плашки).

/** EL-WF-1 «нет данных» — пустое состояние вместо фейка/`null` (FR-MSTAT-13). */
export const WidgetEmpty = ({
    title,
    hint,
    state,
}: {
    title?: string
    hint?: string
    /** Stable e2e anchor for empty-state variants (ST-3/ST-4). */
    state?: string
}) => (
    <div
        className="flex flex-col items-center justify-center py-8 text-center"
        {...qa('statistics.shared.widgetEmpty', state ? { state } : undefined)}
    >
        <div className="text-3xl mb-2 opacity-40">📊</div>
        <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {title ?? 'Нет данных'}
        </div>
        {hint && (
            <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                {hint}
            </div>
        )}
    </div>
)

/** EL-WF-2 «partial» — провайдер таймаутнул (FR-MSTAT-15, ST-8). */
export const WidgetPartial = ({ onRetry }: { onRetry?: () => void }) => (
    <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="text-3xl mb-2 opacity-40">⏱️</div>
        <div className="text-sm font-medium text-amber-600 dark:text-amber-400">
            Данные недоступны
        </div>
        <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
            попробуйте обновить
        </div>
        {onRetry && (
            <button
                type="button"
                onClick={onRetry}
                className="mt-2 text-xs text-blue-600 hover:underline"
            >
                Обновить
            </button>
        )}
    </div>
)

/** EL-WF-4 «+N» — усечение списка сверх лимита (FR-MSTAT-12/30, ST-5). */
export const WidgetMore = ({
    count,
    onClick,
}: {
    count: number
    onClick?: () => void
}) => {
    if (count <= 0) return null
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className="mt-2 w-full text-xs text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
            {...qa('statistics.shared.widgetMore', { count })}
        >
            + ещё {count}
        </button>
    )
}

/**
 * Подвал списочного виджета (EL-WF-4 + drill в полный список, FR-MSTAT-12/24).
 *
 * Домен усекает списки лимитом на своей стороне и НЕ возвращает общее число
 * совпадений (в `GetDashboardResponse` нет totals), поэтому `more` на клиенте
 * почти всегда 0 — а `WidgetMore` при 0 рендерил `null`, из-за чего переход
 * «показать все» не отрисовывался вообще и drill был недостижим. Ссылка на
 * полный список показывается всегда, «+N» — когда усечение реально видно.
 */
export const WidgetListFooter = ({
    more,
    onClick,
    label = 'Показать все',
    kind,
}: {
    more: number
    onClick?: () => void
    label?: string
    kind?: string
}) => (
    <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="mt-2 w-full text-xs text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
        {...qa('statistics.shared.listFooter', {
            ...(kind ? { kind } : {}),
            ...(more > 0 ? { remaining: more } : {}),
        })}
    >
        {more > 0 ? `+ ещё ${more}` : `${label} →`}
    </button>
)

/** Бейдж `partial` хедера (EL-DASH-4 / EL-ANL-11, FR-MSTAT-15). */
export const PartialBadge = () => (
    <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
        {...qa('statistics.header.partialBadge')}
    >
        ⏱️ частичные данные
    </span>
)

/** ST-10 — нет права `statistics:read`: graceful-заглушка, не белый экран / 403. */
export const NoPermissionScreen = () => (
    <Card className="mx-auto mt-10 max-w-md text-center" {...qa('statistics.shared.noPermission')}>
        <div className="py-8">
            <div className="text-4xl mb-3 opacity-40">🔒</div>
            <h5 className="mb-2">Раздел недоступен</h5>
            <p className="text-sm text-gray-500 dark:text-gray-400">
                У вас нет доступа к статистике этого проекта. Обратитесь к
                администратору проекта.
            </p>
        </div>
    </Card>
)

/** ST-19 — проект не выбран: системный CRM-экран без проекта недоступен. */
export const NoProjectScreen = () => (
    <Card className="mx-auto mt-10 max-w-md text-center" {...qa('statistics.shared.noProject')}>
        <div className="py-8">
            <div className="text-4xl mb-3 opacity-40">🗂️</div>
            <h5 className="mb-2">Проект не выбран</h5>
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Выберите проект, чтобы увидеть статистику и дашборд.
            </p>
        </div>
    </Card>
)

/**
 * `period=custom`, диапазон не задан/некорректен: запрос не отправлен намеренно
 * (домен вернул бы INVALID_ARGUMENT) — подсказываем выбрать даты, а не «нет данных».
 */
export const RangePromptScreen = () => (
    <Card className="mx-auto mt-10 max-w-md text-center" {...qa('statistics.shared.rangePrompt')}>
        <div className="py-8">
            <div className="text-4xl mb-3 opacity-40">🗓️</div>
            <h5 className="mb-2">Выберите диапазон</h5>
            <p
                className="text-sm text-gray-500 dark:text-gray-400"
                {...qa('statistics.shared.rangePromptHint')}
            >
                Для произвольного периода укажите обе даты — начало не позже
                конца.
            </p>
        </div>
    </Card>
)

/** ST-6 — ошибка загрузки `DashboardMetrics`: «не удалось загрузить» + «Повторить». */
export const ErrorScreen = ({ onRetry }: { onRetry: () => void }) => (
    <Card className="mx-auto mt-10 max-w-md text-center" {...qa('statistics.shared.error')}>
        <div className="py-8">
            <div className="text-4xl mb-3 opacity-40">⚠️</div>
            <h5 className="mb-2">Не удалось загрузить</h5>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                Данные статистики временно недоступны.
            </p>
            <button
                type="button"
                onClick={onRetry}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                {...qa('statistics.shared.errorRetry')}
            >
                Повторить
            </button>
        </div>
    </Card>
)

/** ST-1 — послотовый skeleton (не «белый экран», SCREENS §10 ST-1). */
export const WidgetSkeleton = ({
    height = 280,
    slot,
}: {
    height?: number
    /** Stable e2e anchor for skeleton slot (kpi/chart/tabs). */
    slot?: string
}) => (
    <div
        className="animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700/40"
        style={{ height }}
        {...qa('statistics.shared.widgetSkeleton', slot ? { slot } : undefined)}
    />
)
