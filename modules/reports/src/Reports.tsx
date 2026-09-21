import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router'
import useSWR from 'swr'
import {
    PiTrendUpDuotone,
    PiTrendDownDuotone,
    PiDownloadSimpleDuotone,
    PiWrenchDuotone,
    PiClockCountdownDuotone,
    PiInfoDuotone,
    PiWifiSlashDuotone,
    PiArrowLeftDuotone,
    PiTrashDuotone,
    PiPencilDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Tabs from '@/components/ui/Tabs'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import Tooltip from '@/components/ui/Tooltip'
import toast from '@/components/ui/toast'
import Chart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'
import { useThemeStore } from '@/store/themeStore'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { useVisibilityScope } from '@/utils/hooks/usePermissionStatus'
import { useProjectStore, getEnabledModules } from '@/store/projectStore'
import {
    apiListReports,
    apiGetReport,
    apiDeleteReport,
    apiRunReport,
    apiExportReport,
    downloadExport,
    coverageLabel,
    formatRub,
    formatDateTime,
    presetEnabled,
    PRESETS,
    PERIOD_OPTIONS,
    type PresetKey,
    type RunPeriod,
    type RunParams,
    type Report,
    type RunResult,
    type ReportTotalCard,
    type VizType,
} from '@/services/ReportsService'
import {
    NoPermissionState,
    NoPresetsState,
    EmptyDataState,
    EmptyFilterState,
    ModuleSourceDisabledState,
    ErrorState,
    errMessage,
    isModuleDisabledError,
} from './shared'
import DrillDownPanel, { type DrillContext } from './DrillDownPanel'
import {
    mergeReportsFilters,
    reportsFiltersForTab,
} from './reportsFilterStorage'
import { qa } from './qa'

const { TabNav, TabList } = Tabs

/** Custom-отчёт прогоняется без срез-фильтров вкладок (их UI здесь не показан). */
const NO_PARAMS: RunParams = {}

// ─── Метрика-карточка (реиспользуемая, SCREENS §15) ──────────────────────────

const MetricCard = ({
    card,
    onDrill,
}: {
    card: ReportTotalCard
    onDrill?: () => void
}) => {
    const formatted = card.isCurrency
        ? formatRub(card.value)
        : card.suffix
          ? `${card.value}${card.suffix}`
          : card.value.toLocaleString('ru-RU')

    return (
        <AdaptiveCard
            className={`flex-1 min-w-[180px] ${onDrill ? 'cursor-pointer hover:ring-1 hover:ring-blue-300' : ''}`}
            onClick={onDrill}
            {...qa('reports.preset.kpi', { key: card.key })}
        >
            <div className="flex flex-col gap-1">
                <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    {card.label}
                    {/* EL-PRESET-5: тултип формулы */}
                    {card.formula && (
                        <Tooltip title={card.formula}>
                            <PiInfoDuotone
                                className="w-3.5 h-3.5 text-gray-400"
                                {...qa('reports.preset.formulaTooltip', { key: card.key })}
                            />
                        </Tooltip>
                    )}
                </span>
                <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {formatted}
                </span>
                {/* EL-PRESET-2/9: тренд/PoP — только если be прислал growth */}
                {typeof card.growth === 'number' && (
                    <span
                        className={`text-xs flex items-center gap-1 ${
                            card.growth >= 0 ? 'text-emerald-500' : 'text-red-500'
                        }`}
                    >
                        {card.growth >= 0 ? <PiTrendUpDuotone /> : <PiTrendDownDuotone />}
                        {card.growth >= 0 ? '+' : ''}
                        {card.growth}%
                    </span>
                )}
            </div>
        </AdaptiveCard>
    )
}

// ─── Диаграмма пресета (EL-PRESET-3) ─────────────────────────────────────────

const PresetChart = ({
    chart,
    mode,
}: {
    chart: NonNullable<RunResult['chart']>
    mode: 'light' | 'dark'
}) => {
    const apexType: Exclude<VizType, 'table' | 'funnel'> =
        chart.type === 'funnel' || chart.type === 'table'
            ? 'bar'
            : (chart.type as Exclude<VizType, 'table' | 'funnel'>)

    const options: ApexOptions = {
        chart: { type: apexType, toolbar: { show: false } },
        theme: { mode },
        xaxis: { categories: chart.categories ?? [] },
        // Круговая диаграмма подписывается `labels`, а не `xaxis.categories`:
        // без этого секторы «По источникам»/«По активности» подписывались
        // порядковыми номерами.
        ...(apexType === 'pie' ? { labels: chart.categories ?? [] } : {}),
        colors: ['#3B82F6', '#10B981', '#EF4444', '#8B5CF6'],
        legend: { position: 'top' },
        dataLabels: { enabled: apexType === 'bar' },
        tooltip: { shared: true, intersect: false },
    }
    const series =
        apexType === 'pie'
            ? (chart.series?.[0]?.data ?? [])
            : (chart.series ?? [])

    return (
        <Chart
            options={options}
            series={series as never}
            type={apexType}
            height={320}
        />
    )
}

// ─── Содержимое пресета (SCR-REPORTS-PRESET) ─────────────────────────────────

const PresetView = ({
    report,
    presetKey,
    runMode,
    period,
    params,
    canExport,
    onResetFilter,
    hasActiveFilter,
    onDrill,
    onOptions,
}: {
    report: Report
    /** Пресет вкладки. Не задан — custom-отчёт (SCR-REPORTS-LIST → открытие). */
    presetKey?: PresetKey
    /** preset | depts (SCR-REPORTS-DEPTS — режим by_managers). */
    runMode?: PresetKey | 'depts'
    period: RunPeriod
    params: RunParams
    canExport: boolean
    onResetFilter: () => void
    hasActiveFilter: boolean
    onDrill: (ctx: DrillContext) => void
    /** Лифтит scope-aware опции фильтров (менеджеры/отделы) из ответа Run. */
    onOptions?: (opts: {
        managerOptions?: { id: string; name: string }[]
        departmentOptions?: { id: string; name: string }[]
        coverage?: RunResult['coverage']
    }) => void
}) => {
    const pid = useCurrentProjectId()
    const mode = useThemeStore((s) => s.mode) as 'light' | 'dark'
    const [view, setView] = useState<'table' | 'chart'>('chart')
    const [exporting, setExporting] = useState(false)
    const [pageIndex, setPageIndex] = useState(0)

    const runParams = useMemo<RunParams>(
        () => ({ ...params, period, pageIndex, pageSize: 25 }),
        [params, period, pageIndex],
    )

    useEffect(() => {
        setPageIndex(0)
    }, [report.id, presetKey, runMode, period, JSON.stringify(params)])

    const swrKey = pid
        ? [
              '/reports/run',
              pid,
              report.id,
              runMode ?? 'custom',
              period,
              JSON.stringify(params),
              pageIndex,
          ]
        : null

    const { data, isLoading, isValidating, error, mutate } = useSWR(
        swrKey,
        () =>
            apiRunReport(report.id, { params: runParams }, { projectId: pid! }, runMode),
        { revalidateOnFocus: false, keepPreviousData: true, shouldRetryOnError: false },
    )

    // Лифт scope-aware опций фильтров наверх (EL-MAIN-9 — реальная видимость).
    useEffect(() => {
        if (data && onOptions) {
            onOptions({
                managerOptions: data.managerOptions,
                departmentOptions: data.departmentOptions,
                coverage: data.coverage,
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data])

    const drillTarget: DrillContext['target'] =
        presetKey === 'activity' ? 'activities' : 'deals'

    // ST-17: источник выключен (FAILED_PRECONDITION 409)
    if (error && isModuleDisabledError(error)) {
        return <ModuleSourceDisabledState />
    }
    // ST-6: ошибка загрузки + retry
    if (error) {
        return (
            <ErrorState
                message={errMessage(error, 'Не удалось построить отчёт')}
                onRetry={() => mutate()}
            />
        )
    }
    // ST-1: первичная загрузка
    if (isLoading || !data) {
        return (
            <div className="flex flex-col gap-4" {...qa('reports.preset.skeleton')}>
                <div className="flex flex-wrap gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} height={92} className="flex-1 min-w-[180px] rounded-xl" />
                    ))}
                </div>
                <Skeleton height={320} className="rounded-xl" />
            </div>
        )
    }

    const cards = data.cards ?? []
    const table = data.table
    const chart = data.chart
    const hasNoData =
        (!table || table.rows.length === 0) &&
        (!chart || (chart.series?.[0]?.data.length ?? 0) === 0) &&
        cards.every((c) => c.value === 0)

    // ST-3 / ST-4: нет данных (различаем фильтр)
    if (hasNoData) {
        return hasActiveFilter ? (
            <EmptyFilterState onReset={onResetFilter} />
        ) : (
            <EmptyDataState
                message={
                    runMode === 'depts'
                        ? 'Нет данных за период по отделам.'
                        : 'Нет данных за период. Добавьте записи в CRM.'
                }
            />
        )
    }

    const coverage = coverageLabel(data.coverage)
    // Домен разворачивает ячейку в СДЕЛКИ по своим измерениям (стадия/менеджер/
    // отдел/источник). Срез сам сообщает, попадает ли его измерение в этот набор.
    const canDrill = data.drillable !== false

    return (
        <div className="relative flex flex-col gap-4" {...qa('reports.preset.content')}>
            {/* ST-2: фоновая загрузка поверх */}
            {isValidating && !isLoading && (
                <div
                    className="absolute right-1 top-1 z-10 text-xs text-gray-400 bg-white/70 dark:bg-gray-800/70 px-2 py-0.5 rounded"
                    {...qa('reports.preset.validating')}
                >
                    Обновление…
                </div>
            )}

            {/* Шапка пресета: свежесть + scope-note + coverage (EL-MAIN-15 / EL-PRESET-13) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium flex items-center gap-1.5" {...qa('reports.preset.updatedAt')}>
                        <PiClockCountdownDuotone className="w-4 h-4 text-gray-400" />
                        Обновлено {formatDateTime(data.generatedAt)}
                    </span>
                    {coverage && (
                        <span className="text-xs text-gray-500">{coverage}</span>
                    )}
                    {data.scopeNote && (
                        <span className="text-xs text-gray-400">{data.scopeNote}</span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {/* EL-MAIN-12: переключатель таблица↔диаграмма */}
                    {chart && (
                        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm" {...qa('reports.preset.viewToggle')}>
                            <button
                                type="button"
                                className={`px-3 py-1 ${view === 'chart' ? 'bg-blue-500 text-white' : ''}`}
                                onClick={() => setView('chart')}
                                {...qa('reports.preset.viewChart')}
                            >
                                Диаграмма
                            </button>
                            <button
                                type="button"
                                className={`px-3 py-1 ${view === 'table' ? 'bg-blue-500 text-white' : ''}`}
                                onClick={() => setView('table')}
                                {...qa('reports.preset.viewTable')}
                            >
                                Таблица
                            </button>
                        </div>
                    )}
                    {/* EL-PRESET-10: экспорт — ST-11 скрыт без права */}
                    {canExport && (
                        <Button
                            size="sm"
                            variant="default"
                            icon={<PiDownloadSimpleDuotone />}
                            loading={exporting}
                            {...qa('reports.preset.export')}
                            onClick={async () => {
                                if (!pid) return
                                setExporting(true)
                                try {
                                    const res = await apiExportReport(
                                        report.id,
                                        { format: 'csv', params: runParams },
                                        { projectId: pid },
                                    )
                                    downloadExport(res)
                                    toast.push('Файл готов')
                                } catch (e) {
                                    toast.push(errMessage(e, 'Не удалось экспортировать'))
                                } finally {
                                    setExporting(false)
                                }
                            }}
                        >
                            Экспорт
                        </Button>
                    )}
                </div>
            </div>

            {/* KPI-карточки (EL-PRESET-1) */}
            {cards.length > 0 && (
                <div className="flex flex-wrap gap-4">
                    {cards
                        .filter((c) => c.value !== 0 || cards.length <= 5)
                        .map((c) => (
                            <MetricCard key={c.key} card={c} />
                        ))}
                </div>
            )}

            {/* Диаграмма / таблица (ST-8: при отсутствии одного — деградация) */}
            {view === 'chart' && chart ? (
                <AdaptiveCard {...qa('reports.preset.chart')}>
                    <PresetChart chart={chart} mode={mode} />
                </AdaptiveCard>
            ) : table && table.rows.length > 0 ? (
                <AdaptiveCard {...qa('reports.preset.table')}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b">
                                    {table.columns.map((col) => (
                                        <th
                                            key={col.key}
                                            className={`py-2 px-3 font-semibold ${col.numeric ? 'text-right' : 'text-left'}`}
                                        >
                                            {col.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {table.rows.map((row, ri) => {
                                    // FR-REPORTS-100: бенчмарк отдела — только сравнение, не drill.
                                    const isBenchmark =
                                        row.__row_kind === 'department_benchmark' ||
                                        row.__manager_id === '__dept_benchmark__'
                                    const rowDrillable = canDrill && !isBenchmark
                                    return (
                                    <tr
                                        key={ri}
                                        className={`border-b last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800 ${rowDrillable ? 'cursor-pointer' : ''}`}
                                        {...qa('reports.preset.tableRow', {
                                            index: ri,
                                            drillable: rowDrillable ? 'yes' : 'no',
                                            ...(isBenchmark
                                                ? { rowKind: 'department_benchmark' }
                                                : {}),
                                        })}
                                        onClick={() => {
                                            // EL-PRESET-4/8 / EL-DEPTS-1: drill по строке.
                                            // Срез, измерение которого домен не
                                            // разворачивает (например, день),
                                            // некликабелен — иначе INVALID_ARGUMENT.
                                            if (!rowDrillable) return
                                            const dimCol = table.columns[0]
                                            // Реальное id-значение ячейки: скрытое
                                            // __<dim> (by_managers/depts) или сам ключ.
                                            const hiddenKey = `__${dimCol.key}`
                                            const cellValue =
                                                (row[hiddenKey] as string | number) ??
                                                (row[dimCol.key] as string | number)
                                            onDrill({
                                                reportId: report.id,
                                                cell: {
                                                    dimension: data.primaryDimension ?? dimCol.key,
                                                    value: cellValue,
                                                },
                                                label: String(row[dimCol.key] ?? ''),
                                                target: drillTarget,
                                                aggregate:
                                                    typeof row['count'] === 'number'
                                                        ? (row['count'] as number)
                                                        : undefined,
                                                params: runParams,
                                            })
                                        }}
                                    >
                                        {table.columns.map((col) => {
                                            const val = row[col.key]
                                            const display =
                                                col.currency && typeof val === 'number'
                                                    ? formatRub(val)
                                                    : (val ?? '—')
                                            return (
                                                <td
                                                    key={col.key}
                                                    className={`py-2 px-3 ${col.numeric ? 'text-right' : 'text-left'}`}
                                                >
                                                    {display}
                                                </td>
                                            )
                                        })}
                                    </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                    {data.aggregatePagination &&
                        data.aggregatePagination.totalGroups >
                            data.aggregatePagination.pageSize && (
                            <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
                                <span>
                                    Группы{' '}
                                    {data.aggregatePagination.pageIndex *
                                        data.aggregatePagination.pageSize +
                                        1}
                                    –
                                    {Math.min(
                                        (data.aggregatePagination.pageIndex + 1) *
                                            data.aggregatePagination.pageSize,
                                        data.aggregatePagination.totalGroups,
                                    )}{' '}
                                    из {data.aggregatePagination.totalGroups}
                                </span>
                                <div className="flex gap-2">
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        disabled={data.aggregatePagination.pageIndex <= 0}
                                        onClick={() =>
                                            setPageIndex((p) => Math.max(0, p - 1))
                                        }
                                        {...qa('reports.preset.pagePrev')}
                                    >
                                        Назад
                                    </Button>
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        disabled={
                                            (data.aggregatePagination.pageIndex + 1) *
                                                data.aggregatePagination.pageSize >=
                                            data.aggregatePagination.totalGroups
                                        }
                                        onClick={() => setPageIndex((p) => p + 1)}
                                        {...qa('reports.preset.pageNext')}
                                    >
                                        Вперёд
                                    </Button>
                                </div>
                            </div>
                        )}
                </AdaptiveCard>
            ) : (
                // ST-8 partial: ни таблицы, ни диаграммы в выбранном виде
                <EmptyDataState message="Нет визуализации для этого отчёта." />
            )}
        </div>
    )
}

// ─── Главный экран (SCR-REPORTS-MAIN) ────────────────────────────────────────

const Reports = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const location = useLocation()
    const can = usePermission()
    const canRead = can('reports', 'read')
    const canExport = can('reports', 'export')
    const canManage = can('reports', 'manage')
    const visibilityScope = useVisibilityScope()

    const currentProject = useProjectStore((s) => s.currentProject)
    const enabledModules = useMemo(
        () => getEnabledModules(currentProject),
        [currentProject],
    )

    // Доступные пресеты — Contextual UI (EL-MAIN-3..8); my_overdue только для Member.
    const availablePresets = useMemo(
        () =>
            PRESETS.filter((p) => {
                if (!presetEnabled(p, enabledModules)) return false
                if (p.key === 'my_overdue') {
                    return visibilityScope?.level === 'only_own'
                }
                return true
            }),
        [enabledModules, visibilityScope?.level],
    )

    // deep-link ?tab= (TO-BE), fallback на первый доступный (ST-9)
    const search = new URLSearchParams(location.search)
    const requestedTab = search.get('tab') as PresetKey | null
    const initialTab =
        requestedTab && availablePresets.some((p) => p.key === requestedTab)
            ? requestedTab
            : (availablePresets[0]?.key ?? 'sales')

    const [activeTab, setActiveTab] = useState<PresetKey>(initialTab)
    const [period, setPeriod] = useState<RunPeriod>(
        () => reportsFiltersForTab(pid, initialTab).period,
    )
    const [drill, setDrill] = useState<DrillContext | null>(null)

    // ── C4 фильтры (EL-MAIN-9..11): реальные параметры RunReport ──
    const [managerIds, setManagerIds] = useState<string[]>([])
    const [pipelineId, setPipelineId] = useState(
        () => reportsFiltersForTab(pid, initialTab).pipelineId,
    )
    const [boundPid, setBoundPid] = useState(pid)
    const [boundTab, setBoundTab] = useState<PresetKey>(initialTab)
    // ── C4 режим «Сравнение отделов» внутри вкладки «По менеджерам» (EL-MAIN-8a) ──
    const [deptsMode, setDeptsMode] = useState(false)

    // scope-aware опции фильтров + охват, лифтятся из ответа Run (by_managers/depts).
    const [filterOpts, setFilterOpts] = useState<{
        managerOptions?: { id: string; name: string }[]
        departmentOptions?: { id: string; name: string }[]
        coverage?: RunResult['coverage']
    }>({})

    // ST-9: неизвестный/недоступный ?tab → первый доступный
    useEffect(() => {
        if (!availablePresets.some((p) => p.key === activeTab) && availablePresets[0]) {
            setActiveTab(availablePresets[0].key)
        }
    }, [availablePresets, activeTab])

    // Смена вкладки/проекта → срез-зависимые фильтры; воронка уже из persist (выше).
    useEffect(() => {
        setManagerIds([])
        setFilterOpts({})
        if (activeTab !== 'by_managers') setDeptsMode(false)
    }, [activeTab, pid])

    const persistPeriod = (next: RunPeriod) => {
        setPeriod(next)
        if (pid) mergeReportsFilters(pid, { period: next })
    }

    const persistPipelineId = (next: string) => {
        setPipelineId(next)
        if (pid) mergeReportsFilters(pid, { pipelines: { [activeTab]: next } })
    }

    // Список определений: сопоставляем пресет → конкретный report.id
    const swrKey = pid && canRead ? ['/reports', pid] : null
    const { data, isLoading, error, mutate } = useSWR(
        swrKey,
        () => apiListReports({ projectId: pid!, pageSize: 100 }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const reports = useMemo(() => data?.list ?? [], [data])

    // SCR-REPORTS-LIST: сохранённые пользовательские отчёты (конструктор пишет
    // kind:'custom'); встроенные (сид-определения) стоят за вкладками-пресетами.
    const customReports = useMemo(
        () => reports.filter((r) => r.kind === 'custom'),
        [reports],
    )
    const builtinReports = useMemo(
        () => reports.filter((r) => r.kind !== 'custom'),
        [reports],
    )

    // ── deep-link ?custom=<id> (редирект конструктора после сохранения) ──
    const customId = search.get('custom')
    const [deletingId, setDeletingId] = useState<string | null>(null)

    // Открытие custom-отчёта: GET /api/v1/reports/:id (право reports:read).
    // Отдельным запросом, а не поиском по списку: ссылка должна открываться и
    // тогда, когда отчёт не попал в первую страницу списка.
    const customSwrKey = pid && canRead && customId ? ['/reports/one', pid, customId] : null
    const {
        data: customReport,
        error: customError,
        isLoading: customLoading,
        mutate: mutateCustom,
    } = useSWR(
        customSwrKey,
        () => apiGetReport(customId!, { projectId: pid! }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // Реальные параметры RunReport (только сужают в пределах scope, S2/FR-MREP-4).
    const params: RunParams = useMemo(() => {
        const p: RunParams = {}
        if (managerIds.length) p.managerIds = managerIds
        if (pipelineId.trim()) p.pipelineId = pipelineId.trim()
        return p
    }, [managerIds, pipelineId])

    // Сопоставление presetKey → определение (TODO-248): строго по ключу.
    // be сеет все шесть пресетов с presetKey, gateway домапливает preset_key →
    // presetKey, поэтому индексной эвристики здесь быть не должно: она молча
    // подменяла вкладку чужим отчётом (пользователь видел не то, что выбрал).
    // Нет определения с этим ключом — честное пустое состояние вкладки.
    const reportFor = (key: PresetKey): Report | undefined =>
        builtinReports.find((r) => r.presetKey === key)

    // FR-REPORTS-180: гидратация после всех хуков, до commit.
    // Иначе первый RunReport уходит с month / пустой воронкой.
    if (pid !== boundPid || activeTab !== boundTab) {
        const next = reportsFiltersForTab(pid, activeTab)
        setPeriod(next.period)
        setPipelineId(next.pipelineId)
        setBoundPid(pid)
        setBoundTab(activeTab)
    }

    // ── ST-10: нет права на раздел ──
    if (!canRead) {
        return (
            <Container className="min-h-0">
                <NoPermissionState message="Нет права reports:read." />
            </Container>
        )
    }

    const periodOption =
        PERIOD_OPTIONS.find((o) => o.value === period) ?? PERIOD_OPTIONS[2]

    const activeReport = reportFor(activeTab)
    const activeTabLabel =
        availablePresets.find((p) => p.key === activeTab)?.label ?? 'Отчёт'

    // Текущий режим прогона: depts только во вкладке by_managers.
    const runMode: PresetKey | 'depts' =
        activeTab === 'by_managers' && deptsMode ? 'depts' : activeTab

    // Навигация каталога: путь сохраняем (host — `/reports`, path-isolation — `/p/:pid/reports`).
    const openCustom = (id: string) =>
        navigate(`${location.pathname}?custom=${encodeURIComponent(id)}`)
    const editCustom = (id: string) =>
        navigate(`/reports/builder?edit=${encodeURIComponent(id)}`)
    const closeCustom = () => navigate(location.pathname)

    // DELETE /api/v1/reports/:id — право reports:manage (то же, что проверит gateway),
    // и только для kind==='custom' (встроенные домен всё равно отклонит).
    const removeCustom = async (report: Report) => {
        if (!pid) return
        if (!window.confirm(`Удалить отчёт «${report.name}»?`)) return
        setDeletingId(report.id)
        try {
            await apiDeleteReport(report.id, { projectId: pid })
            toast.push('Отчёт удалён')
            if (customId === report.id) {
                closeCustom()
            }
            await mutate()
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось удалить отчёт'))
        } finally {
            setDeletingId(null)
        }
    }

    const hasActiveFilter = managerIds.length > 0 || pipelineId.trim().length > 0

    // EL-MAIN-9: фильтр менеджеров доступен, только если scope даёт >1 менеджера
    // (для only_own — нет смысла; скрываем). Источник опций = ответ Run (видимость).
    const managerFilterOptions = filterOpts.managerOptions ?? []
    const showManagerFilter = managerFilterOptions.length > 1
    // Воронка применима к sales/funnel/sources/by_managers (EL-MAIN-10).
    const showPipelineFilter = ['sales', 'funnel', 'sources', 'by_managers'].includes(
        activeTab,
    )

    const resetFilters = () => {
        setManagerIds([])
        persistPipelineId('')
    }

    return (
        <Container className="min-h-0">
            <div className="flex flex-col gap-4 text-gray-900 dark:text-gray-100" {...qa('reports.main.root')}>
                {/* Toolbar: заголовок + период + конструктор */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100" {...qa('reports.main.title')}>Отчёты</h3>
                    <div className="flex items-center gap-2">
                        {/* offline-индикатор (ST-27) */}
                        {typeof navigator !== 'undefined' && !navigator.onLine && (
                            <span
                                className="inline-flex items-center gap-1 text-xs text-amber-500"
                                {...qa('reports.main.offline')}
                            >
                                <PiWifiSlashDuotone className="w-4 h-4" />
                                нет сети, данные могут быть устаревшими
                            </span>
                        )}
                        <div className="w-[200px]" {...qa('reports.main.period')}>
                            <Select
                                options={PERIOD_OPTIONS}
                                value={periodOption}
                                onChange={(o) => persistPeriod((o?.value as RunPeriod) ?? 'month')}
                                formatOptionLabel={(option) => (
                                    <span {...qa('reports.main.periodOption', { period: option.value })}>
                                        {option.label}
                                    </span>
                                )}
                            />
                        </div>
                        {/* EL-MAIN-14: вход в конструктор — ST-11 скрыт без manage */}
                        {canManage && (
                            <Button
                                variant="default"
                                icon={<PiWrenchDuotone />}
                                onClick={() => navigate('/reports/builder')}
                                {...qa('reports.main.builder')}
                            >
                                Конструктор
                            </Button>
                        )}
                    </div>
                </div>

                {/* SCR-REPORTS-LIST: открытый custom-отчёт (deep-link ?custom=<id>) */}
                {customId ? (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <Button
                                size="sm"
                                variant="plain"
                                icon={<PiArrowLeftDuotone />}
                                onClick={closeCustom}
                                {...qa('reports.custom.back')}
                            >
                                Все отчёты
                            </Button>
                            {customReport && (
                                <div className="flex flex-col min-w-0">
                                    <span className="font-semibold truncate">
                                        {customReport.name}
                                    </span>
                                    {customReport.description && (
                                        <span className="text-xs text-gray-400 truncate">
                                            {customReport.description}
                                        </span>
                                    )}
                                </div>
                            )}
                            {/* ST-11: удаление — по тому же праву, что проверит gateway */}
                            {canManage && customReport?.kind === 'custom' && (
                                <>
                                    <Button
                                        size="sm"
                                        variant="plain"
                                        icon={<PiPencilDuotone />}
                                        onClick={() => editCustom(customReport.id)}
                                        {...qa('reports.custom.edit')}
                                    >
                                        Редактировать
                                    </Button>
                                    <Button
                                        className="ml-auto"
                                        size="sm"
                                        variant="plain"
                                        icon={<PiTrashDuotone />}
                                        loading={deletingId === customReport.id}
                                        onClick={() => removeCustom(customReport)}
                                        {...qa('reports.custom.delete')}
                                    >
                                        Удалить
                                    </Button>
                                </>
                            )}
                        </div>
                        {customLoading ? (
                            // ST-1
                            <div className="flex flex-col gap-4">
                                <Skeleton height={92} className="rounded-xl" />
                                <Skeleton height={320} className="rounded-xl" />
                            </div>
                        ) : customError ? (
                            // ST-6: отчёт удалён/недоступен/чужой проект
                            <ErrorState
                                message={errMessage(
                                    customError,
                                    'Отчёт не найден или недоступен',
                                )}
                                onRetry={() => mutateCustom()}
                            />
                        ) : customReport ? (
                            <PresetView
                                key={customReport.id}
                                report={customReport}
                                period={period}
                                params={NO_PARAMS}
                                canExport={canExport}
                                hasActiveFilter={false}
                                onResetFilter={resetFilters}
                                onDrill={(ctx) => setDrill(ctx)}
                            />
                        ) : null}
                    </div>
                ) : /* ST-6: список определений упал */
                error ? (
                    <ErrorState
                        message={errMessage(error, 'Не удалось загрузить отчёты')}
                        onRetry={() => mutate()}
                    />
                ) : isLoading ? (
                    // ST-1: skeleton табов
                    <div className="flex flex-col gap-4" {...qa('reports.main.tabSkeleton')}>
                        <Skeleton height={36} className="rounded-lg w-2/3" />
                        <Skeleton height={92} className="rounded-xl" />
                    </div>
                ) : availablePresets.length === 0 ? (
                    // ST-3: все источники выключены
                    <NoPresetsState />
                ) : (
                    <Tabs
                        value={activeTab}
                        onChange={(val) => setActiveTab(val as PresetKey)}
                    >
                        <TabList {...qa('reports.main.tabList')}>
                            {availablePresets.map((p) => (
                                <TabNav key={p.key} value={p.key} {...qa('reports.main.tab', { tab: p.key })}>
                                    {p.label}
                                </TabNav>
                            ))}
                        </TabList>
                        {/* ── C4 фильтры (EL-MAIN-9..11) + режим отделов (EL-MAIN-8a) ── */}
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            {showManagerFilter && (
                                <div className="min-w-[220px]" {...qa('reports.main.managerFilter')}>
                                    <Select
                                        isMulti
                                        placeholder="Все менеджеры"
                                        options={managerFilterOptions.map((m) => ({
                                            value: m.id,
                                            label: m.name,
                                        }))}
                                        value={managerFilterOptions
                                            .filter((m) => managerIds.includes(m.id))
                                            .map((m) => ({ value: m.id, label: m.name }))}
                                        onChange={(vals) =>
                                            setManagerIds(
                                                Array.isArray(vals)
                                                    ? vals.map((v) => v.value)
                                                    : [],
                                            )
                                        }
                                    />
                                </div>
                            )}
                            {showPipelineFilter && (
                                <div className="w-[200px]">
                                    <Input
                                        placeholder="ID воронки (опц.)"
                                        value={pipelineId}
                                        onChange={(e) => persistPipelineId(e.target.value)}
                                        {...qa('reports.main.pipelineFilter')}
                                    />
                                </div>
                            )}
                            {hasActiveFilter && (
                                <Button size="sm" variant="plain" onClick={resetFilters} {...qa('reports.main.resetFilters')}>
                                    Сбросить фильтры
                                </Button>
                            )}
                            {/* EL-MAIN-8a: переключатель «Сравнение отделов» во вкладке by_managers */}
                            {activeTab === 'by_managers' && (
                                <div
                                    className="ml-auto inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm"
                                    {...qa('reports.main.runModeToggle')}
                                >
                                    <button
                                        type="button"
                                        className={`px-3 py-1 ${!deptsMode ? 'bg-blue-500 text-white' : ''}`}
                                        onClick={() => setDeptsMode(false)}
                                        {...qa('reports.main.runModeManagers')}
                                    >
                                        По менеджерам
                                    </button>
                                    <button
                                        type="button"
                                        className={`px-3 py-1 ${deptsMode ? 'bg-blue-500 text-white' : ''}`}
                                        onClick={() => setDeptsMode(true)}
                                        {...qa('reports.main.runModeDepts')}
                                    >
                                        Сравнение отделов
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="mt-4">
                            {activeReport ? (
                                <PresetView
                                    key={`${activeTab}-${runMode}`}
                                    report={activeReport}
                                    presetKey={activeTab}
                                    runMode={runMode}
                                    period={period}
                                    params={params}
                                    canExport={canExport}
                                    hasActiveFilter={hasActiveFilter}
                                    onResetFilter={resetFilters}
                                    onDrill={(ctx) => setDrill(ctx)}
                                    onOptions={setFilterOpts}
                                />
                            ) : (
                                // ST-3: определения этого пресета ещё не засеяны
                                // бэком — показываем это честно, а не чужой отчёт.
                                <EmptyDataState
                                    message={`Отчёт «${activeTabLabel}» ещё не готов для этого проекта.`}
                                />
                            )}
                        </div>
                    </Tabs>
                )}

                {/* SCR-REPORTS-LIST: каталог сохранённых отчётов конструктора.
                    Скрыт целиком, если сохранённых нет и создавать их нельзя. */}
                {!customId &&
                    !error &&
                    !isLoading &&
                    (customReports.length > 0 || canManage) && (
                        <AdaptiveCard {...qa('reports.list.section')}>
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                                    Сохранённые отчёты
                                </h4>
                                <span className="text-xs text-gray-400">
                                    {customReports.length}
                                </span>
                            </div>
                            {customReports.length === 0 ? (
                                // ST-3: пусто (не ошибка) — путь к созданию рядом
                                <p className="text-sm text-gray-500" {...qa('reports.list.emptyHint')}>
                                    Сохранённых отчётов пока нет. Соберите свой в
                                    конструкторе.
                                </p>
                            ) : (
                                <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-700">
                                    {customReports.map((r) => (
                                        <li
                                            key={r.id}
                                            className="flex flex-wrap items-center gap-2 py-2"
                                            {...qa('reports.list.row', { report: r.id })}
                                        >
                                            <button
                                                type="button"
                                                className="flex-1 min-w-0 text-left"
                                                onClick={() => openCustom(r.id)}
                                                {...qa('reports.list.openName', { report: r.id })}
                                            >
                                                <span className="block text-sm font-medium truncate">
                                                    {r.name}
                                                </span>
                                                <span className="block text-xs text-gray-400 truncate">
                                                    {/* TODO-466: уровень доступа — из
                                                        поля visibility, а не из описания. */}
                                                    {r.visibility === 'personal'
                                                        ? 'Личный · '
                                                        : ''}
                                                    {r.description
                                                        ? `${r.description} · `
                                                        : ''}
                                                    обновлён {formatDateTime(r.updatedAt)}
                                                </span>
                                            </button>
                                            <Button
                                                size="xs"
                                                variant="plain"
                                                onClick={() => openCustom(r.id)}
                                                {...qa('reports.list.open', { report: r.id })}
                                            >
                                                Открыть
                                            </Button>
                                            {/* ST-11: удаление скрыто без reports:manage */}
                                            {canManage && (
                                                <>
                                                    <Button
                                                        size="xs"
                                                        variant="plain"
                                                        icon={<PiPencilDuotone />}
                                                        onClick={() => editCustom(r.id)}
                                                        {...qa('reports.list.edit', { report: r.id })}
                                                    >
                                                        Изменить
                                                    </Button>
                                                    <Button
                                                        size="xs"
                                                        variant="plain"
                                                        icon={<PiTrashDuotone />}
                                                        loading={deletingId === r.id}
                                                        onClick={() => removeCustom(r)}
                                                        {...qa('reports.list.delete', { report: r.id })}
                                                    >
                                                        Удалить
                                                    </Button>
                                                </>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </AdaptiveCard>
                    )}
            </div>

            {/* SCR-REPORTS-DRILLDOWN */}
            <DrillDownPanel
                open={!!drill}
                projectId={pid}
                ctx={drill}
                onClose={() => setDrill(null)}
            />
        </Container>
    )
}

export default Reports
