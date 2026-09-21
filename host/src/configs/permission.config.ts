import type { ProjectRole } from '@/@types/auth'
import type { PermissionAction } from '@/@types/permission'

/**
 * Stage-1 role → allowed actions defaults (R3-E1-10 skeleton).
 *
 * This is NOT the permission engine — the real per-(user, project) projection
 * (RBAC matrix + module policies + ABAC) is computed by the backend PDP and
 * delivered via API-2 in stage 2 (E2-13). Until then, `usePermission` derives a
 * coarse projection from the current project role so the gating MECHANISM is in
 * place and exercised. When the PDP projection lands, this map is bypassed
 * (see permission-projection.ts: `source:'projection'`).
 *
 * Kept deliberately permissive to avoid hiding UI the user actually has in the
 * AS-IS role model (FE gating is UX, not security — backend-guard is the truth).
 */

const ALL_ACTIONS: PermissionAction[] = [
    'read',
    'write',
    'delete',
    'manage',
    'move',
    'export',
    'import',
    'execute',
    'invoke',
    'moderate',
]

const READ_ONLY: PermissionAction[] = ['read', 'export']

const WRITER: PermissionAction[] = ['read', 'write', 'move', 'export', 'execute', 'invoke']

/**
 * Default actions a project role is assumed to hold on any business subject.
 * `manage`/`delete`/`import` are reserved for elevated roles (owner/admin/manager);
 * `import` is a bulk mutation, so member/viewer never hold it (BX-ACL-BE-1).
 */
export const ROLE_ACTION_DEFAULTS: Record<ProjectRole, PermissionAction[]> = {
    owner: ALL_ACTIONS,
    admin: ALL_ACTIONS,
    // `moderate` mirrors backend rbac.ts: manager (department head) may
    // edit/delete other members' chat messages (FR-CHAT-49).
    manager: [...WRITER, 'delete', 'import', 'moderate'],
    member: WRITER,
    viewer: READ_ONLY,
}

/** Roles allowed to see project-management surfaces (`project:manage`). */
export const PROJECT_MANAGE_ROLES: ProjectRole[] = ['owner', 'admin', 'manager']
