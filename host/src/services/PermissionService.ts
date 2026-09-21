import ApiService from './ApiService'
import type { AxiosError } from 'axios'
import type { PermissionProjection } from '@/@types/permission'

/**
 * Access-engine (PDP) API client — host FE gating source of truth (E2-13).
 *
 * Endpoints follow permission-rbac/TZ §API + ui-shell/TZ API-2. Base prefix is
 * `/api` (appConfig.apiPrefix), so paths here start at `/v1/...` / `/projects/...`
 * exactly like CrmService. The host NEVER computes RBAC/ABAC — it renders the
 * projection returned by these endpoints (BR-SHELL-4 / FR-SHELL-11).
 */

// ─── API-2: permission projection (GET /api/v1/projects/:id/permissions) ─────

/** Raw projection wire shape (defensive — fields may arrive snake/camel). */
interface RawProjection {
    projectId?: string
    project_id?: string
    allowed?: string[]
    modulePolicyFlags?: Record<string, Record<string, boolean>>
    module_policy_flags?: Record<string, Record<string, boolean>>
    visibilityScope?: PermissionProjection['visibilityScope']
    visibility_scope?: PermissionProjection['visibilityScope']
}

/**
 * Fetch the per-(user, project) permission projection (API-2, ui-shell §5).
 * This is a NEW computation in the access engine (RBAC matrix + module policies
 * + visibility-resolver) — not a passthrough of `x-permissions`.
 */
export async function apiGetPermissionProjection(
    projectId: string,
): Promise<PermissionProjection> {
    const raw = await ApiService.fetchDataWithAxios<RawProjection>({
        url: `/v1/projects/${projectId}/permissions`,
        method: 'get',
    })
    return {
        projectId: raw.projectId ?? raw.project_id ?? projectId,
        allowed: Array.isArray(raw.allowed) ? raw.allowed : [],
        modulePolicyFlags:
            raw.modulePolicyFlags ?? raw.module_policy_flags ?? {},
        visibilityScope: raw.visibilityScope ?? raw.visibility_scope,
    }
}

// ─── API-3: batch record-dependent can checks (ui-shell §6) ─────────────────

export type RecordCanCheck = {
    subject: string
    action: string
    recordRef?: { resource: string; recordId: string }
}

export type RecordCanResult = RecordCanCheck & {
    allow: boolean
    reason?: string
}

export async function apiBatchRecordCan(
    projectId: string,
    checks: RecordCanCheck[],
): Promise<{ results: RecordCanResult[] }> {
    return ApiService.fetchDataWithAxios<{ results: RecordCanResult[] }>({
        url: `/v1/projects/${projectId}/can`,
        method: 'post',
        data: { checks },
    })
}

// ─── Org projection (GET /api/v1/system/me/permissions) — box single-tenant ───
// P8-T4.3: org-structure counterpart of API-2. Returns the caller's effective
// org-structure allow-set (canonical `org:*` keys) from the backend PDP, so the
// host gates org screens on the real backend decision instead of heuristics.

export interface OrgPermissionProjection {
    organizationId: string
    /** platform_owner | platform_admin | employee | '' (not a member). */
    orgRole: string
    /** Flat allowed canonical `org:*` `subject:action` set. */
    allowed: string[]
}

interface RawOrgProjection {
    organizationId?: string
    organization_id?: string
    orgRole?: string
    org_role?: string
    allowed?: string[]
}

export async function apiGetOrgPermissionProjection(): Promise<OrgPermissionProjection> {
    const raw = await ApiService.fetchDataWithAxios<RawOrgProjection>({
        url: '/v1/system/me/permissions',
        method: 'get',
    })
    return {
        organizationId: raw.organizationId ?? raw.organization_id ?? '',
        orgRole: raw.orgRole ?? raw.org_role ?? '',
        allowed: Array.isArray(raw.allowed) ? raw.allowed : [],
    }
}

// ─── PDP-explain: POST /api/projects/:id/access/simulate (FR-PERM-14) ─────────

export interface AccessSimulateInput {
    /** Target user whose access is evaluated. */
    userId: string
    /** Permission subject, e.g. `deals`. */
    subject: string
    /** Permission action, e.g. `delete`. */
    action: string
    /** Optional record id for ABAC/visibility evaluation. */
    recordId?: string
    /** Optional resource alias if it differs from subject. */
    resource?: string
}

