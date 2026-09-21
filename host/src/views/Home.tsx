import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useSessionUser } from '@/store/authStore'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import { useLiveProjects } from '@/utils/hooks/useLiveProjects'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import useSessionHydrated from '@/utils/hooks/useSessionHydrated'
import { useNavigationConfigWithState } from '@/utils/hooks/useNavigationConfig'
import Loading from '@/components/shared/Loading'
import { resolveLandingRoute } from '@/utils/resolveLandingRoute'
import { qa, qaWithAlias } from '@/shared/qa'

/**
 * SCR-ONB-LANDING-RESOLVER — invisible landing dispatcher (FR-ONB-1, §C.1).
 *
 * Routes the signed-in user via the single deterministic `resolveLandingRoute`
 * (no-dead-end), replacing the AS-IS scattered redirects. For `hasProjects` the
 * concrete destination is the first enabled-module path (module-aware); Home
 * maps the resolver's `project` branch onto that landing.
 *
 * ST-1 loader / ST-6 bootstrap-fail are owned by ProtectedRoute + bootstrap
 * (ui-shell); here ctx is read from the persisted session store.
 */
const Home = () => {
    const navigate = useNavigate()
    const sessionHydrated = useSessionHydrated()
    const user = useSessionUser((state) => state.user)
    const { projects } = useLiveProjects()
    const resolvedId = useResolvedProjectId()
    // box: пустой список проектов ветвится по роли в Системе — владелец/админ
    // идёт в мастер, сотрудник — на NO-PROJECTS.
    const { isSystemOwnerOrAdmin } = useWorkspaceRole()
    // Single source of truth for the project landing target — SAME hook the
    // project-home dispatcher and the sidebar use: the manifest module tree
    // (enabled ∩ permitted). `firstPath` is its first menu item; `ready` gates
    // the async resolve so we never redirect off a not-yet-loaded tree.
    const { firstPath, ready } = useNavigationConfigWithState()

    useEffect(() => {
        if (!sessionHydrated) return

        const target = resolveLandingRoute(
            {
                hasProjects: projects.length > 0,
                lastActiveProjectId: user.lastActiveProjectId ?? resolvedId,
                canCreateProject: isSystemOwnerOrAdmin,
                projects,
            },
            { fallbackProjectId: resolvedId },
        )

        switch (target.kind) {
            case 'project': {
                // Wait for the module tree to resolve (T-002 race): before `ready`
                // the tree is empty and firstPath would fall back / a stale default
                // could point at a disabled /statistics. Redirect only when final.
                if (!ready) return
                navigate(firstPath ?? '/account/projects', { replace: true })
                break
            }
            case 'entry-choice':
                navigate('/onboarding', { replace: true })
                break
            case 'no-projects':
                navigate('/onboarding/no-projects', { replace: true })
                break
            case 'portfolio':
                navigate('/account/projects', { replace: true })
                break
        }
    }, [
        sessionHydrated,
        navigate,
        projects,
        resolvedId,
        ready,
        firstPath,
        user.lastActiveProjectId,
        isSystemOwnerOrAdmin,
    ])

    // Loading shell until the redirect effect above fires (TODO-514): both the
    // pre-hydration and post-hydration renders are transient.
    return (
        <div
            className="flex flex-auto flex-col h-[100vh] justify-center items-center"
            {...qaWithAlias('host.onboarding.home.loader', 'host.home.loading')}
        >
            <Loading loading={true} />
        </div>
    )
}

export default Home

