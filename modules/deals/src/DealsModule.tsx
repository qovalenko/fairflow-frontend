import { useMemo, type ComponentType } from 'react'
import { matchPath, Navigate, useLocation } from 'react-router'
import { Container } from '@fairflow/shared-ui'
import { useSessionUser } from '@/store/authStore'
import { dealsIndexRedirect } from '@/utils/profile/rememberDefaultView'
import DealList from './Deals/DealList'
import DealKanban from './Deals/DealKanban'
import DealDetails from './Deals/DealDetails'
import DealEdit from './Deals/DealEdit'
import DealDashboard from './Deals/DealDashboard'
import DealTrash from './Deals/DealTrash'
import PipelineList from './Pipelines/PipelineList'
import PipelineEdit from './Pipelines/PipelineEdit'
import DealImport from './Import/DealImport'

type RouteView = {
    patterns: string[]
    component: ComponentType
}

const routeViews: RouteView[] = [
    {
        patterns: ['/deals/dashboard', '/p/:pid/deals/dashboard'],
        component: DealDashboard,
    },
    {
        patterns: ['/deals/trash', '/p/:pid/deals/trash'],
        component: DealTrash,
    },
    {
        patterns: ['/deals/import', '/p/:pid/deals/import'],
        component: DealImport,
    },
    {
        patterns: ['/deals/pipelines/new', '/p/:pid/deals/pipelines/new'],
        component: PipelineEdit,
    },
    {
        patterns: ['/deals/pipelines/:id/edit', '/p/:pid/deals/pipelines/:id/edit'],
        component: PipelineEdit,
    },
    {
        patterns: ['/deals/pipelines', '/p/:pid/deals/pipelines'],
        component: PipelineList,
    },
    {
        patterns: ['/deals/kanban', '/p/:pid/deals/kanban'],
        component: DealKanban,
    },
    {
        patterns: ['/deals/:id/edit', '/p/:pid/deals/:id/edit'],
        component: DealEdit,
    },
    {
        patterns: ['/deals/:id', '/p/:pid/deals/:id'],
        component: DealDetails,
    },
    {
        patterns: ['/deals', '/p/:pid/deals'],
        component: DealList,
    },
]

const DealsModule = () => {
    const { pathname } = useLocation()
    const defaultDealsView = useSessionUser((s) => s.user.defaultDealsView)
    const rememberedKanban = dealsIndexRedirect(pathname, defaultDealsView)

    const ResolvedView = useMemo(() => {
        for (const route of routeViews) {
            const matched = route.patterns.some((pattern) =>
                matchPath({ path: pattern, end: true }, pathname),
            )
            if (matched) {
                return route.component
            }
        }
        return DealList
    }, [pathname])

    return (
        <Container>
            {rememberedKanban ? <Navigate to={rememberedKanban} replace /> : <ResolvedView />}
        </Container>
    )
}

export default DealsModule