/** One step of the PDP explain trace (RBAC → ABAC → visibility → sharing). */
export interface AccessTraceStep {
    layer: string
    effect: 'allow' | 'deny' | 'skip'
    ruleId?: string
    reason?: string
    inactive?: boolean
    priority?: number
}

export interface AccessSimulateResult {
    decision: 'allow' | 'deny'
    matchedBy?: string
    reason?: string
    trace: AccessTraceStep[]
}

interface RawSimulate {
    decision?: string
    matchedBy?: string
    matched_by?: string
    reason?: string
    trace?: AccessTraceStep[]
    params?: Record<string, unknown>
}

/**
 * PDP-explain — same resolver as the live guard, `explain=true` (no logic copy).
 * Returns verdict + per-layer trace incl. deny-over-allow priority (FR-MPRJ-18).
 */
export async function apiSimulateAccess(
    projectId: string,
    input: AccessSimulateInput,
): Promise<AccessSimulateResult> {
    const raw = await ApiService.fetchDataWithAxios<RawSimulate, AccessSimulateInput>({
        url: `/v1/projects/${projectId}/access/simulate`,
        method: 'post',
        data: input,
    })
    return {
        decision: raw.decision === 'allow' ? 'allow' : 'deny',
        matchedBy: raw.matchedBy ?? raw.matched_by,
        reason: raw.reason,
        trace: Array.isArray(raw.trace) ? raw.trace : [],
    }
}

// ─── Role catalogue + CRUD (permission-rbac §API) ────────────────────────────

export type RoleKind = 'system' | 'custom'

export interface PermissionCatalogEntry {
    subject: string
    actions: string[]
    moduleId?: string
}

export interface ProjectRoleDef {
    id: string
    name: string
    kind: RoleKind
    /** Flat `subject:action` permission set. */
    permissions: string[]
    /** Number of members carrying the role (if backend provides). */
    memberCount?: number
    archived?: boolean
}

export interface RoleWritePayload {
    name: string
    permissions: string[]
}

/** GET catalog of `subject:action` available in this project (enabled modules + system). */
export async function apiGetPermissionCatalog(
    projectId: string,
): Promise<PermissionCatalogEntry[]> {
    const raw = await ApiService.fetchDataWithAxios<
        { catalog?: PermissionCatalogEntry[] } | PermissionCatalogEntry[]
    >({
        url: `/v1/projects/${projectId}/permissions/catalog`,
        method: 'get',
    })
    if (Array.isArray(raw)) return raw
    return raw.catalog ?? []
}

/** GET system + custom roles of the project. */
export async function apiGetProjectRoles(
    projectId: string,
): Promise<ProjectRoleDef[]> {
    const raw = await ApiService.fetchDataWithAxios<ProjectRoleDef[]>({
        url: `/v1/projects/${projectId}/roles`,
        method: 'get',
    })
    return Array.isArray(raw) ? raw : []
}

/** POST create a custom role. */
export async function apiCreateProjectRole(
    projectId: string,
    payload: RoleWritePayload,
): Promise<ProjectRoleDef> {
    return ApiService.fetchDataWithAxios<ProjectRoleDef, RoleWritePayload>({
        url: `/v1/projects/${projectId}/roles`,
        method: 'post',
        data: payload,
    })
}

/** PATCH edit a custom role. */
export async function apiUpdateProjectRole(
    projectId: string,
    roleId: string,
    payload: RoleWritePayload,
): Promise<ProjectRoleDef> {
    return ApiService.fetchDataWithAxios<ProjectRoleDef, RoleWritePayload>({
        url: `/v1/projects/${projectId}/roles/${roleId}`,
        method: 'patch',
        data: payload,
    })
}

