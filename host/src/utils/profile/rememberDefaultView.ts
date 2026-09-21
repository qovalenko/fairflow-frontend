import { apiUpdateMyProfile } from '@/services/AuthService'
import { useSessionUser } from '@/store/authStore'

export type DefaultViewField = 'defaultDealsView' | 'defaultActivitiesView'

/**
 * FR-PROFILE-050 / FR-MPROF-4: persist the last used module view into profile
 * (`default_deals_view` / `default_activities_view`). Fire-and-forget — a failed
 * sync must not block navigation.
 */
export async function rememberProfileDefaultView(
    field: DefaultViewField,
    value: string,
    current?: string | null,
): Promise<void> {
    if (!value || value === (current ?? '')) return
    // Optimistic write so index→default-view redirect does not bounce the
    // user back while PATCH /v1/auth/me is in flight.
    useSessionUser.getState().setUser({ [field]: value })
    try {
        const resp = await apiUpdateMyProfile({ [field]: value })
        const next = resp?.user?.[field]
        if (typeof next === 'string' && next && next !== value) {
            useSessionUser.getState().setUser({ [field]: next })
        }
    } catch {
        // navigation already happened; profile form remains the manual override path
    }
}

/** Index `/deals` → kanban when the remembered default is the board. */
export function dealsIndexRedirect(
    pathname: string,
    defaultView?: string | null,
): string | null {
    if (defaultView !== 'kanban') return null
    if (pathname === '/deals' || pathname === '/deals/') return '/deals/kanban'
    const scoped = pathname.match(/^\/p\/([^/]+)\/deals\/?$/)
    if (scoped) return `/p/${scoped[1]}/deals/kanban`
    return null
}

export function useRememberProfileDefaultView(field: DefaultViewField) {
    const current = useSessionUser((s) => s.user[field])
    return (value: string) => {
        void rememberProfileDefaultView(field, value, current)
    }
}
