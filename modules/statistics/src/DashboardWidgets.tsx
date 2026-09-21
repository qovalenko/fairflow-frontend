/**
 * Виджеты дашборда (EL-DASH-5..15) + контракт деградации врезки
 * (SCR-STATISTICS-WIDGET-FALLBACK). Каждый виджет:
 *  - гейтится правом (`statistics:read` уже на экране; drill — правом целевого
 *    модуля через `PermissionCheck`/disabled-ссылку, FR-MSTAT-24);
 *  - гейтится Contextual UI источника (`softDependsOn ∈ effectiveModules`,
 *    ST-12/ST-17) — при выключенном источнике врезка не рендерится,
 *    KPI-строка перестраивается без дырки (FR-MSTAT-27);
 *  - имеет пустое состояние (EL-WF-1) вместо `null`/фейка (FR-MSTAT-13);
 *  - усекается лимитом + «+N» (EL-WF-4, FR-MSTAT-12/30);
 *  - обёрнут WidgetBoundary (EL-WF-3, ST-8).
 */
import { AdaptiveCard, Card } from '@fairflow/shared-ui'
import ApexChart from 'react-apexcharts'
import { useNavigate } from 'react-router'
import usePermission from '@/utils/hooks/usePermission'
import type { ApexOptions } from 'apexcharts'
import type { DashboardData, Deal, Activity } from '@/@types/crm'
import {
    WidgetEmpty,
    WidgetListFooter,
    drillBase,
    scopeSeesTeam,
    type ScopeLevel,
} from './statistics.shared'
import WidgetBoundary from './WidgetBoundary'
import { qa } from './qa'

// Лимиты списков (FR-MSTAT-12/30, ST-5)
const LIMIT_OVERDUE = 5
const LIMIT_UPCOMING = 5
const LIMIT_RECENT = 10
const LIMIT_STALLED = 5

/** Источник включён в проекте (Contextual UI, ST-17). */
function moduleEnabled(modules: string[], key: string): boolean {
    return modules.includes(key)
}

/**
 * Остаток для подписи «+ ещё N» (TODO-498).
 *
 * Сервер отдаёт списки дашборда УЖЕ усечёнными (≤5/≤10 строк), поэтому
 * `items.length - shown.length` — тождественный ноль, и индикатор не появлялся
 * никогда. Считаем от полного размера среза (`total` из ответа BFF); его нет
 * (старый бэк) — падаем на длину списка, т.е. на прежнее поведение. `Math.max`
 * страхует от `total` меньше уже присланного списка.
 */
export function remainingCount(
    total: number | undefined,
    received: number,
    shown: number,
): number {
    const full = typeof total === 'number' && total > received ? total : received
    return Math.max(0, full - shown)
}

/**
 * Подпись индикатора роста KPI (TODO-504).
 *
 * ЕДИНИЦА: домен отдаёт `growth_rate` ДОЛЕЙ, а не процентами —
 * `(value − previous) / previous` (reports `reports.service.ts#kpiCell`,
 * proto `StatMetricValue.growth_rate`, BFF `statistics-bff.controller.ts`
 * → `growthRate`). Печать доли «как есть» с суффиксом `%` показывала рост
 * 25% как «▲ +0.25%», а треть — как «▲ +0.3333333333333333%».
 * Домножаем на 100 и округляем до одного знака.
 *
 * `|| 0` гасит `-0` (доля −0.0004 округлилась бы в «-0» и дала «▲ +-0%»).
 */
export function formatGrowthRate(rate: number): string {
    const percent = Math.round(rate * 1000) / 10 || 0
    // Отрицательное значение уже несёт «−» само, знак вручную не добавляем.
    return `${percent >= 0 ? '▲ +' : '▼ '}${percent.toLocaleString('ru-RU')}%`
}

/**
 * Есть ли с чем сравнивать текущее значение (TODO-504, вторая половина).
 *
 * Домен считает `growth_rate = previous > 0 ? (value − previous)/previous : 0`
 * (`reports.service.ts#kpiCell`), то есть при ПУСТОМ предыдущем окне отдаёт
 * ровно тот же ноль, что и при «значение не изменилось». По одному
 * `growthRate` эти случаи неразличимы, и свежий проект (previous = 0,
 * value = 42) получал под каждым KPI зелёное «▲ +0%» — рост с нуля,
 * показанный как «роста нет».
 *
 * Индикатор рисуем только когда база сравнения непустая. `previousValue`
 * отсутствует (старая сборка домена) → тоже не рисуем: выдуманных цифр
 * под KPI быть не должно.
 */
