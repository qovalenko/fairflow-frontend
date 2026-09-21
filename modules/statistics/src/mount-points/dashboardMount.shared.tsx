/**
 * Shared dashboard mount-point sections (FR-STAT-170).
 */
import { useNavigate } from 'react-router'
import type { DashboardData, Deal, Activity } from '@/@types/crm'
import {
    useStatistics,
    useRoutePid,
    asArray,
    drillBase,
    drillTo,
} from '../statistics.shared'
import {
    KpiRow,
    FunnelWidget,
    SourcesWidget,
    ActivityListWidget,
    StalledWidget,
    ManagersWidget,
} from '../DashboardWidgets'
import { qa } from '../qa'

export function useDashboardMountContext() {
    const s = useStatistics()
    const navigate = useNavigate()
    const routePid = useRoutePid()
    const dealsBase = drillBase(routePid, '/deals')
    const actBase = drillBase(routePid, '/activities')

    const data = s.data
    const statistics = asArray<DashboardData['statistics'][number]>(data?.statistics)
    const dealsByStage = asArray<DashboardData['dealsByStage'][number]>(data?.dealsByStage)
    const topManagers = asArray<DashboardData['topManagers'][number]>(data?.topManagers)
    const overdue = asArray<Activity>(data?.overdueActivities)
    const upcoming = asArray<Activity>(data?.upcomingActivities)
    const dealsBySource = asArray<{ source: string; count: number }>(data?.dealsBySource)
    const stalled = asArray<Deal>(data?.stalledDeals)

    return {
        s,
        navigate,
        routePid,
        dealsBase,
        actBase,
        statistics,
        dealsByStage,
        topManagers,
        overdue,
        upcoming,
        dealsBySource,
        stalled,
        overdueTotal: data?.overdueTotal,
        upcomingTotal: data?.upcomingTotal,
        stalledTotal: data?.stalledTotal,
        ready: Boolean(s.canRead && !s.rangeIncomplete && !s.isInitialLoading && s.data),
    }
}

export function DashboardKpiSection() {
    const ctx = useDashboardMountContext()
    if (!ctx.ready || ctx.statistics.length === 0) return null
    return (
        <div {...qa('statistics.dashboard.kpiSection')}>
            <KpiRow
                statistics={ctx.statistics}
                enabledModules={ctx.s.enabledModules}
                routePid={ctx.routePid}
            />
        </div>
    )
}

export function DashboardChartsSection() {
    const ctx = useDashboardMountContext()
    if (!ctx.ready) return null
    if (!ctx.s.enabledModules.includes('deals')) return null
    return (
        <div
            className="grid grid-cols-1 gap-4 xl:grid-cols-2"
            {...qa('statistics.dashboard.chartsGrid', { layout: 'responsive-1-xl-2' })}
        >
            <FunnelWidget
                data={ctx.dealsByStage}
                enabledModules={ctx.s.enabledModules}
                onDrill={(row) => {
                    if (!row.stageId) return
                    ctx.navigate(drillTo(ctx.dealsBase, { stageId: row.stageId }))
                }}
            />
            <SourcesWidget
                data={ctx.dealsBySource}
                enabledModules={ctx.s.enabledModules}
                onDrill={(row) => {
                    if (!row.sourceKey) return
                    ctx.navigate(drillTo(ctx.dealsBase, { source: row.sourceKey }))
                }}
            />
        </div>
    )
}

export function DashboardListsSection() {
    const ctx = useDashboardMountContext()
    if (!ctx.ready) return null
    const activitiesOn = ctx.s.enabledModules.includes('activities')
    const dealsOn = ctx.s.enabledModules.includes('deals')
    const hasManagers = ctx.topManagers.length > 0
    if (!activitiesOn && !dealsOn && !hasManagers) return null
    return (
        <div
            className="grid grid-cols-1 gap-4 xl:grid-cols-2"
            {...qa('statistics.dashboard.listsGrid', { layout: 'responsive-1-xl-2' })}
        >
            {activitiesOn && (
                <>
                    <ActivityListWidget
                        title="Просроченные"
                        items={ctx.overdue}
                        total={ctx.overdueTotal}
                        limit={5}
                        enabledModules={ctx.s.enabledModules}
                        accent="overdue"
                        emptyHint="Нет просроченных активностей."
                        listKind="overdue"
                        onDrillItem={(id) => ctx.navigate(`${ctx.actBase}/${id}`)}
                        onDrillAll={() => ctx.navigate(drillTo(ctx.actBase, { overdue: '1' }))}
                    />
                    <ActivityListWidget
                        title="Предстоящие"
                        items={ctx.upcoming}
                        total={ctx.upcomingTotal}
                        limit={5}
                        enabledModules={ctx.s.enabledModules}
                        emptyHint="Нет запланированных активностей."
                        listKind="upcoming"
                        onDrillItem={(id) => ctx.navigate(`${ctx.actBase}/${id}`)}
                        onDrillAll={() => ctx.navigate(drillTo(ctx.actBase, { upcoming: '1' }))}
                    />
                </>
            )}
            {dealsOn && (
                <StalledWidget
                    items={ctx.stalled}
                    total={ctx.stalledTotal}
                    enabledModules={ctx.s.enabledModules}
                    onDrillItem={(id) => ctx.navigate(`${ctx.dealsBase}/${id}`)}
                />
            )}
            {hasManagers && (
                <ManagersWidget
                    data={ctx.topManagers}
                    enabledModules={ctx.s.enabledModules}
                    scopeLevel={ctx.s.scopeLevel}
                    onDrill={(m) => {
                        if (!m.ownerId) return
                        ctx.navigate(drillTo(ctx.dealsBase, { assigneeId: m.ownerId }))
                    }}
                />
            )}
        </div>
    )
}
