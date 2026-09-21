/**
 * FE permission-projection types (E2-13 / FR-SHELL-8/8a/9).
 *
 * Stage 2 (this task): the host consumes the real PDP projection from API-2
 * (`GET /api/v1/projects/:id/permissions`, ui-shell §5). The projection is a NEW
 * computation in the access engine (RBAC matrix + module policies + visibility),
 * NOT a passthrough of `x-permissions`. `usePermission` / `useModulePolicy` read
 * ONLY from this shape; gating is fail-closed (unknown/absent ⇒ deny once a
 * project context exists). A coarse role-derived projection is kept only as a
 * graceful FALLBACK while API-2 errors/has-not-resolved, so the host is not
 * blanked, but it is still default-deny per `subject:action`.
 *
 * Mirrors `PermissionProjection` from ui-shell/TZ §5.1.
 */

/** Permission action vocabulary (glossary: write = create+update). */
export type PermissionAction =
    | 'read'
    | 'write'
    | 'delete'
    | 'manage'
    | 'move'
    | 'export'
    | 'import'
    | 'execute'
    | 'invoke'
    | 'moderate'

/** `subject:action`, e.g. `deals:read`. */
export type PermissionKey = `${string}:${string}`

/** Visibility-by-hierarchy level (FR-SHELL-8a). */
export type VisibilityLevel =
    | 'only_own'
    | 'own_and_shared'
    | 'own_and_subordinates'
    | 'own_and_department'
    | 'all'

export interface VisibilityScope {
    mode: string
    level: VisibilityLevel
    selfId: string
    departmentIds?: string[]
}

export interface PermissionProjection {
    projectId: string
    /** Flat allowed `subject:action` set (context-independent). */
    allowed: string[]
    /** moduleId → { flagKey: boolean } module-policy flags (FR-SHELL-9). */
    modulePolicyFlags: Record<string, Record<string, boolean>>
    /** Visibility-by-hierarchy (FR-SHELL-8a); consumed for UI hints only. */
    visibilityScope?: VisibilityScope
}

/**
 * Resolved projection state for the current (user, project).
 *
 *  - `absent`  — no project context at all (no `:pid` / user has no projects).
 *                There is nothing to gate against; lookups are fail-closed
 *                (deny) since no project means no granted permissions.
 *  - `loading` — a project exists and the real PDP projection (API-2) is being
 *                fetched. Gating is fail-closed (deny) to avoid a flash of
 *                actions the user may not have; UIs may show ST-1 skeletons.
 *  - `derived` — graceful FALLBACK when API-2 errored: a coarse projection
 *                synthesized from the session project role. Still default-deny
 *                per `subject:action`.
 *  - `projection` — the real PDP projection from API-2 (preferred, fail-closed).
 */
export type PermissionProjectionState =
    | { source: 'absent'; projection: null }
    | { source: 'loading'; projection: null }
    | { source: 'unavailable'; projection: null }
    | { source: 'derived'; projection: PermissionProjection }
    | { source: 'projection'; projection: PermissionProjection }