export function hasComparableBase(previousValue?: number): boolean {
    return typeof previousValue === 'number' && previousValue > 0
}

/**
 * Скрытые кнопки drill для E2E: сегменты ApexCharts не имеют role/label.
 * Дублируют `dataPointSelection`, не меняя видимый UI.
 */
export function ChartDrillActions<T>({
    qaId,
    items,
    onDrill,
    getTarget,
    getLabel,
}: {
    qaId: string
    items: T[]
    onDrill?: (item: T) => void
    getTarget: (item: T, index: number) => string
    getLabel: (item: T, index: number) => string
}) {
    if (!onDrill || items.length === 0) return null
    return (
        <div className="sr-only" aria-hidden="true">
            {items.map((item, index) => (
                <button
                    key={index}
                    type="button"
                    tabIndex={-1}
                    onClick={() => onDrill(item)}
                    {...qa(qaId, {
                        index,
                        target: getTarget(item, index),
                    })}
                >
                    {getLabel(item, index)}
                </button>
            ))}
        </div>
    )
}

// ── EL-DASH-5..8 KPI-ячейки ───────────────────────────────────────────────────
const KpiCell = ({
    label,
    value,
    previousValue,
    growthRate,
    isCurrency,
    isPercent,
    onDrill,
    canDrill,
}: {
    label: string
    value: number
    /** База сравнения; без неё индикатор роста скрыт (см. `hasComparableBase`). */
    previousValue?: number
    growthRate?: number
    isCurrency?: boolean
    isPercent?: boolean
    onDrill?: () => void
    canDrill?: boolean
}) => {
    const formatted = isCurrency
        ? new Intl.NumberFormat('ru-RU', {
              style: 'currency',
              currency: 'RUB',
              maximumFractionDigits: 0,
          }).format(value)
        : isPercent
          ? `${value}%`
          : value.toLocaleString('ru-RU')

    const drillable = Boolean(onDrill) && canDrill !== false
    return (
        <Card
            className={`flex-1 min-w-[180px] ${drillable ? 'cursor-pointer transition-shadow hover:shadow-md' : ''}`}
            {...qa('statistics.dashboard.kpiCell', { key: label })}
        >
            <div
                onClick={drillable ? onDrill : undefined}
                title={
                    onDrill && !drillable
                        ? 'Нет доступа к списку'
                        : undefined
                }
            >
                <div className="flex flex-col gap-1">
                    <span className="text-sm text-gray-500">{label}</span>
                    <span className="text-2xl font-bold heading-text">
                        {formatted}
                    </span>
                    {typeof growthRate === 'number' &&
                        hasComparableBase(previousValue) && (
                        <span
                            className={`text-xs ${growthRate >= 0 ? 'text-emerald-500' : 'text-red-500'}`}
                            {...qa('statistics.dashboard.kpiGrowth', { key: label })}
                        >
                            {formatGrowthRate(growthRate)}
                        </span>
                    )}
                </div>
            </div>
        </Card>
    )
}

/**
 * KPI-строка (`dashboard.kpi.cell`). Per-ячейка-гейтинг по источнику:
 * deals-ячейки скрыты без deals в `effectiveModules`, orders-ячейка — без
 * orders; строка перестраивается без дырки (FR-MSTAT-27, ST-12/ST-17).
 */
