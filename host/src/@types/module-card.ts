/**
 * FE projection of the platform module nav-card returned by
 * `GET /api/v1/platform/modules` (be task R3-E1-08-be → `ModuleNavCard[]`).
 *
 * Source of truth for host navigation/routing — replaces the hardcoded
 * navigation tree (FR-SHELL-1/2/3, ux/screens/shell SCR-SHELL-CHROME-SIDENAV).
 *
 * Mirrors the be `ModuleNavCard` contract (shared module-manifest.ts):
 *   { id, displayName, description?, icon?, kind, version,
 *     navigation[{path,label,icon?,requires?}],
 *     mountPoints[{slot,component,requires?,order?,requiresContext?}],
 *     requiredPermissions[], enabled }
 * Kept tolerant (optional fields + `enabledInProject` alias) so partial/legacy
 * responses don't break the host.
 */

export interface ModuleCardNavigation {
    /** Route path relative to the project context, e.g. `/contacts`. */
    path: string
    /** Human-readable menu label. */
    label: string
    /** Icon key (resolved against navigation-icon.config; falls back to module id). */
    icon?: string
    /** Sort order within the menu group (ascending). Be cards omit it → fe presets/fallback. */
    order?: number
    /** Permission gate `subject:action` (TO-BE: usePermission, R3-E1-10). */
    requires?: string
}

export interface ModuleCardMountPoint {
    /** Slot id from the host SLOT_CATALOG. */
    slot: string
    /** Exposed component name in the remote bundle. */
    component: string
    order?: number
    requires?: string
    requiresContext?: string[]
}

export interface ModuleCard {
    /** Module id (= manifest id, matches a remote folder for 1st-party). */
    id: string
    /** Display name (card title / menu label fallback). */
    displayName: string
    description?: string
    /** Icon key. */
    icon?: string
    /** Module kind — `system` modules are never gated by enablement (FR-SHELL-20a). */
    kind?: 'system' | 'business' | 'partner'
    version?: string
    /** Navigation contribution(s) of the module. */
    navigation?: ModuleCardNavigation[]
    /** Mount-point contributions (consumed by R3-E1-10 / MountSlot). */
    mountPoints?: ModuleCardMountPoint[]
    /** Quick-create / global drawer entity types (FR-SHELL-270 / FR-MOD-28). */
    drawerEntities?: string[]
    /** Flat `subject:action` permissions (consumed by R3-E1-10 / usePermission). */
    requiredPermissions?: string[]
    /**
     * Whether the module is enabled in the current project (canonical be field).
     * `enabledInProject` accepted as alias for shared `ModuleCard`.
     */
    enabled?: boolean
    enabledInProject?: boolean
}

/** Normalize the enabled flag across `enabled` / `enabledInProject`. */
export function isCardEnabled(card: ModuleCard): boolean {
    if (typeof card.enabled === 'boolean') return card.enabled
    if (typeof card.enabledInProject === 'boolean') return card.enabledInProject
    // Absent flag → treat as enabled (the endpoint already returns project-scoped cards).
    return true
}
