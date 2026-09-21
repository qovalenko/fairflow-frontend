/**
 * SCR-STATISTICS-ANALYTICS — Аналитический экран (FR-MSTAT-16/17).
 *
 * Read-only углублённая аналитика + единственная мутация-исключение —
 * экспорт (`statistics:export`, FR-MSTAT-2/22/23). Переключатель срезов
 * (`sales/funnel/sources/team/by_department/order_types`), breakdown по менеджерам.
 * Состояния: всё что у дашборда + ST-7 (ошибка экспорта), ST-11 (нет права
 * экспорта → кнопка скрыта/disabled), ST-29 (успех экспорта = toast+скачивание).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Container } from '@fairflow/shared-ui'
import type { DashboardData } from '@/@types/crm'
import { apiExportStatistics } from '@/services/CrmService'
import type { StatSlice } from './statistics.shared'
import {
    useStatistics,
    useRoutePid,
    asArray,
    drillBase,
    drillTo,
    parseSliceParam,
    writeSliceParam,
    SLICE_PARAM,
    rangeToEpochMs,
    scopeSeesTeam,
    NoPermissionScreen,
    NoProjectScreen,
    RangePromptScreen,
    ErrorScreen,
    WidgetSkeleton,
    WidgetEmpty,
} from './statistics.shared'
import StatisticsHeader from './StatisticsHeader'
import {
    FunnelWidget,
    SourcesWidget,
    ManagersWidget,
    DepartmentsWidget,
    ChartDrillActions,
} from './DashboardWidgets'
import WidgetBoundary from './WidgetBoundary'
import { AdaptiveCard } from '@fairflow/shared-ui'
import ApexChart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'
import { qa } from './qa'

// EL-ANL-2 Срезы (FR-MSTAT-17). Состав/порядок — OQ-UX-STATISTICS-3.
// `by_department` домен считает и gateway отдаёт (`byDepartment[]`) — срез
// добавлен сюда, иначе готовые данные не имели экрана (FR-MSTAT-28).
//
// TODO-272 («согласовать состав срезов FE↔BE↔proto»): состав НЕ дублируется
// локальным union'ом, а берётся из `StatSlice` — единственного описания состава
// на фронте (`statistics.shared.tsx`, оно же whitelist для `?slices[]`). Раньше
// здесь лежала вторая копия списка, и любое расхождение двух списков ловилось
// только глазами. Теперь удаление среза из `StatSlice` роняет `tsc` прямо
// здесь: лишний ключ в `SLICE_LABELS`, `push('order_types')` и `case` в
// `renderSlice`. Это намеренный предохранитель: срез `order_types` питается
// цепочкой orders → reports.getMetrics → statistics BFF → `orderTypes[]`
// (см. комментарий у `byType` ниже), и молча остаться без экрана он не должен.
type Slice = StatSlice

const SLICE_LABELS: Record<Slice, string> = {
    sales: 'Динамика',
    funnel: 'Воронка',
    sources: 'Источники',
    team: 'Команда',
    by_department: 'Отделы',
    order_types: 'Типы продаж',
    stage_timing: 'Время на стадии',
}

// Экспорт-формат (EL-ANL-3, FR-MSTAT-22). Gateway `/statistics/export`
// принимает `format=csv|json` — оба формата даём выбрать в UI.
type ExportFormat = 'csv' | 'json'

const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
    { value: 'csv', label: 'CSV' },
    { value: 'json', label: 'JSON' },
]

type ExportState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'success'; message: string }
    | { status: 'error'; message: string }

const Analytics = () => {
    const navigate = useNavigate()
    // pid ИЗ URL (не из store) — префикс drill-ссылок; см. `drillBase`.
    const routePid = useRoutePid()
    // Активный срез — в URL (TODO-496): F5/ссылка открывают тот же срез, что и
    // был. `replace: true` — переключение вкладок не копит историю.
    const [searchParams, setSearchParams] = useSearchParams()
    const rawSlice = searchParams.get(SLICE_PARAM)
    const slice = parseSliceParam(rawSlice)
    const setSlice = useCallback(
        (next: Slice) => {
            setSearchParams((prev) => writeSliceParam(prev, next), {
                replace: true,
            })
        },
        [setSearchParams],
    )
    const [exportFormat, setExportFormat] = useState<ExportFormat>('csv')
    // ANALYTICS тянет `/api/v1/statistics?slices[]` под активный срез (FR-MSTAT-17);
    // смена среза = новый SWR-ключ → refetch только нужного среза.
    const s = useStatistics('analytics', [slice])
    const [exportState, setExportState] = useState<ExportState>({
        status: 'idle',
    })

    // ST-12 — состав срезов гейтится источником (модуль включён) + scope.
    // Считаем ДО ранних возвратов: от этого зависит нормализация `?slice=`
    // ниже, а хуки условными быть не могут.
    const dealsOn = s.enabledModules.includes('deals')
    const ordersOn = s.enabledModules.includes('orders')
    const scopeTeam = scopeSeesTeam(s.scopeLevel)
    // stage_timing — project-wide aggregate (нет owner на проекции). Как
    // team/by_department: вкладку не показываем, пока сервер не подтвердил scope=all.
    const scopeAll = s.scopeLevel === 'all'
    const availableSlices: Slice[] = useMemo(() => {
        const out: Slice[] = []
        if (dealsOn) {
            out.push('sales', 'funnel', 'sources')
            if (scopeAll) out.push('stage_timing')
            // team/by_department видны только со scope ≥ own_and_subordinates
            // (ST-12, OQ-UX-STATISTICS-19) — сервер за этим порогом всё равно
            // отдаёт пусто, показывать вкладку смысла нет.
            if (scopeTeam) out.push('team', 'by_department')
        }
        if (ordersOn) out.push('order_types')
        return out
    }, [dealsOn, ordersOn, scopeTeam, scopeAll])

    const activeSlice = availableSlices.includes(slice)
        ? slice
        : (availableSlices[0] ?? 'sales')

    // Ссылка может принести срез, недоступный этому зрителю (`?slice=team` без
    // scope ≥ own_and_subordinates). Тогда запрос ушёл бы за `team`, а на экран
    // рисовался бы fallback-срез — «нет данных» на пустом месте. Как только
    // ответ пришёл (состав срезов известен) — чиним сам URL, и запрос уходит за
    // тем срезом, который реально показан.
    useEffect(() => {
        // Мёртвый/недоступный срез в ссылке (мусор или срез без модуля/scope)
        // читается как дефолт — вычищаем параметр сразу, не дожидаясь ответа:
        // он ни на что не влияет, но переживает F5 и расходится с тем, что
        // реально показано.
        if (rawSlice !== null && rawSlice !== slice) {
            setSlice(slice)
            return
        }
        if (!s.data) return
        if (activeSlice !== slice) setSlice(activeSlice)
    }, [s.data, activeSlice, slice, rawSlice, setSlice])

    // ST-19 / ST-10
    if (s.noProject) {
        return (
            <Container>
                <NoProjectScreen />
            </Container>
        )
    }
    if (!s.canRead) {
        return (
            <Container>
                <NoPermissionScreen />
            </Container>
        )
    }

    const pid = s.projectId
    // Тот же drill-контракт, что и на дашборде (см. Dashboard.tsx): целевой
    // список фильтруется по id (`stageId`/`source`/`assigneeId`/`typeId`), не по
    // подписи, и эмитятся только принимаемые параметры (`drillTo`) — период
    // целевые списки не читают, поэтому в ссылку не кладётся. Префикс `/p/:pid`
    // — только если он есть в URL (`drillBase`): в host'е маршрута
    // `/p/:pid/deals` нет, ссылка вела в catch-all «Страница не найдена».
    const dealsBase = drillBase(routePid, '/deals')
    const ordersBase = drillBase(routePid, '/orders')

    const data = s.data
    const dealsByStage = asArray<DashboardData['dealsByStage'][number]>(data?.dealsByStage)
    // TODO-052: динамика — реальный срез `sales` BFF ({bucket,count,amount});
    // прежний dealsTimeline (won/lost/new) не имеет источника на бэке.
    const sales = asArray<{ bucket: string; count: number; amount: number }>(data?.sales)
    const topManagers = asArray<DashboardData['topManagers'][number]>(data?.topManagers)
    const teamGrouping = data?.teamGrouping === 'department' ? 'department' : 'user'
    const byDepartment = asArray<
        NonNullable<DashboardData['byDepartment']>[number]
    >(data?.byDepartment)
    const dealsBySource = asArray<{ source: string; count: number }>(data?.dealsBySource)
    // TODO-272: срез «Типы продаж» читается из `orderTypes` — именно это поле
    // отдаёт BFF (`statistics-bff.controller.ts`: `order_types[]` домена reports
    // → {orderTypeId, orderTypeName, count} с резолвом имени типа). Прежний
    // `dealsByType` продюсера в gateway не имел, поэтому виджет всегда рисовал
    // «данных нет» при включённом модуле orders.
    const byType = asArray<
        NonNullable<DashboardData['orderTypes']>[number]
    >(data?.orderTypes)
    const stageDurations = asArray<
        NonNullable<DashboardData['stageDurations']>[number]
    >(data?.stageDurations)

    // EL-ANL-3 Экспорт (FR-MSTAT-2/22/23). Формат берётся из селектора, а не
    // хардкодится: gateway отдаёт и csv, и json (`?format=`).
    const handleExport = async () => {
        if (!pid) return
        // custom без валидного диапазона: домен вернёт INVALID_ARGUMENT — не шлём.
        const customMs =
            s.period === 'custom' ? rangeToEpochMs(s.range) : null
        if (s.period === 'custom' && !customMs) {
            setExportState({
                status: 'error',
                message: 'Укажите обе даты произвольного периода.',
            })
            return
        }
        setExportState({ status: 'loading' })
        const fmt =
            EXPORT_FORMATS.find((f) => f.value === exportFormat) ??
            EXPORT_FORMATS[0]
        try {
            const blob = await apiExportStatistics({
                projectId: pid,
                period: s.period,
                format: fmt.value,
                from: customMs?.from,
                to: customMs?.to,
            })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `statistics-${s.period}.${fmt.value}`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
            // ST-29 — успех.
            setExportState({
                status: 'success',
                message: `Файл сформирован (${fmt.label}).`,
            })
        } catch (e) {
            // ST-7: 403 отличаем от прочих ошибок — право экспорта проверяет
            // сервер (`statistics:export`), кнопка лишь зеркалит его гейт.
            const status = (e as { response?: { status?: number } })?.response
                ?.status
            setExportState({
                status: 'error',
                message:
                    status === 403
                        ? 'Нет права на экспорт (statistics:export).'
                        : `Не удалось выполнить экспорт${status ? ` (${status})` : ''}.`,
            })
        }
    }

    // EL-ANL-3 — кнопка экспорта: ST-11 (нет права → disabled+подсказка).
    const canExport = s.canExport
    const exportButton = (
        <div className="flex items-center gap-2">
            {/* Селектор формата гейтится тем же правом, что и сама кнопка. */}
            <select
                aria-label="Формат экспорта"
                value={exportFormat}
                disabled={!canExport || exportState.status === 'loading'}
                onChange={(e) =>
                    setExportFormat(e.target.value as ExportFormat)
                }
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800"
                {...qa('statistics.analytics.exportFormat')}
            >
                {EXPORT_FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                        {f.label}
                    </option>
                ))}
            </select>
            <button
                type="button"
                onClick={handleExport}
                disabled={!canExport || exportState.status === 'loading'}
                title={
                    canExport
                        ? `Экспорт сводки (${exportFormat.toUpperCase()})`
                        : 'Нужно право экспорта (statistics:export)'
                }
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700"
                {...qa('statistics.analytics.export')}
            >
                {exportState.status === 'loading' ? '… Экспорт' : '⬇ Экспорт'}
            </button>
        </div>
    )

    const header = (
        <StatisticsHeader
            title="Статистика"
            period={s.period}
            onPeriodChange={s.setPeriod}
            range={s.range}
            onRangeChange={s.setRange}
            rangeIncomplete={s.rangeIncomplete}
            asOf={s.asOf}
            partial={s.partial}
            scopeLevel={s.scopeLevel}
            onRefresh={s.refresh}
            isRefreshing={s.isRefreshing}
        >
            {exportButton}
        </StatisticsHeader>
    )

    // period=custom без валидного диапазона — просим даты (запрос не отправлен).
    if (s.rangeIncomplete) {
        return (
            <Container>
                <div className="flex flex-col gap-4">
                    {header}
                    <RangePromptScreen />
                </div>
            </Container>
        )
    }

    // ST-1
    if (s.isInitialLoading) {
        return (
            <Container>
                <div
                    className="flex flex-col gap-4"
                    {...qa('statistics.analytics.skeleton')}
                >
                    {header}
                    <WidgetSkeleton height={48} slot="tabs" />
                    <WidgetSkeleton height={320} slot="slice" />
                </div>
            </Container>
        )
    }

    // ST-6
    if (s.error && !s.data) {
        return (
            <Container>
                <div className="flex flex-col gap-4">
                    {header}
                    <ErrorScreen onRetry={s.refresh} />
                </div>
            </Container>
        )
    }

    // EL-ANL-2 Переключатель срезов (ST-12 — недоступные скрыты).
    const sliceTabs = (
        <div
            className="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700"
            {...qa('statistics.analytics.sliceTabs')}
        >
            {availableSlices.map((sl) => (
                <button
                    key={sl}
                    type="button"
                    onClick={() => setSlice(sl)}
                    className={`px-3 py-2 text-sm font-medium transition-colors ${
                        activeSlice === sl
                            ? 'border-b-2 border-blue-600 text-blue-600'
                            : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                    {...qa('statistics.analytics.sliceTab', {
                        slice: sl,
                        ...(activeSlice === sl ? { active: 'true' } : {}),
                    })}
                >
                    {SLICE_LABELS[sl]}
                </button>
            ))}
        </div>
    )

    const renderSlice = () => {
        switch (activeSlice) {
            // EL-ANL-5 sales (динамика)
            case 'sales':
                return (
                    <WidgetBoundary label="Динамика">
                        <AdaptiveCard
                            {...qa('statistics.analytics.salesChart', {
                                buckets: sales.map((d) => d.bucket).join('|'),
                            })}
                        >
                            <h5 className="mb-4">Динамика сделок</h5>
                            {sales.length === 0 ? (
                                <WidgetEmpty
                                    hint="За выбранный период нет данных."
                                    state="slice-empty"
                                />
                            ) : (
                                <ApexChart
                                    options={
                                        {
                                            chart: {
                                                type: 'area',
                                                toolbar: { show: false },
                                            },
                                            stroke: {
                                                curve: 'smooth',
                                                width: 2,
                                            },
                                            xaxis: {
                                                categories: sales.map(
                                                    (d) => d.bucket,
                                                ),
                                            },
                                            colors: [
                                                '#3B82F6',
                                                '#10B981',
                                            ],
                                            fill: {
                                                type: 'gradient',
                                                gradient: {
                                                    opacityFrom: 0.3,
                                                    opacityTo: 0.05,
                                                },
                                            },
                                            legend: { position: 'top' },
                                            yaxis: [
                                                {
                                                    title: {
                                                        text: 'Сделок',
                                                    },
                                                },
                                                {
                                                    opposite: true,
                                                    title: {
                                                        text: 'Сумма, ₽',
                                                    },
                                                },
                                            ],
                                        } as ApexOptions
                                    }
                                    series={[
                                        {
                                            name: 'Сделок',
                                            data: sales.map((d) => d.count),
                                        },
                                        {
                                            name: 'Сумма',
                                            data: sales.map((d) => d.amount),
                                        },
                                    ]}
                                    type="area"
                                    height={320}
                                />
                            )}
                        </AdaptiveCard>
                    </WidgetBoundary>
                )
            // EL-ANL-6 funnel
            case 'funnel':
                return (
                    <FunnelWidget
                        data={dealsByStage}
                        enabledModules={s.enabledModules}
                        onDrill={(row) => {
                            // Нет id стадии — нет и фильтра: молча открыть
                            // полный список вместо среза нельзя (см. Dashboard).
                            if (!row.stageId) return
                            navigate(drillTo(dealsBase, { stageId: row.stageId }))
                        }}
                    />
                )
            // EL-ANL-7 sources
            case 'sources':
                return (
                    <SourcesWidget
                        // TODO-506: клиентского фоллбека «посчитать источники из
                        // recentDeals» здесь больше нет. Он был и ненадёжен (счёт
                        // по одной странице последних сделок ≠ агрегат за период),
                        // и мёртв: маппер аналитики отдаёт `recentDeals: []`
                        // (CrmService `mapBffStatisticsToFrontend`), так что путь
                        // всегда возвращал пусто. Пустой `dealsBySource` корректно
                        // даёт WidgetEmpty внутри самого виджета (ST-3).
                        data={dealsBySource}
                        enabledModules={s.enabledModules}
                        onDrill={(row) => {
                            // Фильтр сервера — по ключу источника; подпись
                            // («Без источника») ключом не является.
                            if (!row.sourceKey) return
                            navigate(
                                drillTo(dealsBase, { source: row.sourceKey }),
                            )
                        }}
                    />
                )
            // EL-ANL-8 team
            case 'team':
                return (
                    <ManagersWidget
                        data={topManagers}
                        enabledModules={s.enabledModules}
                        scopeLevel={s.scopeLevel}
                        grouping={teamGrouping}
                        onDrill={(m) => {
                            if (!m.ownerId) return
                            navigate(
                                drillTo(dealsBase, { assigneeId: m.ownerId }),
                            )
                        }}
                    />
                )
            // EL-ANL-9 by_department (FR-MSTAT-28)
            case 'by_department':
                return (
                    <DepartmentsWidget
                        data={byDepartment}
                        enabledModules={s.enabledModules}
                        scopeLevel={s.scopeLevel}
                    />
                )
            // EL-ANL-10 order_types
            case 'order_types':
                return (
                    <WidgetBoundary label="Типы продаж">
                        <AdaptiveCard
                            {...qa('statistics.analytics.orderTypesChart', {
                                'drill-targets': byType
                                    .map((t) => t.orderTypeId ?? '')
                                    .join('|'),
                            })}
                        >
                            <h5 className="mb-4">Продажи по типам</h5>
                            {byType.length === 0 ? (
                                <WidgetEmpty
                                    hint="По этому срезу за период данных нет."
                                    state="slice-empty"
                                />
                            ) : (
                                <ApexChart
                                    options={
                                        {
                                            // Drill по типу продажи (TODO-272):
                                            // эмитим только принимаемое —
                                            // `?typeId=<id типа>` (gateway
                                            // @Get('orders') фильтрует по
                                            // typeId, OrderList снимает его с
                                            // URL при монтировании). По подписи
                                            // список не сматчить, поэтому клик
                                            // без id молча игнорируем.
                                            chart: {
                                                type: 'bar',
                                                toolbar: { show: false },
                                                events: {
                                                    dataPointSelection: (
                                                        _e: unknown,
                                                        _ctx: unknown,
                                                        cfg: {
                                                            dataPointIndex: number
                                                        },
                                                    ) => {
                                                        const row =
                                                            byType[
                                                                cfg
                                                                    .dataPointIndex
                                                            ]
                                                        if (!row?.orderTypeId)
                                                            return
                                                        navigate(
                                                            drillTo(ordersBase, {
                                                                typeId: row.orderTypeId,
                                                            }),
                                                        )
                                                    },
                                                },
                                            },
                                            xaxis: {
                                                categories: byType.map(
                                                    (t) =>
                                                        t.orderTypeName ||
                                                        t.orderTypeId ||
                                                        '—',
                                                ),
                                            },
                                            colors: ['#8B5CF6'],
                                            plotOptions: {
                                                bar: { borderRadius: 4 },
                                            },
                                        } as ApexOptions
                                    }
                                    series={[
                                        {
                                            name: 'Продажи',
                                            data: byType.map((t) => t.count),
                                        },
                                    ]}
                                    type="bar"
                                    height={320}
                                />
                            )}
                            <ChartDrillActions
                                qaId="statistics.analytics.orderTypesDrill"
                                items={byType}
                                onDrill={(row) => {
                                    if (!row.orderTypeId) return
                                    navigate(
                                        drillTo(ordersBase, {
                                            typeId: row.orderTypeId,
                                        }),
                                    )
                                }}
                                getTarget={(row) => row.orderTypeId ?? ''}
                                getLabel={(row) =>
                                    row.orderTypeName ||
                                    row.orderTypeId ||
                                    '—'
                                }
                            />
                        </AdaptiveCard>
                    </WidgetBoundary>
                )
            case 'stage_timing':
                return (
                    <WidgetBoundary label="Время на стадии">
                        <AdaptiveCard {...qa('statistics.analytics.stageTimingTable')}>
                            <h5 className="mb-4">Среднее время на стадии</h5>
                            {stageDurations.length === 0 ? (
                                <WidgetEmpty state="stage-timing-empty" />
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-gray-500">
                                                <th className="py-2 pr-4">Стадия</th>
                                                <th className="py-2 pr-4">Переходов</th>
                                                <th className="py-2">Среднее, ч</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stageDurations.map((row) => (
                                                <tr
                                                    key={row.stageId}
                                                    className="border-t border-gray-100 dark:border-gray-700"
                                                    {...qa('statistics.analytics.stageTimingRow', {
                                                        stage: row.stageId ?? row.label,
                                                    })}
                                                >
                                                    <td className="py-2 pr-4">{row.label || row.stageId || '—'}</td>
                                                    <td className="py-2 pr-4">{row.transitionCount}</td>
                                                    <td className="py-2">
                                                        {(row.avgDurationMs / 3_600_000).toFixed(1)}
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
            default:
                return null
        }
    }

    const noSlices = availableSlices.length === 0

    return (
        <Container>
            <div
                className={`flex flex-col gap-4 transition-opacity ${s.isRefreshing ? 'opacity-60' : ''}`}
                {...qa('statistics.analytics.screen', {
                    ...(s.projectId ? { pid: s.projectId } : {}),
                    ...(s.isRefreshing ? { state: 'refreshing' } : {}),
                })}
            >
                {header}

                {/* ST-7/ST-29 — фидбек экспорта (inline toast, не роняет экран). */}
                {exportState.status === 'success' && (
                    <div
                        className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                        {...qa('statistics.analytics.exportSuccess')}
                    >
                        ✓ {exportState.message}
                    </div>
                )}
                {exportState.status === 'error' && (
                    <div
                        className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
                        {...qa('statistics.analytics.exportError')}
                    >
                        <span>⚠ {exportState.message}</span>
                        <button
                            type="button"
                            onClick={handleExport}
                            className="text-xs underline"
                            {...qa('statistics.analytics.exportRetry')}
                        >
                            Повторить
                        </button>
                    </div>
                )}

                {noSlices ? (
                    <WidgetEmpty
                        title="Нет доступных срезов"
                        hint="Включите модуль Сделки или Продажи в настройках проекта."
                        state="no-slices"
                    />
                ) : (
                    <>
                        {sliceTabs}
                        {renderSlice()}
                        {/* Срезы наполняются из тех же dashboard.* слотов
                            (FR-MSTAT-11/17); host-shell рендерит их вокруг
                            системного экрана (FR-SHELL-7/7a) — см. Dashboard. */}
                    </>
                )}
            </div>
        </Container>
    )
}

export default Analytics