export const KpiRow = ({
    statistics,
    enabledModules,
    routePid,
}: {
    statistics: DashboardData['statistics']
    enabledModules: string[]
    /**
     * pid ИЗ URL (не из store): префикс `/p/:pid` ставится только там, где он
     * реально маршрутизируется (standalone-сборка). См. `drillBase`.
     */
    routePid?: string
}) => {
    const navigate = useNavigate()
    const can = usePermission()
    const dealsOn = moduleEnabled(enabledModules, 'deals')
    const ordersOn = moduleEnabled(enabledModules, 'orders')

    // Префикс `/p/:pid` — только когда он есть в URL (`drillBase`): в host'е
    // маршрута `/p/:pid/deals` не существует, и «сохранение проекта» в ссылке
    // означало 404. Период НЕ эмитим: ни список сделок, ни список
    // продаж его не читают и не могут (у gateway нет фильтра по дате создания —
    // см. `drillTo` в statistics.shared). `?period=` был односторонней ссылкой:
    // адрес обещал срез периода, а открывался полный список.
    const dealsPath = drillBase(routePid, '/deals')
    const ordersPath = drillBase(routePid, '/orders')

    const cells: {
        key: string
        show: boolean
        node: React.ReactNode
    }[] = []

    statistics.forEach((s, i) => {
        // Простая привязка KPI→источник по ключу/индексу: первые 3 — deals,
        // 4-я (orders_in_progress) — orders. Без источника ячейка скрыта.
        const isOrders =
            s.key?.toLowerCase().includes('order') || s.label?.toLowerCase().includes('продаж')
        const sourceOn = isOrders ? ordersOn : dealsOn
        const drillCan = isOrders ? can('orders', 'read') : can('deals', 'read')
        const isPercent = s.label === 'Конверсия' || s.key === 'conversion'
        const isCurrency =
            s.label?.toLowerCase().includes('сумм') ||
            s.label?.toLowerCase().includes('чек') ||
            s.key === 'amount'
        cells.push({
            key: s.key ?? `kpi-${i}`,
            show: sourceOn,
            node: (
                <KpiCell
                    key={s.key ?? `kpi-${i}`}
                    label={s.label}
                    value={s.value}
                    previousValue={s.previousValue}
                    growthRate={s.growthRate}
                    isCurrency={isCurrency}
                    isPercent={isPercent}
                    canDrill={drillCan}
                    onDrill={() =>
                        navigate(isOrders ? ordersPath : dealsPath)
                    }
                />
            ),
        })
    })

    const visible = cells.filter((c) => c.show)
    if (visible.length === 0) {
        return (
            <Card {...qa('statistics.dashboard.kpiEmpty')}>
                <WidgetEmpty
                    title="Нет KPI"
                    hint="Включите модуль Сделки или Продажи в настройках проекта."
                />
            </Card>
        )
    }
    return (
        <div className="flex flex-wrap gap-4" {...qa('statistics.dashboard.kpiRow')}>
            {visible.map((c) => c.node)}
        </div>
    )
}

// ── EL-DASH-9 Воронка ─────────────────────────────────────────────────────────
export const FunnelWidget = ({
    data,
    enabledModules,
    onDrill,
}: {
    data: { stage: string; count: number; amount: number; stageId?: string }[]
    enabledModules: string[]
    /** Drill получает всю строку: id стадии — для фильтра, `stage` — только подпись. */
    onDrill?: (row: { stage: string; stageId?: string }) => void
}) => {
    if (!moduleEnabled(enabledModules, 'deals')) return null // ST-17
    return (
        <WidgetBoundary label="Воронка">
            <AdaptiveCard
                {...qa('statistics.dashboard.funnel', {
                    'drill-targets': data.map((d) => d.stageId ?? '').join('|'),
                })}
            >
                <h5 className="mb-4">Воронка продаж</h5>
                {data.length === 0 ? (
                    <WidgetEmpty
                        hint="Создайте первую сделку в модуле Сделки."
                        state="funnel-empty"
                    />
                ) : (
                    <ApexChart
                        options={
                            {
                                chart: {
                                    type: 'bar',
                                    toolbar: { show: false },
                                    events: {
                                        dataPointSelection: (
                                            _e,
                                            _ctx,
                                            cfg: { dataPointIndex: number },
                                        ) => {
                                            const row =
                                                data[cfg.dataPointIndex]
                                            if (row && onDrill) onDrill(row)
                                        },
                                    },
                                },
                                plotOptions: {
                                    bar: { horizontal: true, borderRadius: 4 },
                                },
                                dataLabels: { enabled: true },
                                xaxis: {
                                    categories: data.map((d) => d.stage ?? '—'),
                                },
                                colors: ['#3B82F6'],
                                tooltip: {
                                    y: {
                                        formatter: (v: number) => `${v} сделок`,
                                    },
                                },
                            } as ApexOptions
                        }
                        series={[
                            { name: 'Сделки', data: data.map((d) => d.count) },
                        ]}
                        type="bar"
                        height={280}
                    />
                )}
                <ChartDrillActions
                    qaId="statistics.dashboard.funnelDrill"
                    items={data}
                    onDrill={onDrill}
                    getTarget={(row) => row.stageId ?? ''}
                    getLabel={(row) => row.stage ?? '—'}
                />
            </AdaptiveCard>
        </WidgetBoundary>
    )
}

