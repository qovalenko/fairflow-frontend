import { useMemo, type ComponentType } from 'react'
import { matchPath, useLocation } from 'react-router'
import Dashboard from './Dashboard'
import Analytics from './Analytics'
import { useRoutePid } from './statistics.shared'
import { qa } from './qa'

/**
 * StatisticsModule — вид-роутер системной области «Статистика и дашборд»
 * (federated remote `remoteStatistics`). Разводит два TO-BE-экрана
 * (SCREENS §0, FR-MSTAT-16):
 *  - `/dashboard`, `/p/:pid/dashboard` → SCR-STATISTICS-DASHBOARD (операционный);
 *  - `/statistics`, `/p/:pid/statistics` → SCR-STATISTICS-ANALYTICS (аналитика).
 *
 * AS-IS совмещал оба в `Statistics.tsx`, `/dashboard` был чистым редиректом —
 * TO-BE делает `/dashboard` самостоятельным экраном (FR-MSTAT-16). Каждый экран
 * сам несёт `<Container>` и гейт по праву `statistics:read`.
 */
type RouteView = {
    patterns: string[]
    component: ComponentType
}

const routeViews: RouteView[] = [
    {
        patterns: ['/dashboard', '/p/:pid/dashboard'],
        component: Dashboard,
    },
    {
        patterns: ['/statistics', '/p/:pid/statistics'],
        component: Analytics,
    },
]

const StatisticsModule = () => {
    const { pathname } = useLocation()
    const routePid = useRoutePid()

    const { ResolvedView, viewKey } = useMemo(() => {
        for (const route of routeViews) {
            const matched = route.patterns.some((pattern) =>
                matchPath({ path: pattern, end: true }, pathname),
            )
            if (matched) {
                const viewKey = route.patterns.some((p) => p.includes('/dashboard'))
                    ? 'dashboard'
                    : 'analytics'
                return { ResolvedView: route.component, viewKey }
            }
        }
        // По умолчанию (например портфельный вход) — аналитический экран.
        return { ResolvedView: Analytics, viewKey: 'analytics' as const }
    }, [pathname])

    return (
        <div
            {...qa('statistics.module.root', {
                view: viewKey,
                ...(routePid ? { pid: routePid } : {}),
            })}
        >
            <ResolvedView />
        </div>
    )
}

export default StatisticsModule
