import { useMemo, type ComponentType } from 'react'
import { matchPath, useLocation } from 'react-router'
import { Container } from '@fairflow/shared-ui'
import Reports from './Reports'
import ReportBuilder from './ReportBuilder'

type RouteView = {
    patterns: string[]
    component: ComponentType
}

const routeViews: RouteView[] = [
    {
        patterns: ['/reports/builder'],
        component: ReportBuilder,
    },
    {
        patterns: ['/reports'],
        component: Reports,
    },
]

const ReportsModule = () => {
    const { pathname } = useLocation()

    const ResolvedView = useMemo(() => {
        for (const route of routeViews) {
            const matched = route.patterns.some((pattern) =>
                matchPath({ path: pattern, end: true }, pathname),
            )
            if (matched) {
                return route.component
            }
        }
        return Reports
    }, [pathname])

    return (
        <Container>
            <ResolvedView />
        </Container>
    )
}

export default ReportsModule
