import { useMemo } from 'react'
import useSWR from 'swr'
import { useSessionUser } from '@/store/authStore'
import {
    apiGetOrgPermissionProjection,
    type OrgPermissionProjection,
} from '@/services/PermissionService'
import { orgRoleDefaultAllowed } from '@/configs/org-permission.config'
import type { OrgRole } from '@/@types/auth'

/**
 * Resolves the system-structure permission projection for the current user —
 * the org counterpart of `usePermissionProjection` (P8-T4.3, E-ORG). box is
 * single-tenant: there is exactly ONE system, so no `orgId` is threaded; the
 * source is the backend PDP (`GET /api/v1/system/me/permissions`) and the host
 * NEVER computes org-RBAC — it renders what the engine returns.
 *
 * States (fail-closed):
 *  - not signed in    → `loading` (deny — projection not yet available).
 *  - fetching         → `loading` (lookups deny — no flash of unowned actions).
 *  - API ok           → `projection` (preferred, honours custom HR roles/grants).
 *  - API error        → `derived`  (coarse fallback from the session system role,
 *                        else deny). Still default-deny per key.
 */
export type OrgProjectionState =
    | { source: 'loading'; allowed: null; orgRole: '' }
    | { source: 'derived'; allowed: string[]; orgRole: string }
    | { source: 'projection'; allowed: string[]; orgRole: string }

export default function useOrgPermissionProjection(): OrgProjectionState {
    const signedIn = useSessionUser((s) => s.session.signedIn)
    const systemRole = useSessionUser(
        (s) => s.user.systemRole ?? s.user.system?.role,
    )

    // box single-tenant: session-scoped projection, no orgId in the key.
    const swrKey = signedIn ? ['system-permission/projection'] : null

    const { data: projection, error } = useSWR<OrgPermissionProjection>(
        swrKey,
        () => apiGetOrgPermissionProjection(),
        {
            revalidateOnFocus: false,
            shouldRetryOnError: true,
            errorRetryCount: 2,
            dedupingInterval: 30_000,
        },
    )

    return useMemo<OrgProjectionState>(() => {
        // Real backend projection — preferred, fail-closed source of truth.
        if (projection) {
            return {
                source: 'projection',
                allowed: projection.allowed,
                orgRole: projection.orgRole,
            }
        }

        // API failed → coarse fallback from the session system role. Unknown
        // role → read-only floor; a non-member yields an empty allow-set (deny).
        if (error) {
            const role: OrgRole | undefined = systemRole
            return {
                source: 'derived',
                allowed: role ? orgRoleDefaultAllowed(role) : [],
                orgRole: role ?? '',
            }
        }

        // Still resolving / not signed in → fail-closed loading (deny).
        return { source: 'loading', allowed: null, orgRole: '' }
    }, [projection, error, systemRole])
}
