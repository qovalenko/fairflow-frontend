import { useCallback } from 'react'
import usePermissionProjection from '@/utils/hooks/usePermissionProjection'
import type { PermissionProjection } from '@/@types/permission'

/**
 * `usePermission(subject, action)` — FE gating hook (E2-13 / FR-SHELL-8).
 *
 * Pure projection lookup; the host NEVER computes RBAC/ABAC (FR-SHELL-11).
 * FE gating is UX, not security — backend-guard remains the source of truth
 * (BR-SHELL-4): hiding a control here does not authorize anything.
 *
 * Stage 2 (E2-13): the projection source is the real PDP projection (API-2).
 * Gating is FAIL-CLOSED:
 *  - `projection` | `derived` (fallback): strict lookup, default-deny for any
 *    unknown `subject:action`.
 *  - `loading` (project context, PDP fetch in flight): DENY — no flash of
 *    actions the user may not actually hold.
 *  - `absent` (no project context at all — account/organization surfaces, or
 *    user has no projects): PERMISSIVE — there is no project to gate against,
 *    so project-scoped gates do not apply; non-project pages stay usable.
 *
 * Two call forms:
 *   const can = usePermission()            // → (subject, action) => boolean
 *   const canDelete = usePermission('deals', 'delete')   // → boolean
 */
function usePermission(): (subject: string, action: string) => boolean
function usePermission(subject: string, action: string): boolean
function usePermission(
    subject?: string,
    action?: string,
): boolean | ((s: string, a: string) => boolean) {
    const state = usePermissionProjection()

    const check = useCallback(
        (s: string, a: string): boolean => {
            // No project context at all → nothing project-scoped to gate; keep
            // non-project surfaces usable (permissive only when truly absent).
            if (state.source === 'absent') return true
            // Project exists but projection not ready (loading) or null → DENY
            // (fail-closed, BR-SHELL-4).
            if (!state.projection) return false
            return isAllowed(state.projection, s, a)
        },
        [state],
    )

    if (typeof subject === 'string' && typeof action === 'string') {
        return check(subject, action)
    }
    return check
}

/**
 * Mirror of backend `DECORATOR_SUBJECT_MAP` (permission-rbac.ts, FR-PERM-25).
 * Route/screen decorators use module subjects (`deals:move`) while the PDP
 * projection carries catalog keys (`deals.stage:move`).
 */
const DECORATOR_KEY_MAP: Record<string, string[]> = {
    'deals:move': ['deals.stage:move'],
    'documents:generate': ['documents.generate:execute'],
    'companies:reassign': ['companies.owner:write'],
    'companies:execute': ['companies:write', 'companies:delete'],
}

/**
 * Lookup `subject:action` against the projection's `allowed[]`, supporting the
 * skeleton wildcard form `*:action` (role grants the action on any subject)
 * alongside the precise `subject:action` form used by the real PDP projection.
 */
function isAllowed(
    projection: PermissionProjection,
    subject: string,
    action: string,
): boolean {
    if (!subject || !action) return false
    const decoratorKey = `${subject}:${action}`
    const catalogKeys = DECORATOR_KEY_MAP[decoratorKey] ?? [decoratorKey]
    const wildcard = `*:${action}`
    return catalogKeys.every(
        (key) =>
            projection.allowed.includes(key) ||
            projection.allowed.includes(wildcard),
    )
}

export default usePermission

/**
 * Convenience: gate from a `requires` string (`subject:action`).
 * Empty/undefined `requires` → ungated (true). Used by the navigation builder
 * and MountSlot framework to keep call-sites terse.
 */
export function useRequiresPermission(requires?: string): boolean {
    const check = usePermission()
    if (!requires) return true
    const [subject, action] = requires.split(':')
    if (!subject || !action) return true
    return check(subject, action)
}