/** DELETE (archive) a custom role. */
export async function apiArchiveProjectRole(
    projectId: string,
    roleId: string,
): Promise<{ ok: boolean }> {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/projects/${projectId}/roles/${roleId}`,
        method: 'delete',
    })
}

/** POST clone a role into a new custom role. */
export async function apiCloneProjectRole(
    projectId: string,
    roleId: string,
): Promise<ProjectRoleDef> {
    return ApiService.fetchDataWithAxios<ProjectRoleDef>({
        url: `/v1/projects/${projectId}/roles/${roleId}/clone`,
        method: 'post',
    })
}

// ─── Role assignments — who carries a role (BX-ACL-BE-4/5, §4) ────────────────
// A role is addressed to a *grantee*: an org department, an AccessUnit (group),
// or a single user. The BFF `subject_type` uses exactly these three values, so
// GranteeType mirrors it 1:1. Grant/revoke routes:
//   department → POST/DELETE projects/:pid/departments/:deptId/roles[/:aid]
//   unit       → POST/DELETE projects/:pid/access-units/:unitId/roles[/:aid]
//   user       → POST/DELETE projects/:pid/members/:userId/roles[/:aid]
// The record-scope ("охват") is orthogonal and set on «Обзоре» (visibility).

/** Whom a role/permission is addressed to — matches BFF `subject_type`. */
export type GranteeType = 'department' | 'unit' | 'user'

export interface RoleAssignment {
    id: string
    granteeType: GranteeType
    granteeId: string
    /**
     * Human name of the grantee (dept/unit/user). The BFF returns ids only, so
     * this is resolved by the caller (FE-5 joins against the dept/unit/member
     * lists); left undefined when unknown.
     */
    granteeName?: string
    roleId: string
    roleName?: string
    /** Provenance tag for the UI, e.g. «через отдел Продажи» — composed by FE-5. */
    source?: string
}

/** Body for granting a whole role to a grantee. */
export interface RoleGrantPayload {
    roleId: string
    /** Reserved for future record-scoped grants; box v1 is always project-wide. */
    scope?: string
    /** ISO date; empty/omitted means no expiry. */
    expiresAt?: string
}

/** Wire shape of a role assignment (defensive — fields may arrive snake/camel). */
interface RawAssignment {
    id?: string
    subjectType?: string
    subject_type?: string
    subjectId?: string
    subject_id?: string
    roleId?: string
    role_id?: string
    roleName?: string
    role_name?: string
    granteeName?: string
    grantee_name?: string
    source?: string
}

function toGranteeType(v: string | undefined): GranteeType {
    return v === 'department' || v === 'unit' ? v : 'user'
}

function normalizeAssignment(raw: RawAssignment): RoleAssignment {
    return {
        id: raw.id ?? '',
        granteeType: toGranteeType(raw.subjectType ?? raw.subject_type),
        granteeId: raw.subjectId ?? raw.subject_id ?? '',
        granteeName: raw.granteeName ?? raw.grantee_name,
        roleId: raw.roleId ?? raw.role_id ?? '',
        roleName: raw.roleName ?? raw.role_name,
        source: raw.source,
    }
}

function isNotFound(err: unknown): boolean {
    return (err as AxiosError)?.response?.status === 404
}

/**
 * List every role assignment of the project (department/unit/user → role).
 *
 * Project-wide aggregate `GET .../role-assignments` (FR-ACCESS-590). Fail-soft on
 * 404 → [] for backward compatibility with older gateway builds.
 */
export async function apiGetRoleAssignments(
    projectId: string,
): Promise<RoleAssignment[]> {
    try {
        const raw = await ApiService.fetchDataWithAxios<
            | { list?: RawAssignment[]; assignments?: RawAssignment[] }
            | RawAssignment[]
        >({
            url: `/v1/projects/${projectId}/role-assignments`,
            method: 'get',
        })
        const list = Array.isArray(raw) ? raw : (raw.list ?? raw.assignments ?? [])
        return list.map(normalizeAssignment)
    } catch (err) {
        if (isNotFound(err)) return []
        throw err
    }
}

/** List the role assignments carried by a single member (backed today). */
export async function apiGetMemberRoleAssignments(
    projectId: string,
    userId: string,
): Promise<RoleAssignment[]> {
    const raw = await ApiService.fetchDataWithAxios<
        { list?: RawAssignment[] } | RawAssignment[]
    >({
        url: `/v1/projects/${projectId}/members/${userId}/roles`,
        method: 'get',
    })
    const list = Array.isArray(raw) ? raw : (raw.list ?? [])
    return list.map(normalizeAssignment)
}

// ── grant / revoke a whole role to a grantee ──────────────────────────────────

/** Grant a role to an org department (the only branch active in FE-5 v1). */
export async function apiGrantDepartmentRole(
    projectId: string,
    deptId: string,
    payload: RoleGrantPayload,
): Promise<RoleAssignment> {
    const raw = await ApiService.fetchDataWithAxios<RawAssignment, RoleGrantPayload>({
        url: `/v1/projects/${projectId}/departments/${deptId}/roles`,
        method: 'post',
        data: payload,
    })
    return normalizeAssignment(raw)
}

export async function apiRevokeDepartmentRole(
    projectId: string,
    deptId: string,
    assignmentId: string,
): Promise<{ ok: boolean }> {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/projects/${projectId}/departments/${deptId}/roles/${assignmentId}`,
        method: 'delete',
    })
}

