import { useLayoutEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import { useLiveProjects } from '@/utils/hooks/useLiveProjects'
import useSessionHydrated from '@/utils/hooks/useSessionHydrated'
import { useNavigationConfigWithState } from '@/utils/hooks/useNavigationConfig'
import useModulePolicy from '@/utils/hooks/useModulePolicy'
import { buildRouteToModuleFromCards, ROUTE_TO_MODULE } from '@/configs/module-nav.config'
import usePlatformModules from '@/utils/hooks/usePlatformModules'
import type { NavigationTree } from '@/@types/navigation'

/**
 * Route prefix → module key that must be enabled+permitted for the route to open.
 *
 * Derived at runtime from manifest navigation (`buildRouteToModuleFromCards`) so
 * new host screens from MODULE_NAV_EXTRA stay gated without editing this file.
 * `/search` is intentionally excluded (cross-cutting, T-018).
 * `/audit` and `/roles` are project-management screens gated by permissions only.
 */
export { ROUTE_TO_MODULE } from '@/configs/module-nav.config'

export const PROJECT_ROOTS = [
    ...ROUTE_TO_MODULE.map((r) => r.prefix),
    '/search',
    '/members',
    '/audit',
    '/roles',
]

/**
 * Модуль, который обязан быть включён+разрешён, чтобы маршрут открылся, либо
 * `null` для маршрутов вне таблицы.
 */
export function requiredModuleForPath(
    pathname: string,
    routeTable: Array<{ prefix: string; module: string }> = ROUTE_TO_MODULE,
): string | null {
    for (const { prefix, module } of routeTable) {
        if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
            return module
        }
    }
    return null
}

/** Маршруты портфеля и настроек проекта по /p/:pid — без проекта недоступны */
export function pathRequiresProject(pathname: string): boolean {
    if (
        pathname.startsWith('/account') ||
        pathname === '/' ||
        pathname.startsWith('/onboarding') ||
        pathname.startsWith('/help') ||
        pathname.startsWith('/terms') ||
        pathname.startsWith('/settings') ||
        pathname.startsWith('/projects') ||
        pathname.startsWith('/auth')
    ) {
        return false
    }
    for (const root of PROJECT_ROOTS) {
        if (pathname === root || pathname.startsWith(`${root}/`)) return true
    }
    if (/^\/p\/[^/]+/.test(pathname)) return true
    return false
}

/**
 * TODO-236/273: `/search` — верхнеуровневый роут портфеля (routes.config
 * `portfolio.search`), а не `/p/:pid/...`, поэтому он обязан быть в
 * `portfolioRoots` (без проекта искать негде → /account/projects).
 *
 * НО его СОЗНАТЕЛЬНО НЕТ в `ROUTE_TO_MODULE`: гейт «модуль search включён в
 * проекте» здесь НЕВЕРЕН и делал экран недостижимым. Поиск — cross-cutting
 * возможность, ни один проект не включает модуль `search` по умолчанию
 * (control `DEMO_SHOWCASE_MODULES` без 'search', module-registry
 * `locked: false`). Серверный PEP это и фиксирует: `GET /api/search/query`
 * помечен `@RequirePermission('search','read')` и НАМЕРЕННО без
 * `@RequireModule('search')` (common-bff.controller.ts, T-018). Тот же контракт
 * у лупы в шапке (Search.tsx: гейт только по module-policy). Расхождение
 * приводило к: лупа ищет и отдаёт результаты → «Открыть страницу поиска» →
 * гвард мгновенно уводит на первый пункт меню.
 *
 * Поэтому страница гейтится ровно тем же признаком, что шапка и сервер: явное
 * project-wide deny-правило на `search:read` (module-policy overlay).
 */
const SEARCH_PREFIX = '/search'

/**
 * Module keys that survived enablement ∩ permission gating — i.e. the modules the
 * sidebar actually renders. Derived from the SAME navigation tree the chrome uses,
 * so the guard's «is this route enabled?» decision matches what the user sees
 * (no separate statistics-first default list — T-002).
 */
function enabledModuleKeys(tree: NavigationTree[]): Set<string> {
    const keys = new Set<string>()
    const walk = (items: NavigationTree[]) => {
        for (const it of items) {
            if (it.moduleKey) keys.add(it.moduleKey)
            if (it.subMenu?.length) walk(it.subMenu)
        }
    }
    walk(tree)
    return keys
}

export default function usePortfolioProjectGuard(): void {
    const location = useLocation()
    const navigate = useNavigate()
    const sessionHydrated = useSessionHydrated()
    const projectId = useResolvedProjectId()
    const { projects: userProjects } = useLiveProjects()
    // Single source of truth (same as ProjectHomeRedirect / Home / sidebar): the
    // manifest module tree. `firstPath` is the first menu item; `ready` gates the
    // async resolve; the tree also tells us which modules are actually enabled.
    const { tree, firstPath, ready } = useNavigationConfigWithState()
    const { cards } = usePlatformModules()
    const routeTable = useMemo(() => {
        const fromCards = buildRouteToModuleFromCards(cards)
        return fromCards.length > 0 ? fromCards : ROUTE_TO_MODULE
    }, [cards])
    const enabledKeys = useMemo(() => enabledModuleKeys(tree), [tree])
    // Тот же гейт, что у лупы в шапке: только явное deny на `search:read`.
    // Пока проекция прав не загружена, `flag(..., true)` отдаёт true — экран не
    // мигает редиректом (гейт UX-ный, источник истины — сервер).
    const searchDenied = !useModulePolicy('search').flag('search:read', true)
    const projectIds = useMemo(
        () => new Set(userProjects.map((p) => p.id)),
        [userProjects],
    )

    useLayoutEffect(() => {
        if (!sessionHydrated) return

        const path = location.pathname
        if (!pathRequiresProject(path)) return

        const pMatch = path.match(/^\/p\/([^/]+)/)
        if (pMatch && userProjects.length > 0 && !projectIds.has(pMatch[1])) {
            navigate('/account/projects', { replace: true })
            return
        }

        if (!projectId) {
            navigate('/account/projects', { replace: true })
            return
        }

        // /search гейтится module-policy, а НЕ включённостью модуля (см.
        // SEARCH_PREFIX): маршрута нет в ROUTE_TO_MODULE, поэтому ветка своя.
        // `ready` — та же защита от гонки T-002, что у enablement-редиректа ниже.
        if (
            ready &&
            (path === SEARCH_PREFIX || path.startsWith(`${SEARCH_PREFIX}/`))
        ) {
            const fallback = firstPath ?? '/account/projects'
            if (searchDenied && fallback !== path) {
                navigate(fallback, { replace: true })
            }
            return
        }

        // Enablement redirect needs the FINAL module tree. Acting while `ready` is
        // false (tree empty) would treat every module as disabled and bounce the
        // user off a valid route — the very race T-002 is about. Wait for it.
        if (!ready) return

        const requiredModule = requiredModuleForPath(path, routeTable)
        if (requiredModule && !enabledKeys.has(requiredModule)) {
            // Fallback = first menu item (firstPath), the same target the
            // project-home dispatcher uses — never a hardcoded /statistics.
            const fallback = firstPath ?? '/account/projects'
            if (fallback !== path) {
                navigate(fallback, { replace: true })
            }
        }
    }, [sessionHydrated, location.pathname, projectId, navigate, userProjects.length, projectIds, enabledKeys, ready, firstPath, searchDenied, routeTable])
}
