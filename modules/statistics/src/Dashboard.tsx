/**
 * SCR-STATISTICS-DASHBOARD — Операционный дашборд (FR-MSTAT-16).
 *
 * Read-only витрина «как идут дела за 5 секунд»: KPI-строка, воронка,
 * источники, списки (просроченные/предстоящие/последние/зависшие), топ
 * менеджеров. Системный host-экран ядра (`kind:"system"`), гейт по праву
 * `statistics:read` (FR-MSTAT-1). Все состояния каталога:
 *  ST-1 (skeleton послотовый), ST-2 (overlay refetch), ST-3 (пусто вместо
 *  фейка), ST-6 (ошибка+Повторить), ST-8 (partial+boundary), ST-10 (нет права),
 *  ST-12/17 (Contextual UI источников), ST-13 (scope), ST-19 (нет проекта),
 *  ST-20 (teardown по projectId), ST-33 (адаптив).
 *  Мутаций нет → ST-7/9/11/15/22..25/29/30/31 — н/п.
 */
import { useMemo } from 'react'
import { Container } from '@fairflow/shared-ui'
import type { DashboardData, Deal, Activity } from '@/@types/crm'
import HostSlot from '@/components/shared/HostSlot'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import {
    useStatistics,
    asArray,
    NoPermissionScreen,
    NoProjectScreen,
    RangePromptScreen,
    ErrorScreen,
    WidgetSkeleton,
    WidgetEmpty,
} from './statistics.shared'
import StatisticsHeader from './StatisticsHeader'
import { qa } from './qa'
import {
    DashboardKpiSection,
    DashboardChartsSection,
    DashboardListsSection,
} from './mount-points/dashboardMount.shared'

// EL-DASH-16: виджеты дашборда объявлены как mountPoints[] модуля statistics
// (FR-STAT-170) и рендерятся через host `<Slot>` / `<HostSlot>`. В standalone
// (нет host-bridge) `<HostSlot>` откатывается на встроенные секции ниже.