/** Grant a role to an AccessUnit / group (BX-ACL-BE-5). */
export async function apiGrantUnitRole(
    projectId: string,
    unitId: string,
    payload: RoleGrantPayload,
): Promise<RoleAssignment> {
    const raw = await ApiService.fetchDataWithAxios<RawAssignment, RoleGrantPayload>({
        url: `/v1/projects/${projectId}/access-units/${unitId}/roles`,
        method: 'post',
        data: payload,
    })
    return normalizeAssignment(raw)
}

export async function apiRevokeUnitRole(
    projectId: string,
    unitId: string,
    assignmentId: string,
): Promise<{ ok: boolean }> {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/projects/${projectId}/access-units/${unitId}/roles/${assignmentId}`,
        method: 'delete',
    })
}

/** Grant a role to a single member/person. */
export async function apiGrantMemberRole(
    projectId: string,
    userId: string,
    payload: RoleGrantPayload,
): Promise<RoleAssignment> {
    const raw = await ApiService.fetchDataWithAxios<RawAssignment, RoleGrantPayload>({
        url: `/v1/projects/${projectId}/members/${userId}/roles`,
        method: 'post',
        data: payload,
    })
    return normalizeAssignment(raw)
}

export async function apiRevokeMemberRole(
    projectId: string,
    userId: string,
    assignmentId: string,
): Promise<{ ok: boolean }> {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/projects/${projectId}/members/${userId}/roles/${assignmentId}`,
        method: 'delete',
    })
}

// ─── Addressed permission grants — a single right, not a whole role (BE-4) ─────
// The «отдельное право» branch: a blanket allow/deny of one `subject:action` to a
// grantee, overlaid on top of role-derived permissions. Control enforces the
// fail-closed rules (catalog membership, project-grantable, no self-escalation,
// no blanket deny, no deny on access-subjects). In box v1 a grant is project-wide
// — the UI does not narrow by resource/condition.

export type GrantEffect = 'allow' | 'deny'

export interface PermissionGrant {
    id: string
    effect: GrantEffect
    /** Permission subject, e.g. `deals`. */
    subject: string
    /** Permission action, e.g. `export`. */
    action: string
    granteeType: GranteeType
    granteeId: string
    moduleId?: string
    resource?: string
}

export interface PermissionGrantPayload {
    effect: GrantEffect
    subject: string
    action: string
    granteeType: GranteeType
    granteeId: string
}

interface RawGrant {
    id?: string
    effect?: string
    subject?: string
    action?: string
    granteeType?: string
    grantee_type?: string
    granteeId?: string
    grantee_id?: string
    moduleId?: string
    module_id?: string
    resource?: string
}

function normalizeGrant(raw: RawGrant): PermissionGrant {
    return {
        id: raw.id ?? '',
        effect: raw.effect === 'deny' ? 'deny' : 'allow',
        subject: raw.subject ?? '',
        action: raw.action ?? '',
        granteeType: toGranteeType(raw.granteeType ?? raw.grantee_type),
        granteeId: raw.granteeId ?? raw.grantee_id ?? '',
        moduleId: raw.moduleId ?? raw.module_id,
        resource: raw.resource,
    }
}

/** List the project's addressed allow/deny grants (PermissionGrant overlay). */
export async function apiListPermissionGrants(
    projectId: string,
): Promise<PermissionGrant[]> {
    const raw = await ApiService.fetchDataWithAxios<
        { list?: RawGrant[] } | RawGrant[]
    >({
        url: `/v1/projects/${projectId}/grants`,
        method: 'get',
    })
    const list = Array.isArray(raw) ? raw : (raw.list ?? [])
    return list.map(normalizeGrant)
}

/** Create/replace an addressed grant. */
export async function apiUpsertPermissionGrant(
    projectId: string,
    payload: PermissionGrantPayload,
): Promise<PermissionGrant> {
    const raw = await ApiService.fetchDataWithAxios<RawGrant, PermissionGrantPayload>({
        url: `/v1/projects/${projectId}/grants`,
        method: 'post',
        data: payload,
    })
    return normalizeGrant(raw)
}

export async function apiRevokePermissionGrant(
    projectId: string,
    grantId: string,
): Promise<{ ok: boolean }> {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/projects/${projectId}/grants/${grantId}`,
        method: 'delete',
    })
}