// ── EL-DASH-10 Источники ──────────────────────────────────────────────────────
export const SourcesWidget = ({
    data,
    enabledModules,
    onDrill,
}: {
    data: { source: string; count: number; sourceKey?: string }[]
    enabledModules: string[]
    /** Drill получает всю строку: `sourceKey` — id источника для фильтра. */
    onDrill?: (row: { source: string; sourceKey?: string }) => void
}) => {
    if (!moduleEnabled(enabledModules, 'deals')) return null
    return (
        <WidgetBoundary label="Источники">
            <AdaptiveCard
                {...qa('statistics.dashboard.sources', {
                    'drill-targets': data.map((d) => d.sourceKey ?? '').join('|'),
                })}
            >
                <h5 className="mb-4">Сделки по источникам</h5>
                {data.length === 0 ? (
                    <WidgetEmpty
                        hint="Нет данных об источниках за период."
                        state="sources-empty"
                    />
                ) : (
                    <ApexChart
                        options={
                            {
                                chart: {
                                    type: 'donut',
                                    toolbar: { show: false },
                                    events: {
                                        dataPointSelection: (
                                            _e,
                                            _ctx,
                                            cfg: { dataPointIndex: number },
                                        ) => {
                                            const row =
                                                data[cfg.dataPointIndex]
                                            if (row && onDrill) onDrill(row)
                                        },
                                    },
                                },
                                labels: data.map((d) => d.source),
                                legend: { position: 'bottom' },
                                colors: [
                                    '#3B82F6',
                                    '#10B981',
                                    '#F59E0B',
                                    '#8B5CF6',
                                    '#EC4899',
                                    '#6366F1',
                                ],
                            } as ApexOptions
                        }
                        series={data.map((d) => d.count)}
                        type="donut"
                        height={280}
                    />
                )}
                <ChartDrillActions
                    qaId="statistics.dashboard.sourcesDrill"
                    items={data}
                    onDrill={onDrill}
                    getTarget={(row) => row.sourceKey ?? ''}
                    getLabel={(row) => row.source ?? '—'}
                />
            </AdaptiveCard>
        </WidgetBoundary>
    )
}

// ── EL-DASH-11/12/13 Списки активностей ───────────────────────────────────────
const typeIcons: Record<string, string> = {
    task: '📋',
    call: '📞',
    meeting: '🤝',
    note: '📝',
}

const ActivityRow = ({
    a,
    onClick,
    accent,
    kind,
}: {
    a: Activity
    onClick: () => void
    accent?: 'overdue'
    kind?: string
}) => (
    <div
        className={`flex items-center justify-between rounded p-2 mb-1 cursor-pointer ${
            accent === 'overdue'
                ? 'bg-red-50 dark:bg-red-900/20'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
        }`}
        onClick={onClick}
        {...qa('statistics.dashboard.activityRow', {
            activity: a.id,
            kind: kind ?? 'activity',
        })}
    >
        <div className="min-w-0">
            <div className="truncate text-sm">
                {typeIcons[a.type] ?? '•'} {a.title}
            </div>
            {a.dealName && (
                <div className="truncate text-xs text-gray-400">
                    {a.dealName}
                </div>
            )}
        </div>
        <span className="ml-2 shrink-0 text-xs text-gray-500">
            {a.assigneeName ?? ''}
        </span>
    </div>
)

export const ActivityListWidget = ({
    title,
    items,
    limit,
    total,
    enabledModules,
    onDrillItem,
    onDrillAll,
    accent,
    emptyHint,
    listKind,
}: {
    title: string
    items: Activity[]
    limit: number
    /**
     * Полный размер среза на сервере (TODO-498). Список приезжает УЖЕ усечённым
     * лимитом домена, поэтому «+ ещё N» по `items.length` был тождественным
     * нулём. Не передан (старый ответ BFF) → падаем на длину списка, т.е. на
     * прежнее поведение, а не на выдуманное число.
     */
    total?: number
    enabledModules: string[]
    onDrillItem: (id: string) => void
    onDrillAll: () => void
    accent?: 'overdue'
    emptyHint?: string
    listKind?: string
}) => {
    if (!moduleEnabled(enabledModules, 'activities')) return null // ST-17
    const shown = items.slice(0, limit)
    return (
        <WidgetBoundary label={title}>
            <AdaptiveCard
                {...qa('statistics.dashboard.activityList', {
                    kind: listKind ?? title,
                })}
            >
                <h5 className="mb-3">{title}</h5>
                {items.length === 0 ? (
                    <WidgetEmpty
                        hint={emptyHint}
                        state={listKind ? `${listKind}-empty` : 'list-empty'}
                    />
                ) : (
                    <>
                        {shown.map((a) => (
                            <ActivityRow
                                key={a.id}
                                a={a}
                                accent={accent}
                                kind={listKind}
                                onClick={() => onDrillItem(a.id)}
                            />
                        ))}
                        <WidgetListFooter
                            more={remainingCount(
                                total,
                                items.length,
                                shown.length,
                            )}
                            onClick={onDrillAll}
                            label={`Все: ${title.toLowerCase()}`}
                            kind={listKind}
                        />
                    </>
                )}
            </AdaptiveCard>
        </WidgetBoundary>
    )
}