const Dashboard = () => {
    const s = useStatistics()
    const projectId = useCurrentProjectId()
    const slotContext = useMemo(
        () => ({ projectId: projectId ?? '', period: s.period }),
        [projectId, s.period],
    )

    // ST-19 — проект не выбран.
    if (s.noProject) {
        return (
            <Container>
                <NoProjectScreen />
            </Container>
        )
    }

    // ST-10 — нет права statistics:read.
    if (!s.canRead) {
        return (
            <Container>
                <NoPermissionScreen />
            </Container>
        )
    }

    // Единый drill-контракт статистики → целевые списки (FR-MSTAT-24). Эмитим
    // РОВНО то, что целевой список принимает (проверено по коду обоих концов):
    //   сделки     — `?stageId=<id>` | `?source=<key>` | `?assigneeId=<id>`
    //                (DealList засевает их из URL → gateway @Get('deals'));
    //   активности — `?overdue=1` | `?upcoming=1`
    //                (ActivityList: overdueOnly → `overdueOnly`, upcoming → окно
    //                 `dateFrom`/`dateTo` в 7 дней, как считает домен).
    // Чего здесь НЕТ и почему:
    //   `period/from/to` — у ручки сделок нет фильтра по дате создания, а
    //     overdue/upcoming домен считает от `asOf`, а не от периода (см. drillTo);
    //   `stalled=1` — серверного фильтра «залипшие» (status≠won/lost И
    //     stageEnteredAt старше N дней) не существует; клиентский предикат по
    //     daysOnStage фильтрует только текущую страницу и врал бы итогом
    //     (pagingTotal схлопывается до длины страницы), поэтому виджет
    //     «Зависшие» ведёт в карточки сделок, а ссылки «показать все» не эмитит.
    // Раньше отсюда уходили `filter=overdue|upcoming|stalled`, `stage=<имя>`,
    // `owner=<ФИО>` — ни одного из этих ключей целевые списки не понимают.
    // Префикс `/p/:pid` — только если он ЕСТЬ в URL (standalone-сборка модуля).
    // В host'е списки живут портфельными путями, а `/p/:pid/deals` уходил в
    // catch-all «Страница не найдена» — см. `drillBase` в dashboardMount.shared.

    const header = (
        <StatisticsHeader
            title="Дашборд"
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
        />
    )

    // period=custom без диапазона: запрос намеренно не отправлен (иначе домен
    // вернёт INVALID_ARGUMENT) — просим даты, а не показываем «нет данных».
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

    // ST-1 — первичная загрузка: послотовый skeleton, не белый экран.
    if (s.isInitialLoading) {
        return (
            <Container>
                <div
                    className="flex flex-col gap-4"
                    {...qa('statistics.dashboard.skeleton')}
                >
                    {header}
                    <div className="flex flex-wrap gap-4">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="min-w-[180px] flex-1">
                                <WidgetSkeleton height={96} slot={`kpi-${i}`} />
                            </div>
                        ))}
                    </div>
                    <div
                        className="grid grid-cols-1 gap-4 xl:grid-cols-2"
                        {...qa('statistics.dashboard.widgetGrid', {
                            layout: 'responsive-1-xl-2',
                        })}
                    >
                        <WidgetSkeleton slot="chart-0" />
                        <WidgetSkeleton slot="chart-1" />
                    </div>
                </div>
            </Container>
        )
    }

    // ST-6 — ошибка загрузки (визуально отлична от пустоты).
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

    const data = s.data
    const statistics = asArray<DashboardData['statistics'][number]>(data?.statistics)
    const dealsByStage = asArray<DashboardData['dealsByStage'][number]>(data?.dealsByStage)
    const overdue = asArray<Activity>(data?.overdueActivities)
    const upcoming = asArray<Activity>(data?.upcomingActivities)
    const stalled = asArray<Deal>(data?.stalledDeals)
    const dealsOn = s.enabledModules.includes('deals')
    const activitiesOn = s.enabledModules.includes('activities')
    const ordersOn = s.enabledModules.includes('orders')

    // ST-3 — данных нет: пусто вместо фейка (виджеты сами рисуют WidgetEmpty).
    const hasAny =
        statistics.length > 0 ||
        dealsByStage.length > 0 ||
        stalled.length > 0 ||
        overdue.length > 0 ||
        upcoming.length > 0
    const showWidgetSections = hasAny || dealsOn || activitiesOn || ordersOn

    return (
        <Container>
            {/* ST-2 — фоновый refetch overlay: данные не сбрасываются в skeleton. */}
            <div
                className={`relative flex flex-col gap-4 transition-opacity ${s.isRefreshing ? 'opacity-60' : ''}`}
                {...qa('statistics.dashboard.screen', {
                    ...(s.projectId ? { pid: s.projectId } : {}),
                    ...(s.isRefreshing ? { state: 'refreshing' } : {}),
                })}
            >
                {header}

                {!showWidgetSections ? (
                    // ST-3 (нет ни одной записи в scope и нет модулей-источников)
                    <WidgetEmpty
                        title="Пока нет данных"
                        hint="Начните вести работу — создайте первую сделку в модуле Сделки, и здесь появится статистика."
                        state="project-empty"
                    />
                ) : (
                    <>
                        <div
                            {...qa('statistics.dashboard.kpiMount', {
                                ...(projectId ? { pid: projectId } : {}),
                            })}
                        >
                            <HostSlot
                                id="dashboard.kpi.cell"
                                context={slotContext}
                                className="flex flex-wrap gap-4"
                                fallback={<DashboardKpiSection />}
                            />
                        </div>
                        {dealsOn && (
                            <div
                                {...qa('statistics.dashboard.chartsMount', {
                                    layout: 'responsive-1-md-2-xl-3',
                                    ...(projectId ? { pid: projectId } : {}),
                                })}
                            >
                                <HostSlot
                                    id="dashboard.widget"
                                    context={slotContext}
                                    className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                                    fallback={<DashboardChartsSection />}
                                />
                            </div>
                        )}
                        {(activitiesOn || dealsOn) && (
                            <div
                                {...qa('statistics.dashboard.listsMount', {
                                    layout: 'responsive-1-xl-2',
                                    ...(projectId ? { pid: projectId } : {}),
                                })}
                            >
                                <HostSlot
                                    id="dashboard.list"
                                    context={slotContext}
                                    className="grid grid-cols-1 gap-4 xl:grid-cols-2"
                                    fallback={<DashboardListsSection />}
                                />
                            </div>
                        )}
                    </>
                )}
            </div>
        </Container>
    )
}

export default Dashboard
