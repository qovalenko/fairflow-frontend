import { useCallback } from 'react'
import useOrgPermissionProjection from '@/utils/hooks/useOrgPermissionProjection'
import { toCanonicalOrgKey } from '@/configs/org-permission.config'

/**
 * `useOrgPermission()` — system-structure gating hook (P8-T4.3, E-ORG).
 *
 * box single-tenant: there is one system, so no `orgId` is passed. Returns a
 * checker over SHORT screen keys (`employees`, `write` etc.) that maps them to
 * the canonical `org:*` vocabulary and looks them up in the backend projection.
 *
 * FE gating is UX, not security — the backend SystemAccessGuard + control PDP
 * remain authoritative (a hidden control authorizes nothing).
 *
 * Fail-closed (no PERMISSIVE branch — there is always a system to gate):
 *  - `loading` (projection in flight / not signed in) → DENY (no flash).
 *  - `projection` | `derived` → strict lookup; default-deny for any unmapped or
 *    absent key.
 *
 * A short key with NO canonical mapping (`ORG_KEY_MAP`) is treated as ungated
 * (returns true) — the screen's own membership floor / logic decides; we never
 * invent a deny for an unknown key, to avoid silently blanking new UI.
 */
function useOrgPermission(): (subject: string, action: string) => boolean {
    const state = useOrgPermissionProjection()

    return useCallback(
        (subject: string, action: string): boolean => {
            // Projection not ready → DENY (fail-closed).
            if (!state.allowed) return false

            const canonical = toCanonicalOrgKey(subject, action)
            // Unmapped short key → not projection-gated (screen decides).
            if (!canonical) return true
            return state.allowed.includes(canonical)
        },
        [state],
    )
}

export default useOrgPermission