// ── EL-DASH-14 Зависшие сделки ────────────────────────────────────────────────
export const StalledWidget = ({
    items,
    total,
    enabledModules,
    staleDays = 7,
    onDrillItem,
    onDrillAll,
}: {
    items: Deal[]
    /** Полный размер среза до усечения серверным лимитом (TODO-498). */
    total?: number
    enabledModules: string[]
    staleDays?: number
    onDrillItem: (id: string) => void
    /**
     * Переход в полный список «залипших». Опционален осознанно: серверного
     * фильтра «без движения > N дней» у списка сделок нет, поэтому экран-источник
     * (Dashboard) ссылку не даёт — вместо неё остаются поштучные карточки.
     * Подвал со ссылкой рендерится только когда есть куда вести.
     */
    onDrillAll?: () => void
}) => {
    if (!moduleEnabled(enabledModules, 'deals')) return null
    const shown = items.slice(0, LIMIT_STALLED)
    const more = remainingCount(total, items.length, shown.length)
    return (
        <WidgetBoundary label="Зависшие сделки">
            <AdaptiveCard {...qa('statistics.dashboard.stalledList')}>
                <h5 className="mb-1">Зависшие сделки</h5>
                <div className="mb-3 text-xs text-gray-400">
                    без движения &gt; {staleDays} дней
                </div>
                {items.length === 0 ? (
                    <WidgetEmpty hint="Все сделки в движении." state="stalled-empty" />
                ) : (
                    <>
                        {shown.map((d) => (
                            <div
                                key={d.id}
                                className="flex items-center justify-between rounded p-2 mb-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                onClick={() => onDrillItem(d.id)}
                                {...qa('statistics.dashboard.stalledRow', { deal: d.id })}
                            >
                                <span className="truncate text-sm">{d.name}</span>
                                <span className="ml-2 shrink-0 text-xs text-gray-500">
                                    {(d.amount / 1000).toFixed(0)}K ₽
                                </span>
                            </div>
                        ))}
                        {/* Подвал нужен, когда есть куда вести ИЛИ есть что
                            сообщить: «+ ещё N» без ссылки — честный остаток
                            (кнопка неактивна), а не обещание полного списка. */}
                        {(onDrillAll || more > 0) && (
                            <WidgetListFooter
                                more={more}
                                onClick={onDrillAll}
                                label="Все зависшие сделки"
                                kind="stalled"
                            />
                        )}
                    </>
                )}
            </AdaptiveCard>
        </WidgetBoundary>
    )
}

