import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import Highlighter from 'react-highlight-words'
import useSWR from 'swr'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useModulePolicy from '@/utils/hooks/useModulePolicy'
import { useVisibilityScope } from '@/utils/hooks/usePermissionStatus'
import useSearchClientSettings from '@/utils/hooks/useSearchClientSettings'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Segment from '@/components/ui/Segment'
import Spinner from '@/components/ui/Spinner'
import Tag from '@/components/ui/Tag'
import Skeleton from '@/components/ui/Skeleton'
import {
    PiCaretRightDuotone,
    PiClockCountdownDuotone,
    PiMagnifyingGlassDuotone,
} from 'react-icons/pi'
import {
    apiSearchQuery,
    searchHitPath,
    ENTITY_TYPE_LABEL,
    type SearchEntityType,
    type SearchScopePreset,
    type SearchQueryResponse,
} from '@/services/SearchService'
import { SearchHitLink } from '@/components/search/SearchHitLink'
import {
    ErrorState,
    NoPermissionState,
    NoProjectState,
    errMessage,
    errCode,
} from './shared'
import { qa } from './qa'

/**
 * SCR-SEARCH-RESULTS — полная страница результатов («показать все»).
 * Маршрут `/p/:pid/search?q=…&type=…&scope=…&page=…` (TO-BE, OQ-UX-SEARCH-1).
 *
 * Покрыто: EL-RESULTS-1 строка запроса (из URL) · EL-RESULTS-2 chips типов ·
 * EL-RESULTS-3 scope-пресет · EL-RESULTS-4 строка→карточка · EL-RESULTS-5
 * пагинация 25/50/100 · EL-RESULTS-7 свежесть.
 * Состояния: ST-1/ST-2 загрузка, ST-3/ST-4 пусто, ST-6 ошибка, ST-10 нет-прав,
 * ST-13 visibility, ST-19 нет проекта, ST-28 lag.
 */

const PAGE_SIZES = [25, 50, 100] as const
type PageSize = (typeof PAGE_SIZES)[number]
type ScopePreset = SearchScopePreset

// EL-RESULTS-1: те же параметры ввода, что и у overlay в топбаре
// (host `components/template/Search.tsx`).
const DEBOUNCE_MS = 300 // T-018-FE: один запрос на серию нажатий, не на keystroke
const MAX_QUERY_LEN = 256 // FR-MSRCH-22 / NFR-MSRCH-6

/** EL-RESULTS-3 / FR-SEARCH-140. `all` — дефолт: пресет только СУЖАЕТ выдачу
 * поверх видимости, поэтому «ничего не выбрано» = «всё, что мне видно». */
const SCOPE_OPTIONS: { value: ScopePreset; label: string }[] = [
    { value: 'my', label: 'Мои' },
    { value: 'dept', label: 'Мой отдел' },
    { value: 'all', label: 'Все доступные' },
]
const DEFAULT_SCOPE: ScopePreset = 'all'

const isScopePreset = (v: string | null): v is ScopePreset =>
    v === 'my' || v === 'dept' || v === 'all'

