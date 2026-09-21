import { useMemo } from 'react'
import useSWR from 'swr'
import {
    buildNavigationFromCards,
    firstNavigablePath,
} from '@/configs/navigation.config'
import { NAV_ITEM_TYPE_ITEM } from '@/constants/navigation.constant'
import { useProjectStore, getEnabledModules } from '@/store/projectStore'
import { apiGetOverdueCount } from '@/services/CrmService'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import usePlatformModules from '@/utils/hooks/usePlatformModules'
import usePermission from '@/utils/hooks/usePermission'
import usePermissionProjection from '@/utils/hooks/usePermissionProjection'
import type { NavigationTree } from '@/@types/navigation'

/**
 * FR-ACTIVITIES-090: overdue badge uses the activities domain counter directly.
 */
export function overdueBadgeCount(data?: { count?: number } | null): number {
    return typeof data?.count === 'number' && data.count >= 0 ? data.count : 0
}

/**
 * Permission gate (R3-E1-10 / FR-SHELL-3): drop items whose `requires`
 * (`subject:action`) the user lacks. Items without `requires` pass through.
 * Empty groups (all children gated out) are removed so no orphan headers remain.
 * `can` is the `usePermission()` checker — in stage 1 it is permissive while the
 * PDP projection is absent, so this is a no-op until real projections land.
 */
function filterByPermission(
    tree: NavigationTree[],
    can: (subject: string, action: string) => boolean,
): NavigationTree[] {
    const result: NavigationTree[] = []
    for (const item of tree) {
        if (item.requires) {
            const [subject, action] = item.requires.split(':')
            if (subject && action && !can(subject, action)) continue
        }
        const subMenu = item.subMenu?.length
            ? filterByPermission(item.subMenu, can)
            : item.subMenu
        // Drop a group/collapse that lost all of its children to gating.
        if (
            item.type !== NAV_ITEM_TYPE_ITEM &&
            item.subMenu?.length &&
            subMenu &&
            subMenu.length === 0
        ) {
            continue
        }
        result.push(subMenu === item.subMenu ? item : { ...item, subMenu: subMenu ?? [] })
    }
    return result
}

function injectBadge(tree: NavigationTree[], key: string, badge: number): NavigationTree[] {
    return tree.map((item) => {
        const next = { ...item }
        if (item.key === key && badge > 0) {
            next.badge = badge
        }
        if (item.subMenu?.length) {
            next.subMenu = injectBadge(item.subMenu, key, badge)
        }
        return next
    })
}

export type NavigationConfigResult = {
    tree: NavigationTree[]
    /** Menu states for SCR-SHELL-CHROME-SIDENAV (loading / error / empty / data). */
    isLoading: boolean
    error: unknown
    /** True when modules resolved but contribute no menu items. */
    isEmpty: boolean
    /**
     * True once the manifest module source resolved (from API or fallback) — the
     * menu tree is final. Consumers that redirect to the first menu item must wait
     * for this so they don't navigate off a not-yet-loaded (statistics-default) tree.
     */
    ready: boolean
    /**
     * Path of the FIRST navigable menu item (same source/order as the sidebar), or
     * null when the tree is empty. Project entry redirects use this instead of a
     * hardcoded `/statistics`.
     */
    firstPath: string | null
}

/**
 * Manifest-driven navigation hook (R3-E1-08-fe / FR-SHELL-1).
 *
 * Builds the menu from the project's module cards (platform endpoint) instead of
 * a hardcoded tree. Returns explicit menu states so the chrome can render
 * loading / error / empty per the screens contract.
 */
export function useNavigationConfigWithState(): NavigationConfigResult {
    const resolvedProjectId = useResolvedProjectId()

    const { enabledCards, error, ready: modulesReady } = usePlatformModules()
    const can = usePermission()

    // Contextual UI = (enabled modules) ∩ (permissions). The permission half is
    // fail-closed: while the PDP projection is still LOADING, `can` denies every
    // `requires` → `filterByPermission` transiently strips the whole tree, so
    // `firstPath` is momentarily null. Consumers that redirect to the first menu
    // item (ProjectHomeRedirect / Home / usePortfolioProjectGuard) must therefore
    // wait for the projection too — otherwise a JUST-CREATED project (projection
    // still in flight) bounces onto the empty-menu fallback `/account/projects`
    // instead of its first module (T-002). `absent` (no project) and `derived`
    // (API-2 error → role fallback) are terminal, not loading.
    const permReady = usePermissionProjection().source !== 'loading'
    // The full navigation tree is FINAL only when BOTH the module manifest and the
    // permission projection have resolved. This is the single `ready` the redirect
    // consumers gate on.
    const ready = modulesReady && permReady

    // FR-ACTIVITIES-090: badge from activities overdue-count (not statistics dashboard).
    const currentProject = useProjectStore((s) => s.currentProject)
    const activitiesEnabled =
        currentProject != null &&
        currentProject.id === resolvedProjectId &&
        getEnabledModules(currentProject).includes('activities')
    const canReadActivities = can('activities', 'read')
    const shouldFetchOverdue = Boolean(
        resolvedProjectId && activitiesEnabled && canReadActivities,
    )

    const { data: overdueData } = useSWR<{ count: number }>(
        shouldFetchOverdue ? ['/api/v1/activities/overdue-count', resolvedProjectId] : null,
        () => apiGetOverdueCount<{ count: number }>(resolvedProjectId),
        { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 30_000 },
    )
    const overdueCount = overdueBadgeCount(overdueData)

    const tree = useMemo(() => {
        if (!ready) return []
        // Contextual UI = (enabled modules) ∩ (permissions). Enablement is already
        // applied (only `enabledCards` reach here, FR-SHELL-12); the permission
        // intersection (FR-SHELL-3) is applied via usePermission below.
        let built = buildNavigationFromCards(enabledCards)
        // box single-tenant: каждый пользователь состоит в единственной Системе,
        // отдельного гейта «есть доступ к орг» нет — фильтруем только по правам.
        built = filterByPermission(built, can)
        return injectBadge(built, 'portfolio.activities', overdueCount)
    }, [enabledCards, ready, overdueCount, can])

    const firstPath = useMemo(() => firstNavigablePath(tree), [tree])

    return {
        tree,
        // Loading until the tree is FINAL (modules + permissions) — prevents the
        // sidebar flashing an empty menu while the PDP projection is in flight.
        isLoading: !ready && !error,
        // Surface only the module-manifest error (fail-closed); permission-load is
        // not an error state.
        error: modulesReady ? null : error,
        // Genuinely empty only after BOTH sources resolved and the tree is still
        // empty (no enabled+permitted modules).
        isEmpty: ready && tree.length === 0,
        ready,
        firstPath,
    }
}

/** Back-compat: components that only need the tree. */
export default function useNavigationConfig(): NavigationTree[] {
    return useNavigationConfigWithState().tree
}