// ── EL-DASH-15 Топ менеджеров (scope ≥ own_and_subordinates) ──────────────────
export const ManagersWidget = ({
    data,
    enabledModules,
    scopeLevel,
    grouping = 'user',
    onDrill,
}: {
    data: DashboardData['topManagers']
    enabledModules: string[]
    scopeLevel?: ScopeLevel
    /** FR-STAT-360: свёртка team в подразделения меняет колонку «кто». */
    grouping?: DashboardData['teamGrouping']
    /**
     * Drill получает всю строку: фильтровать целевой список нужно по `ownerId`
     * (display-имя целевой список сматчить не может, FR-MSTAT-24). Если id в
     * ответе нет — строка не кликабельна, а не ведёт в несфильтрованный список.
     */
    onDrill?: (row: DashboardData['topManagers'][number]) => void
}) => {
    if (!moduleEnabled(enabledModules, 'deals')) return null
    // ST-12: ниже scope-порога таблица скрыта (OQ-UX-STATISTICS-19).
    if (!scopeSeesTeam(scopeLevel)) return null
    const byDepartment = grouping === 'department'
    return (
        <WidgetBoundary label={byDepartment ? 'Продажи по отделам' : 'Топ менеджеров'}>
            <AdaptiveCard {...qa('statistics.analytics.teamTable')}>
                <h5 className="mb-4">
                    {byDepartment ? 'Продажи по отделам' : 'Топ менеджеров'}
                </h5>
                {data.length === 0 ? (
                    <WidgetEmpty
                        hint={
                            byDepartment
                                ? 'Нет данных по отделам за период.'
                                : 'Нет данных по менеджерам за период.'
                        }
                        state="slice-empty"
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="py-2 text-left font-semibold">
                                        {byDepartment ? 'Отдел' : 'Менеджер'}
                                    </th>
                                    <th className="py-2 text-right font-semibold">
                                        Сделок
                                    </th>
                                    <th className="py-2 text-right font-semibold">
                                        Сумма
                                    </th>
                                    <th className="py-2 text-right font-semibold">
                                        Конв.
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((m, i) => {
                                    const drillable = Boolean(onDrill && m.ownerId)
                                    return (
                                    <tr
                                        key={m.ownerId || m.departmentId || i}
                                        className={`border-b last:border-0 ${
                                            drillable
                                                ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                                : ''
                                        }`}
                                        title={
                                            drillable
                                                ? 'Открыть сделки менеджера'
                                                : undefined
                                        }
                                        onClick={
                                            drillable
                                                ? () => onDrill?.(m)
                                                : undefined
                                        }
                                        {...qa('statistics.analytics.teamRow', {
                                            owner: m.ownerId ?? `row-${i}`,
                                        })}
                                    >
                                        <td className="py-2 font-medium">
                                            {m.name}
                                        </td>
                                        <td className="py-2 text-right">
                                            {m.deals}
                                        </td>
                                        <td className="py-2 text-right">
                                            {(m.amount / 1000).toFixed(0)}K ₽
                                        </td>
                                        <td className="py-2 text-right">
                                            {m.conversion}%
                                        </td>
                                    </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </AdaptiveCard>
        </WidgetBoundary>
    )
}

// ── EL-ANL-9 Срез по отделам (by_department, FR-MSTAT-28) ─────────────────────
/**
 * Домен уже считает `by_department` и gateway отдаёт его в `/api/v1/statistics`
 * (`byDepartment[]`) — до этого срез молча отбрасывался мэппером и не имел
 * экрана. Таблица read-only: drill по отделу целевой список сделок пока не
 * поддерживает (нет фильтра по departmentId), поэтому ссылки нет — вместо
 * заведомо несфильтрованного перехода.
 */
export const DepartmentsWidget = ({
    data,
    enabledModules,
    scopeLevel,
}: {
    data: NonNullable<DashboardData['byDepartment']>
    enabledModules: string[]
    scopeLevel?: ScopeLevel
}) => {
    if (!moduleEnabled(enabledModules, 'deals')) return null // ST-17
    // ST-12: ниже scope-порога срез по отделам скрыт (как и «команда»).
    if (!scopeSeesTeam(scopeLevel)) return null
    return (
        <WidgetBoundary label="Отделы">
            <AdaptiveCard {...qa('statistics.analytics.departmentsTable')}>
                <h5 className="mb-4">Продажи по отделам</h5>
                {data.length === 0 ? (
                    <WidgetEmpty hint="Нет данных по отделам за период." state="slice-empty" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="py-2 text-left font-semibold">
                                        Отдел
                                    </th>
                                    <th className="py-2 text-right font-semibold">
                                        Сделок
                                    </th>
                                    <th className="py-2 text-right font-semibold">
                                        Сумма
                                    </th>
                                    <th className="py-2 text-right font-semibold">
                                        Средний чек
                                    </th>
                                    <th className="py-2 text-right font-semibold">
                                        Менеджеров
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((d, i) => (
                                    <tr
                                        key={d.departmentId || i}
                                        className="border-b last:border-0"
                                        {...qa('statistics.analytics.departmentsRow', {
                                            department: d.departmentId ?? `row-${i}`,
                                        })}
                                    >
                                        <td className="py-2 font-medium">
                                            {d.name}
                                        </td>
                                        <td className="py-2 text-right">
                                            {d.deals}
                                        </td>
                                        <td className="py-2 text-right">
                                            {(d.amount / 1000).toFixed(0)}K ₽
                                        </td>
                                        <td className="py-2 text-right">
                                            {(d.avgCheck / 1000).toFixed(1)}K ₽
                                        </td>
                                        <td className="py-2 text-right">
                                            {d.managersCount}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </AdaptiveCard>
        </WidgetBoundary>
    )
}