const SearchResults = () => {
    const pid = useCurrentProjectId()
    const can = usePermission()
    // Гейт экрана обязан повторять СЕРВЕРНЫЙ PEP и шапку, а не каталог модулей.
    //
    // `can('search','read')` читает проекцию прав, а её каталог собирается из
    // ВКЛЮЧЁННЫХ модулей проекта (control `RolesService.getCatalog` →
    // `buildProjectCatalogWithSystem(enabledModules)`), тогда как модуль `search`
    // не включён ни в одном проекте по умолчанию (module-registry `locked:false`,
    // вне `DEMO_SHOWCASE_MODULES`). Поэтому ключа `search:read` в проекции нет —
    // и экран отвечал «Нет права search:read» даже владельцу дефолтного проекта,
    // хотя сервер запрос честно выполняет: `GET /api/search/query` помечен
    // `@RequirePermission('search','read')` и НАМЕРЕННО без
    // `@RequireModule('search')` (T-018, common-bff.controller.ts) — плоская
    // матрица ролей даёт `read` всем проектным ролям вплоть до viewer.
    //
    // Итог до правки: лупа в шапке (Search.tsx, тот же гейт) показывала
    // результаты и вела сюда по «Показать все N →», а страница встречала
    // «раздел недоступен». Гейтим ровно тем, чем гейтит сервер и шапка: явное
    // project-wide deny-правило module-policy на `search:read`
    // (usePortfolioProjectGuard держит тот же контракт для самого маршрута).
    // FE-гейт — UX, не безопасность: источник истины остаётся на сервере.
    const canRead = useModulePolicy('search').flag('search:read', true)
    // TODO-492: порог запроса — сохранённая настройка проекта, а не константа
    // сборки (perTypeLimit на полном экране = размер страницы, см. фетчер).
    const { minQueryChars, isSettled: settingsSettled } =
        useSearchClientSettings(pid, canRead)

    const [params, setParams] = useSearchParams()
    const q = params.get('q') ?? ''
    const typeFilter = (params.get('type') as SearchEntityType | null) ?? null
    const rawScope = params.get('scope')
    const scope: ScopePreset = isScopePreset(rawScope) ? rawScope : DEFAULT_SCOPE
    const page = Math.max(0, parseInt(params.get('page') ?? '0', 10) || 0)
    const pageSize = (PAGE_SIZES.includes(
        parseInt(params.get('size') ?? '', 10) as PageSize,
    )
        ? (parseInt(params.get('size') ?? '', 10) as PageSize)
        : 25) as PageSize

    const setParam = useCallback(
        (patch: Record<string, string | null>) => {
            const next = new URLSearchParams(params)
            Object.entries(patch).forEach(([k, v]) => {
                if (v === null || v === '') next.delete(k)
                else next.set(k, v)
            })
            setParams(next)
        },
        [params, setParams],
    )

    // EL-RESULTS-1: поле ввода прямо на странице, синхронизированное с ?q=.
    // rawInput — то, что в инпуте; в URL `q` пишем с дебаунсом (200мс), как в
    // overlay топбара. Внешние смены ?q= (переход из лупы топбара «показать
    // все» / навигация) подхватываются обратным синком ниже.
    const [rawInput, setRawInput] = useState(q)
    const debTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    // T-018-FE: отмена предыдущего in-flight /search/query при новом фетче.
    const abortRef = useRef<AbortController | null>(null)
    // Последнее значение `q`, которое мы сами записали в URL — чтобы отличать
    // внешнюю смену ?q= от собственной (и не перетирать ввод пользователя).
    const lastPushedRef = useRef(q)

    // Дебаунс ввода → ?q= (сброс page на 0; пустую строку чистим из URL).
    const onQueryInput = useCallback(
        (value: string) => {
            const v = value.slice(0, MAX_QUERY_LEN)
            setRawInput(v)
            if (debTimer.current) clearTimeout(debTimer.current)
            debTimer.current = setTimeout(() => {
                const trimmed = v.trim()
                lastPushedRef.current = trimmed
                setParam({ q: trimmed || null, page: '0' })
            }, DEBOUNCE_MS)
        },
        [setParam],
    )

    // Обратный синк: ?q= изменился извне (не нашей записью) → обновляем инпут.
    useEffect(() => {
        if (q !== lastPushedRef.current) {
            lastPushedRef.current = q
            setRawInput(q)
        }
    }, [q])

    // Чистка таймера дебаунса и in-flight запроса при размонтировании.
    useEffect(() => () => {
        if (debTimer.current) clearTimeout(debTimer.current)
        abortRef.current?.abort()
    }, [])

    const effectiveQuery =
        q.trim().length >= minQueryChars ? q.trim() : ''

    // Запрос ждёт настроек (см. `isSettled`): страница стартует с `?q=` в URL и
    // без ожидания успевала сходить с дефолтным порогом 2 — пользователь видел
    // «нет результатов» под подсказкой «введите минимум 5». Ошибка ручки тоже
    // «settled», поиск на дефолтах работает.
    const swrKey =
        pid && canRead && effectiveQuery && settingsSettled
            ? [
                  '/search/query/full',
                  pid,
                  effectiveQuery,
                  typeFilter,
                  scope,
                  page,
                  pageSize,
              ]
            : null

    const { data, error, isLoading, isValidating, mutate } =
        useSWR<SearchQueryResponse>(
            swrKey,
            () => {
                // T-018-FE: отменяем прежний in-flight запрос перед новым.
                abortRef.current?.abort()
                const ctrl = new AbortController()
                abortRef.current = ctrl
                return apiSearchQuery(
                    {
                        projectId: pid!,
                        query: effectiveQuery,
                        entityTypes: typeFilter ? [typeFilter] : undefined,
                        pageIndex: page,
                        pageSize,
                        perTypeLimit: pageSize,
                        // TODO-262: пресет уходит в контракт (?scope=), а не
                        // живёт только в ключе SWR. Бэкенд сужает им уже
                        // резолвнутый visibility-scope (FR-SEARCH-140/160).
                        scope,
                    },
                    ctrl.signal,
                )
            },
            {
                revalidateOnFocus: false,
                keepPreviousData: true,
                // T-018-FE: грациозная деградация. Отменённый (abort) запрос и
                // 403 MODULE_DISABLED (старый gateway) не должны провоцировать
                // авто-ретраи SWR — ошибка показывается тихо, повтор — вручную.
                shouldRetryOnError: false,
            },
        )

    // EL-RESULTS-3 / ST-12: пресет — реальный фильтр, поэтому показываем только
    // варианты, которые пользователю доступны: «Мой отдел» без отдела в
    // проекции прав всегда вернул бы пусто, а сам пресет бессмыслен для того,
    // кто и так видит только свои записи (mode=restricted && level=only_own).
    const visibility = useVisibilityScope()
    const hasDepartments = (visibility?.departmentIds?.length ?? 0) > 0
    const scopeOptions = useMemo(
        () => SCOPE_OPTIONS.filter((o) => o.value !== 'dept' || hasDepartments),
        [hasDepartments],
    )
    const ownOnly =
        visibility?.mode === 'restricted' && visibility?.level === 'only_own'
    const showScopePreset =
        can('contacts', 'read') && !ownOnly && scopeOptions.length > 1

    const typeChips = useMemo(() => {
        const byType = data?.total_by_type ?? {}
        return (Object.keys(ENTITY_TYPE_LABEL) as SearchEntityType[])
            .map((t) => ({ type: t, count: byType[t] ?? 0 }))
            .filter((c) => c.count > 0 || c.type === typeFilter)
    }, [data, typeFilter])

    // ST-19: нет проекта.
    if (!pid) return <NoProjectState />
    // ST-10: поиск закрыт политикой проекта (deny на `search:read`) — тот же
    // случай, в котором из шапки исчезает лупа.
    if (!canRead)
        return (
            <NoPermissionState message="Поиск отключён политикой проекта (deny на search:read)." />
        )

    return (
        <div className="flex flex-col gap-4" {...qa('search.results.page')}>
            {/* Header / toolbar */}
            <Card>
                <div className="flex flex-col gap-3">
                    <h4 className="flex items-center gap-2">
                        <PiMagnifyingGlassDuotone className="text-primary" />
                        Результаты поиска
                    </h4>
                    {/* EL-RESULTS-1: поле ввода прямо на странице (синхр. с ?q=) */}
                    <Input
                        value={rawInput}
                        onChange={(e) => onQueryInput(e.target.value)}
                        placeholder="Поиск по проекту…"
                        maxLength={MAX_QUERY_LEN}
                        prefix={
                            <PiMagnifyingGlassDuotone className="text-lg text-gray-400" />
                        }
                        {...qa('search.results.input')}
                    />
                    {/* EL-RESULTS-1: строка запроса */}
                    <div className="text-sm text-gray-500" {...qa('search.results.queryHint')}>
                        {effectiveQuery
                            ? `Запрос: «${effectiveQuery}»`
                            : `Введите минимум ${minQueryChars} символа`}
                    </div>

                    {/* EL-RESULTS-3: scope-пресет (ST-12) */}
                    {showScopePreset && (
                        <Segment
                            size="sm"
                            value={scope}
                            onChange={(val) => {
                                const next = Array.isArray(val) ? val[0] : val
                                setParam({
                                    scope: (next as string) || DEFAULT_SCOPE,
                                    page: '0',
                                })
                            }}
                        >
                            {scopeOptions.map((o) => (
                                <Segment.Item
                                    key={o.value}
                                    value={o.value}
                                    {...qa('search.results.scope', { scope: o.value })}
                                >
                                    {o.label}
                                </Segment.Item>
                            ))}
                        </Segment>
                    )}

                    {/* EL-RESULTS-2: chips типов */}
                    {effectiveQuery && (
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setParam({ type: null, page: '0' })}
                                {...qa('search.results.typeAll')}
                            >
                                <Tag
                                    className={
                                        typeFilter === null
                                            ? 'bg-primary text-white'
                                            : ''
                                    }
                                >
                                    Все типы {data ? `(${data.total})` : ''}
                                </Tag>
                            </button>
                            {typeChips.map((c) => (
                                <button
                                    key={c.type}
                                    type="button"
                                    onClick={() =>
                                        setParam({ type: c.type, page: '0' })
                                    }
                                    {...qa('search.results.typeChip', { type: c.type })}
                                >
                                    <Tag
                                        className={
                                            typeFilter === c.type
                                                ? 'bg-primary text-white'
                                                : ''
                                        }
                                    >
                                        {ENTITY_TYPE_LABEL[c.type]} ({c.count})
                                    </Tag>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </Card>

            {/* Основная область */}
            <Card>
                {/* ST-1: первичная загрузка */}
                {isLoading && !data && (
                    <div className="flex flex-col gap-3" {...qa('search.results.loading')}>
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} height={40} />
                        ))}
                    </div>
                )}

                {/* ST-6: ошибка */}
                {error && !data && (
                    <ErrorState
                        message={errMessage(error, 'Не удалось выполнить поиск')}
                        code={errCode(error)}
                        onRetry={() => mutate()}
                        qaId="search.results.error"
                        retryQaId="search.results.retry"
                    />
                )}

                {/* ST-3: до ввода */}
                {!effectiveQuery && !isLoading && (
                    <div
                        className="text-center py-12 text-gray-400 text-sm"
                        {...qa('search.results.hint')}
                    >
                        Уточните поисковый запрос, чтобы увидеть результаты.
                    </div>
                )}

                {/* ST-4: пусто по запросу/фильтру */}
                {effectiveQuery && data && data.total === 0 && (
                    <div
                        className="text-center py-12 text-gray-400"
                        {...qa('search.results.empty')}
                    >
                        <p className="text-sm">
                            Ничего не найдено по «{effectiveQuery}»
                            {typeFilter
                                ? ` среди «${ENTITY_TYPE_LABEL[typeFilter]}»`
                                : ''}
                            .
                        </p>
                        {typeFilter && (
                            <button
                                type="button"
                                className="mt-2 text-sm text-primary"
                                onClick={() => setParam({ type: null, page: '0' })}
                                {...qa('search.results.resetType')}
                            >
                                Сбросить фильтр типа
                            </button>
                        )}
                    </div>
                )}

                {/* data: секции по типам */}
                {data && data.total > 0 && (
                    <div className="relative">
                        {/* ST-2: фоновая загрузка */}
                        {isValidating && (
                            <div
                                className="absolute top-0 right-0"
                                {...qa('search.results.revalidating')}
                            >
                                <Spinner size={18} />
                            </div>
                        )}
                        {data.groups.map((group) => (
                            <div
                                key={group.entity_type}
                                className="mb-5"
                                {...qa('search.results.section', {
                                    type: group.entity_type,
                                })}
                            >
                                <h6 className="text-xs uppercase tracking-wide text-gray-400 mb-2">
                                    {ENTITY_TYPE_LABEL[group.entity_type] ??
                                        group.entity_type}{' '}
                                    <span className="text-gray-300">
                                        ({group.type_total})
                                    </span>
                                </h6>
                                <div className="flex flex-col gap-1">
                                    {group.list.map((hit) => (
                                        <SearchHitLink
                                            key={hit.id}
                                            projectId={pid}
                                            hit={hit}
                                            to={searchHitPath(hit)}
                                            className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                                            qaId="search.results.hit"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate font-medium text-gray-700 dark:text-gray-200">
                                                    <Highlighter
                                                        autoEscape
                                                        searchWords={[
                                                            effectiveQuery,
                                                        ]}
                                                        textToHighlight={
                                                            hit.title ?? ''
                                                        }
                                                        highlightClassName="bg-yellow-200 text-inherit"
                                                    />
                                                </div>
                                                {hit.subtitle && (
                                                    <div className="truncate text-xs text-gray-400">
                                                        {hit.subtitle}
                                                    </div>
                                                )}
                                            </div>
                                            <PiCaretRightDuotone className="text-gray-300" />
                                        </SearchHitLink>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {/* EL-RESULTS-5 / ST-5: пагинация */}
                        <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-3 mt-2">
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-400">На странице:</span>
                                {PAGE_SIZES.map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() =>
                                            setParam({
                                                size: String(s),
                                                page: '0',
                                            })
                                        }
                                        className={
                                            s === pageSize
                                                ? 'font-semibold text-primary'
                                                : 'text-gray-500'
                                        }
                                        {...qa('search.results.pageSize', { size: s })}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <button
                                    type="button"
                                    disabled={page === 0}
                                    onClick={() =>
                                        setParam({ page: String(page - 1) })
                                    }
                                    className="disabled:opacity-40"
                                    {...qa('search.results.pagePrev')}
                                >
                                    ← Назад
                                </button>
                                <span className="text-gray-400">
                                    Стр. {page + 1}
                                </span>
                                <button
                                    type="button"
                                    // TODO-261: «есть следующая страница» —
                                    // ответ бэкенда (`has_more`), а не догадка
                                    // по суммарному total: страница режется
                                    // по КАЖДОМУ типу размером perTypeLimit,
                                    // и клиент этого размера не знает.
                                    disabled={!data.has_more}
                                    onClick={() =>
                                        setParam({ page: String(page + 1) })
                                    }
                                    className="disabled:opacity-40"
                                    {...qa('search.results.pageNext')}
                                >
                                    Вперёд →
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            {/* Футер: ST-13 + ST-28 */}
            <div className="flex items-center justify-between text-xs text-gray-400 px-1">
                <span {...qa('search.results.footer.visibility')}>
                    Данные и счётчики — в рамках вашей видимости.
                </span>
                <span
                    className="flex items-center gap-1"
                    {...qa('search.results.footer.lag')}
                >
                    <PiClockCountdownDuotone />
                    Индекс может обновляться с задержкой
                </span>
            </div>
        </div>
    )
}

export default SearchResults
