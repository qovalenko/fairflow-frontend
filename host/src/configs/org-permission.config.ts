import type { OrgRole } from '@/@types/auth'

/**
 * Org-structure permission projection config (P8-T4.3, E-ORG).
 *
 * The org screens gate on SHORT, screen-local keys (`orgAudit:read`,
 * `departments:read`, `organization:manage`, `employees:write`, …) that predate
 * the backend org-RBAC vocabulary. The backend PDP now returns the CANONICAL
 * org-structure allow-set (`org:employees:read`, `org:employees:manage`,
 * `org:departments:{read,manage}`, `org:units:{read,manage}`,
 * `org:invitations:manage`, `org:profile:{read,manage}`, `org:audit:read`,
 * `org:seats:read` — see backend `shared/src/org-rbac.ts ORG_STRUCTURE_SUBJECTS`).
 *
 * This module is the ADAPTER: a short `subject:action` used by a screen maps to
 * one canonical `org:*` key, so the existing screens keep their terse
 * `usePermission('employees','write')` call-sites while the decision comes from
 * the real backend projection. No screen is rewritten en masse.
 *
 * Mapping rationale:
 *  - all MUTATION verbs on a subject (`write`/`delete`/`revoke`/`resend`/`manage`)
 *    collapse onto the single canonical `…:manage` key (the backend has one
 *    manage action per subject — it never split create/update/delete for the org
 *    structure);
 *  - `read` maps to the canonical `…:read`;
 *  - `organization:read` is the membership floor (any active member) → maps to
 *    `org:profile:read` which every member carries;
 *  - `organization:manage` (edit requisites / deactivate org / edit units /
 *    visibility policy) → `org:profile:manage` (owner/admin only by default);
 *  - `bindings:*` and access-unit editing ride on `org:units:*`.
 */

/** Canonical org-structure keys the backend PDP emits (mirror of ORG_STRUCTURE_KEYS). */
export type CanonicalOrgKey =
    | 'org:employees:read'
    | 'org:employees:manage'
    | 'org:departments:read'
    | 'org:departments:manage'
    | 'org:units:read'
    | 'org:units:manage'
    | 'org:invitations:manage'
    | 'org:profile:read'
    | 'org:profile:manage'
    | 'org:audit:read'
    | 'org:seats:read'

/**
 * Short `subject:action` (as used in the org screens) → canonical `org:*` key.
 * A short key absent from this table is treated as ungated-by-projection (the
 * screen's own logic / membership floor decides) — we never invent a deny for an
 * unmapped key, to avoid silently hiding UI when a new screen key appears.
 */
export const ORG_KEY_MAP: Record<string, CanonicalOrgKey> = {
    // employees
    'employees:read': 'org:employees:read',
    'employees:write': 'org:employees:manage',
    'employees:delete': 'org:employees:manage',
    'employees:manage': 'org:employees:manage',
    // departments
    'departments:read': 'org:departments:read',
    'departments:write': 'org:departments:manage',
    'departments:delete': 'org:departments:manage',
    'departments:manage': 'org:departments:manage',
    // units / department bindings / access-unit + visibility editors
    'units:read': 'org:units:read',
    'units:manage': 'org:units:manage',
    'bindings:read': 'org:units:read',
    'bindings:manage': 'org:units:manage',
    // invitations
    'invitations:read': 'org:invitations:manage',
    'invitations:write': 'org:invitations:manage',
    'invitations:revoke': 'org:invitations:manage',
    'invitations:resend': 'org:invitations:manage',
    'invitations:manage': 'org:invitations:manage',
    // org profile / requisites / deactivation
    'organization:read': 'org:profile:read',
    'organization:manage': 'org:profile:manage',
    'profile:read': 'org:profile:read',
    'profile:manage': 'org:profile:manage',
    // audit
    'orgAudit:read': 'org:audit:read',
    'audit:read': 'org:audit:read',
    // seats
    'seats:read': 'org:seats:read',
    // TODO-026 (box): `orgOverview:read` / `orgOverview:export` удалены вместе с
    // контуром org-overview (кросс-проектный обзор — облачная поверхность, в
    // коробке нет «Организации»; роллап не имел писателя).
}

/** Resolve a short `subject:action` to its canonical `org:*` key, or null if unmapped. */
export function toCanonicalOrgKey(
    subject: string,
    action: string,
): CanonicalOrgKey | null {
    return ORG_KEY_MAP[`${subject}:${action}`] ?? null
}

/**
 * FALLBACK ONLY (projection API unavailable): the canonical allow-set an org role
 * carries by default. Mirrors the backend system-org-role expansion
 * (`expandSystemOrgRolePermissions`): owner/admin → full vocabulary; employee →
 * read-only structure view (NO audit, NO invitations, NO manage). This is a
 * degraded approximation used only while the projection errors — the real set
 * comes from the backend PDP (which honours custom HR roles / grants).
 */
const FULL_ORG_VOCAB: CanonicalOrgKey[] = [
    'org:employees:read',
    'org:employees:manage',
    'org:departments:read',
    'org:departments:manage',
    'org:units:read',
    'org:units:manage',
    'org:invitations:manage',
    'org:profile:read',
    'org:profile:manage',
    'org:audit:read',
    'org:seats:read',
]

const EMPLOYEE_ORG_KEYS: CanonicalOrgKey[] = [
    'org:employees:read',
    'org:departments:read',
    'org:units:read',
    'org:seats:read',
    'org:profile:read',
]

export function orgRoleDefaultAllowed(role: OrgRole | undefined): CanonicalOrgKey[] {
    if (role === 'platform_owner' || role === 'platform_admin') {
        return [...FULL_ORG_VOCAB]
    }
    // employee (or unknown) → read-only structure view.
    return [...EMPLOYEE_ORG_KEYS]
}
