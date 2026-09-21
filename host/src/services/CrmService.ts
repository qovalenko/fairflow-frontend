import ApiService from './ApiService'
// Экспорт читает заголовки ответа (X-Export-Truncated/X-Export-Row-Count), а
// ApiService отдаёт только `response.data` — для этой одной ручки идём в тот же
// инстанс axios напрямую (перехватчики Authorization/X-Project-Id сохраняются).
import AxiosBase from './axios/AxiosBase'
import type {
    Contact,
    MergedSource,
    Company,
    DashboardData,
    Product as ProductType,
    ProductWritePayload,
    ProductArchiveAffected,
} from '@/@types/crm'
import type { ProjectModuleConfig, ProjectModulePolicyRule } from '@/@types/auth'
import type { ModuleCard } from '@/@types/module-card'
import { useProjectStore } from '@/store/projectStore'

/**
 * Гарантирует projectId в query-параметрах CRM-запроса. Домены, требующие
 * projectId (напр. activity), иначе отвечают gRPC INVALID_ARGUMENT → HTTP 500.
 * Явный projectId вызывающего всегда приоритетнее; иначе берём текущий проект
 * из стора. Защищает виджеты, которые тянут «всё по проекту» и фильтруют на
 * клиенте (Activity list/calendar, related-activity на Deal/Order/Contact/Company).
 */
function withProjectId<U extends Record<string, unknown>>(params: U): U {
    if (params?.projectId) return params
    const pid = useProjectStore.getState().currentProjectId
    return pid ? ({ ...params, projectId: pid } as U) : params
}

/** Map backend contact/company response to frontend shape: ownerId→assigneeId, companyIds[0]→companyId */

/**
 * epoch ms (int64 из proto, gateway-loader с `longs: Number`) → unix seconds,
 * как их ждут `dayjs.unix()` в UI. 0/отрицательное («живая» запись) → undefined.
 */
function protoMsToUnixSeconds(v: unknown): number | undefined {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return undefined
    // Всё, что больше 1e11, — это миллисекунды (в секундах это был бы 5138 год).
    return v > 1e11 ? Math.floor(v / 1000) : Math.floor(v)
}

/**
 * Нормализует метку времени из BFF → unix seconds.
 *
 * `mapContact` в шлюзе прокидывает proto-поля как есть, поэтому `deletedAt`/
 * `purgeAt` приезжают ЧИСЛОМ epoch МИЛЛИСЕКУНД (домен пишет `Date.getTime()` в
 * `int64`, loader с `longs: Number`). Отдать это число в `dayjs.unix()` — те
 * самые «удалён 09.02.57612» и миллионы дней до автоочистки, поэтому числа
 * идут через ту же эвристику мс→сек, что и `merged_at`/`unmerge_until`.
 * Строки (ISO или целочисленный int64 от `longs: String`) терпим как фолбэк.
 */
function toUnixSeconds(v: unknown): number | undefined {
    if (v == null) return undefined
    if (typeof v === 'number') return protoMsToUnixSeconds(v)
    if (typeof v === 'string') {
        const s = v.trim()
        if (!s) return undefined
        if (/^\d+$/.test(s)) return protoMsToUnixSeconds(Number(s))
        const ms = Date.parse(s)
        return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000)
    }
    return undefined
}

/**
 * TODO-161: тени слияний из карточки. BFF (`mapContact`) отдаёт proto-объекты
 * как есть — snake_case и epoch ms; без этого домапа UI получил бы `undefined`
 * по каждому полю (та же грабля, что и с потерянным `middle_name`).
 */
function mapBackendMergedSources(raw: unknown): MergedSource[] | undefined {
    if (!Array.isArray(raw)) return undefined
    return raw
        .map((item) => {
            const s = (item ?? {}) as Record<string, unknown>
            return {
                id: String(s.id ?? ''),
                firstName: String(s.first_name ?? s.firstName ?? ''),
                lastName: String(s.last_name ?? s.lastName ?? ''),
                middleName: String(s.middle_name ?? s.middleName ?? ''),
                email: String(s.email ?? ''),
                phone: String(s.phone ?? ''),
                mergedAt: protoMsToUnixSeconds(s.merged_at ?? s.mergedAt),
                unmergeUntil: protoMsToUnixSeconds(s.unmerge_until ?? s.unmergeUntil),
            }
        })
        .filter((s) => !!s.id)
}

function mapBackendContactToFrontend(raw: Record<string, unknown>): Contact {
    const contact = raw as Contact & { ownerId?: string; companyIds?: string[]; _id?: string }
    return {
        ...contact,
        id: (raw.id ?? raw._id) as string,
        assigneeId: contact.assigneeId ?? contact.ownerId,
        assigneeName: contact.assigneeName ?? (contact.ownerId ? String(contact.ownerId) : undefined),
        companyId: contact.companyId ?? contact.companyIds?.[0],
        companyIds: contact.companyIds ?? (contact.companyId ? [contact.companyId] : []),
        orphanedCompanyIds: (raw.orphanedCompanyIds as string[] | undefined) ?? [],
        companyLinks: (raw.companyLinks as Contact['companyLinks']) ?? undefined,
        // W-6: '' у proto3 = «отдел не задан», отдаём undefined (иначе селект в
        // форме получает пустую строку и считает её выбранным значением).
        departmentId: (raw.departmentId as string | undefined) || undefined,
        lastActivityAt:
            raw.lastActivityAt != null && raw.lastActivityAt !== ''
                ? toUnixSeconds(raw.lastActivityAt)
                : null,
        // Поля корзины: BFF mapContact отдаёт epoch ms (или null), UI ждёт unix seconds (§3.5/§3.6).
        deletedAt: toUnixSeconds(raw.deletedAt),
        purgeAt: toUnixSeconds(raw.purgeAt),
        mergedSources: mapBackendMergedSources(raw.merged_sources ?? raw.mergedSources),
    } as Contact
}

function mapBackendCompanyToFrontend(raw: Record<string, unknown>): Company {
    const company = raw as Company & { ownerId?: string; _id?: string }
    return {
        ...company,
        id: (raw.id ?? raw._id) as string,
        assigneeId: company.assigneeId ?? company.ownerId,
        assigneeName: company.assigneeName ?? (company.ownerId ? String(company.ownerId) : undefined),
        // W-6: подразделение-владелец записи. BFF `mapCompany` отдаёт camelCase
        // `departmentId`; '' у proto3 означает «не задано» — нормализуем в undefined,
        // иначе селект в форме получил бы пустую строку вместо «нет отдела».
        departmentId: (raw.departmentId as string | undefined) || undefined,
    } as Company
}

// ─── Control service (projects + organizations) ─────────────────────────────

/** List projects accessible by user. */
export async function apiGetMyProjects<T>(params: { userId: string }) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/projects',
        method: 'get',
        params: { userId: params.userId },
    })
}

export async function apiGetProjectsByOwner<T>(params: { ownerType: string; ownerId: string }) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/projects',
        method: 'get',
        params,
    })
}

export type OrganizationRequisites = {
    inn?: string
    kpp?: string
    ogrn?: string
    legalAddress?: string
    actualAddress?: string
    phone?: string
    email?: string
    logoUrl?: string
    description?: string
}

export type OrganizationDetail = {
    id: string
    name: string
    slug?: string
    role?: 'platform_owner' | 'platform_admin' | 'employee' | string
} & OrganizationRequisites

/**
 * box single-tenant: единственная Система текущей сессии (DEORG-W4).
 * `GET /v1/system` резолвит одну организацию + роль пользователя, либо `null`
 * до bootstrap. Заменяет прежний `apiGetMyOrganizations` (массив орг убран).
 */
export async function apiGetSystem() {
    return ApiService.fetchDataWithAxios<OrganizationDetail | null>({
        url: '/v1/system',
        method: 'get',
    })
}

/** Реквизиты Системы (+ роль запрашивающего). box: без orgId в URL. */
export async function apiGetOrganization() {
    return ApiService.fetchDataWithAxios<OrganizationDetail>({
        url: '/v1/system/requisites',
        method: 'get',
    })
}

export async function apiUpdateOrganization(
    payload: { name?: string } & OrganizationRequisites,
) {
    return ApiService.fetchDataWithAxios<OrganizationDetail>({
        url: '/v1/system/requisites',
        method: 'patch',
        data: payload,
    })
}

export type LogoUploadUrlResponse = {
    uploadUrl: string
    logoUrl: string
    objectKey: string
    expiresAt: number
}

/** FR-ORG-030 — presigned PUT for org logo (≤5 MiB, TTL 5 min). */
export async function apiCreateLogoUploadUrl(payload: {
    contentType: string
    fileName: string
    contentLength: number
}) {
    return ApiService.fetchDataWithAxios<LogoUploadUrlResponse>({
        url: '/v1/system/logo-upload-url',
        method: 'post',
        data: payload,
    })
}

export type DepartmentSummary = {
    employeeCount: number
    activeSeats: number
    pendingInvitations: number
    unassignedRecordsCount: number
}

/** FR-ORG-220 — per-department aggregates (optional project scope for unassigned count). */
export async function apiGetDepartmentSummary(
    departmentId: string,
    projectId?: string,
) {
    return ApiService.fetchDataWithAxios<DepartmentSummary>({
        url: `/v1/system/departments/${departmentId}/summary`,
        method: 'get',
        params: projectId ? { projectId } : undefined,
    })
}

export type UnassignedRecord = {
    entityType: string
    entityId: string
    title: string
    updatedAt?: string
}

export type UnassignedListResponse = {
    list: UnassignedRecord[]
    nextCursor: string
    total: number
}

/** FR-ORG-530 — project records without an owner. */
export async function apiListUnassigned(
    projectId: string,
    params?: { resource?: string; limit?: number; cursor?: string },
) {
    return ApiService.fetchDataWithAxios<UnassignedListResponse>({
        url: `/v1/projects/${projectId}/unassigned`,
        method: 'get',
        params,
    })
}

export async function apiBulkReassignUnassigned(
    projectId: string,
    payload: {
        newOwnerUserId: string
        items: Array<{ entityType: string; entityId: string }>
    },
) {
    return ApiService.fetchDataWithAxios<{ reassigned: number }>({
        url: `/v1/projects/${projectId}/unassigned/bulk-reassign`,
        method: 'post',
        data: payload,
    })
}

// ─── Platform modules (manifest-driven navigation, R3-E1-08) ────────────────

/**
 * Module cards for the current project — source of host navigation
 * (FR-SHELL-1). Project scope is resolved server-side by the gateway
 * (same pattern as `apiGetDashboard`).
 * Contract: be task R3-E1-08-be (`GET /api/v1/platform/modules` → ModuleCard[]).
 */
export async function apiGetPlatformModules(projectId?: string) {
    return ApiService.fetchDataWithAxios<ModuleCard[]>({
        url: '/v1/platform/modules',
        method: 'get',
        // projectId ОБЯЗАТЕЛЕН: без него BFF возвращает карточки с enabled=false
        // (per-project флаг не вычислить) → enabledCards пуст → пустое меню (D11).
        params: projectId ? { projectId } : undefined,
    })
}

/** Per-project module lifecycle matrix (`GET /v1/projects/:id/modules`). */
export type ProjectModuleState = {
    module_id: string
    state: string
    enabled: boolean
    installed: boolean
    locked: boolean
    kind: string
    version: string
    latest_version: string
    upgrade_available: boolean
    runtime_status?: 'active' | 'suspended' | string
    ever_suspended?: boolean
    config_state?: 'ready' | 'needs_config' | string
}

export async function apiListProjectModuleStates(projectId: string) {
    return ApiService.fetchDataWithAxios<ProjectModuleState[]>({
        url: `/v1/projects/${projectId}/modules`,
        method: 'get',
    })
}

// ─── Org structure: employees + departments ─────────────────────────────────

export type OrgEmployee = {
    id: string
    userId: string
    role: 'platform_owner' | 'platform_admin' | 'employee' | string
    departmentId: string | null
    createdAt?: string | number
    name: string
    email: string
    avatarUrl: string
    /** FR-MORG-23/43: false → уволенный (seat освобождён). Отсутствует → активный (legacy). */
    isActive?: boolean
}

/** FR-ORG-150: PII-safe colleague directory row (no email/phone/role). */
export type ColleagueDirectoryEntry = {
    userId: string
    name: string
    avatarUrl: string
    position: string
    departmentId: string
    departmentName: string
    managerUserId: string
    managerName: string
}

export type OrgDepartment = {
    id: string
    organizationId: string
    name: string
    parentId: string | null
    /** Department head — defines subordinates for the own_and_subordinates visibility level. */
    leaderUserId: string | null
    createdAt?: string | number
}

export async function apiGetEmployees() {
    return ApiService.fetchDataWithAxios<OrgEmployee[]>({
        url: '/v1/system/employees',
        method: 'get',
    })
}

export async function apiGetColleagueDirectory() {
    return ApiService.fetchDataWithAxios<ColleagueDirectoryEntry[]>({
        url: '/v1/system/colleagues',
        method: 'get',
    })
}

export async function apiAddEmployee(
    payload: { userId: string; role?: string; departmentId?: string },
) {
    return ApiService.fetchDataWithAxios<OrgEmployee>({
        url: '/v1/system/employees',
        method: 'post',
        data: payload,
    })
}

export async function apiUpdateEmployee(
    userId: string,
    payload: { role?: string; departmentId?: string | null },
) {
    return ApiService.fetchDataWithAxios<OrgEmployee>({
        url: `/v1/system/employees/${userId}`,
        method: 'patch',
        data: payload,
    })
}

export async function apiRemoveEmployee(userId: string) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/system/employees/${userId}`,
        method: 'delete',
    })
}

/**
 * Передать владельца организации: активный участник становится новым владельцем
 * (platform_owner), текущий владелец — администратором. Атомарно на бэке (control
 * меняет обе роли в одной транзакции; вызвать может только текущий владелец).
 */
export async function apiTransferOrgOwnership(newOwnerUserId: string) {
    return ApiService.fetchDataWithAxios<OrgEmployee>({
        url: '/v1/system/transfer-ownership',
        method: 'post',
        data: { newOwnerUserId },
    })
}

export async function apiGetDepartments() {
    return ApiService.fetchDataWithAxios<OrgDepartment[]>({
        url: '/v1/system/departments',
        method: 'get',
    })
}

export async function apiCreateDepartment(
    payload: { name: string; parentId?: string; leaderUserId?: string },
) {
    return ApiService.fetchDataWithAxios<OrgDepartment>({
        url: '/v1/system/departments',
        method: 'post',
        data: payload,
    })
}

export async function apiUpdateDepartment(
    deptId: string,
    payload: { name?: string; parentId?: string | null; leaderUserId?: string | null },
) {
    return ApiService.fetchDataWithAxios<OrgDepartment>({
        url: `/v1/departments/${deptId}`,
        method: 'patch',
        data: payload,
    })
}

export async function apiDeleteDepartment(deptId: string) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/departments/${deptId}`,
        method: 'delete',
    })
}

// ─── Org invitations ─────────────────────────────────────────────────────────

export type OrgInvitation = {
    id: string
    organizationId: string
    email: string
    role: 'platform_admin' | 'employee' | string
    departmentId: string | null
    status: 'pending' | 'accepted' | 'revoked' | string
    invitedByUserId?: string
    acceptedUserId?: string | null
    createdAt?: string | number
    expiresAt?: string | number
    /** Returned only on create/resend — bearer URL, not the raw token. */
    inviteUrl?: string
    emailSent?: boolean
}

export async function apiGetInvitations() {
    return ApiService.fetchDataWithAxios<OrgInvitation[]>({
        url: '/v1/system/invitations',
        method: 'get',
    })
}

export async function apiCreateInvitation(
    payload: {
        email: string
        role?: string
        departmentId?: string
        // FR-ONB-10: grant membership in specific projects (project role).
        // control.scopeProjectGrants drops grants to projects outside the org.
        projectGrants?: { projectId: string; role: string }[]
    },
) {
    return ApiService.fetchDataWithAxios<OrgInvitation>({
        url: '/v1/system/invitations',
        method: 'post',
        data: payload,
    })
}

export async function apiResendInvitation(id: string) {
    return ApiService.fetchDataWithAxios<OrgInvitation>({
        url: `/v1/system/invitations/${id}/resend`,
        method: 'post',
    })
}

export async function apiRevokeInvitation(id: string) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/system/invitations/${id}`,
        method: 'delete',
    })
}

// ─── Public invitation accept (no auth — invitee may have no account yet) ─────

export type InvitationDetails = {
    organizationId: string
    organizationName: string
    email: string
    role: string
    status: 'pending' | 'accepted' | 'revoked' | string
    expired: boolean
    userExists: boolean
}

export async function apiGetInvitation(token: string) {
    return ApiService.fetchDataWithAxios<InvitationDetails>({
        url: `/v1/invitations/${encodeURIComponent(token)}`,
        method: 'get',
    })
}

export async function apiAcceptInvitation(payload: {
    token: string
    name?: string
    password?: string
}) {
    return ApiService.fetchDataWithAxios<{
        ok: boolean
        organizationId: string
        created: boolean
        // FR-ONB-10: projects the accepter just joined + the first grant to land on.
        projectGrants?: { projectId: string; role: string }[]
        landingProjectId?: string | null
    }>({
        url: '/v1/invitations/accept',
        method: 'post',
        data: payload,
    })
}

export type ProjectInvitationDetails = {
    projectId: string
    projectName: string
    email: string
    role: string
    status: string
    expired: boolean
    userExists: boolean
}

export async function apiGetProjectInvitation(token: string) {
    return ApiService.fetchDataWithAxios<ProjectInvitationDetails>({
        url: `/v1/project-invitations/${encodeURIComponent(token)}`,
        method: 'get',
    })
}

export async function apiAcceptProjectInvitation(payload: {
    token: string
    name?: string
    password?: string
}) {
    return ApiService.fetchDataWithAxios<{
        ok: boolean
        projectId: string
        projectName: string
        role: string
        landingProjectId?: string
        created?: boolean
    }>({
        url: '/v1/project-invitations/accept',
        method: 'post',
        data: payload,
    })
}

// ─── Org audit log ───────────────────────────────────────────────────────────

export type OrgAuditEntry = {
    id: string
    organizationId: string
    userId: string
    action: string
    entityType: string
    entityId: string | null
    metadata: Record<string, unknown> | null
    createdAt?: string | number
    name: string
    email: string
    avatarUrl: string
}

export type OrgAuditListResponse = {
    list: OrgAuditEntry[]
    nextCursor: string
}

export type OrgAuditQuery = {
    limit?: number
    cursor?: string
    entityType?: string
    actorUserId?: string
    from?: string
    to?: string
}

export async function apiGetOrgAudit(params: OrgAuditQuery = {}) {
    const res = await ApiService.fetchDataWithAxios<
        OrgAuditListResponse | OrgAuditEntry[]
    >({
        url: '/v1/system/audit',
        method: 'get',
        params,
    })
    if (Array.isArray(res)) return { list: res, nextCursor: '' }
    return {
        list: Array.isArray(res?.list) ? res.list : [],
        nextCursor: res?.nextCursor ?? '',
    }
}

// ─── Project audit log ───────────────────────────────────────────────────────

export type ProjectAuditEntry = {
    id: string
    projectId: string
    userId: string
    actorType: string
    action: string
    entityType: string
    entityId: string | null
    metadata: Record<string, unknown> | null
    createdAt: number
    name: string
    email: string
    avatarUrl: string
}

export async function apiGetProjectAudit(projectId: string, limit = 200) {
    return ApiService.fetchDataWithAxios<ProjectAuditEntry[]>({
        url: `/v1/projects/${projectId}/audit/events`,
        method: 'get',
        params: { limit },
    })
}

/* ---------------------------------------------------------------------------
 * TODO-026 (box): блок org-overview (кросс-проектный агрегатный обзор уровня
 * организации: типы OverviewSummary/ProjectComparison/DepartmentComparison,
 * нормализация ответа и вызовы `/api/v1/system/overview/*`) удалён вместе с
 * контуром. Причина: в коробке нет сущности «Организация», а роллап
 * `org_overview_rollup` не имел писателя вовсе (OrgRollupStore.applyIncrement
 * без вызывающих), т.е. экран мог отдать только пустоту. Задел для облака —
 * в истории git (см. .fixwave2/ORG-OVERVIEW-DECISION.md).
 * ------------------------------------------------------------------------- */

/* ── Project templates (onboarding wizard, FR-ONB-2/16/18) ──────────────── */

export type ProjectTemplatePipelineStage = {
    id: string
    name: string
    color?: string
}

export type ProjectTemplate = {
    id: string
    name: string
    /** «для кого / что включено» (FR-ONB-18); опц. — старый бэк может не отдавать */
    description?: string
    /** авторитетный пресет модулей шага 3 (FR-ONB-3) */
    modules: string[]
    pipeline?: {
        name?: string
        stages?: ProjectTemplatePipelineStage[]
    }
    dealSources?: Array<{ id: string; name: string; color?: string }>
    orderTypes?: Array<{ id: string; name: string }>
    /** не из контракта — UI-метка «рекомендуется» для b2b-sales (опц.) */
    recommended?: boolean
}

/**
 * GET /api/project-templates (FR-ONB-2) — глобальный каталог из @fairflow/shared.
 * Auth: JWT; project-id не требуется. Источник истины каталога — бэкенд; FE не
 * держит собственного захардкоженного дубля (только fallback при сбое загрузки).
 */
export async function apiGetProjectTemplates() {
    return ApiService.fetchDataWithAxios<ProjectTemplate[]>({
        url: '/project-templates',
        method: 'get',
    })
}

export async function apiCreateProject(
    params: {
        ownerType: 'PERSONAL' | 'ORGANIZATION'
        ownerId: string
        name: string
        templateId?: string
        modules?: string[]
        moduleConfigs?: ProjectModuleConfig[]
        modulePolicies?: ProjectModulePolicyRule[]
        createdByUserId?: string
        /**
         * Наполнить проект демонстрационными данными (контакты/компании/сделки/
         * продажи/активности + история изменений) — только по включённым модулям.
         * Данные демонстрационные, без чувствительной информации.
         */
        seedDemoData?: boolean
    },
    /** Idempotency-Key (FR-ONB-15) — защита от двойного создания при ретрае. */
    idempotencyKey?: string,
) {
    return ApiService.fetchDataWithAxios<{
        id: string
        name: string
        modules?: string[]
        effective_modules?: string[]
        module_configs?: Array<{
            module_id?: string
            enabled?: boolean
            personal_settings?: Record<string, unknown>
            integration_settings?: Record<string, unknown>
            integration_methods_enabled?: string[]
        }>
        module_policies?: Array<{
            id?: string
            module_id?: string
            effect?: string
            subject?: string
            action?: string
            resource?: string
            condition?: Record<string, unknown>
        }>
        ownerType?: 'PERSONAL' | 'ORGANIZATION'
        ownerId?: string
        owner_type?: 'PERSONAL' | 'ORGANIZATION'
        owner_id?: string
    }>({
        url: '/v1/projects',
        method: 'post',
        data: params,
        ...(idempotencyKey
            ? { headers: { 'Idempotency-Key': idempotencyKey } }
            : {}),
    })
}

export async function apiGetProject<T>(projectId: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/projects/${projectId}`,
        method: 'get',
    })
}

/* ── Record visibility (phase 4d, spec §13.4) ───────────────────────────── */

export const VISIBILITY_LEVELS = [
    'only_own',
    'own_and_shared',
    'own_and_subordinates',
    'own_and_department',
    'all',
] as const
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number]

export const PROJECT_ROLES = ['owner', 'admin', 'manager', 'member', 'viewer'] as const
export type ProjectRole = (typeof PROJECT_ROLES)[number]

/** role → visibility level (spec §13.4 defaults; empty = use default). */
export type VisibilityConfig = Partial<Record<ProjectRole, VisibilityLevel>>

export const VISIBILITY_LEVEL_LABELS: Record<VisibilityLevel, string> = {
    only_own: 'Только свои',
    own_and_shared: 'Свои + расшаренные',
    own_and_subordinates: 'Свои + подчинённых',
    own_and_department: 'Свои + своего отдела',
    all: 'Все записи проекта',
}

export const DEFAULT_VISIBILITY_BY_ROLE: Record<ProjectRole, VisibilityLevel> = {
    owner: 'all',
    admin: 'all',
    manager: 'all',
    member: 'own_and_shared',
    viewer: 'own_and_shared',
}

export type ProjectSettingsPayload = {
    name?: string
    modules?: string[]
    moduleConfigs?: ProjectModuleConfig[]
    modulePolicies?: ProjectModulePolicyRule[]
    visibilityConfig?: VisibilityConfig
    // BX-FIX-10: триггер аудита `preset.applied` в hash-chain — FE указывает,
    // что охват сохранён применением именованного пресета.
    appliedPreset?: string
    /** FR-PSET-055: явный каскад при выключении модуля с зависимыми. */
    cascade?: boolean
}

export type ProjectSettingsResponse = {
    id: string
    name: string
    modules: string[]
    visibility_config?: Record<string, string>
    effective_modules?: string[]
    module_configs?: Array<{
        module_id?: string
        enabled?: boolean
        personal_settings?: Record<string, unknown>
        integration_settings?: Record<string, unknown>
        integration_methods_enabled?: string[]
    }>
    module_policies?: Array<{
        id?: string
        module_id?: string
        effect?: string
        subject?: string
        action?: string
        resource?: string
        condition?: Record<string, unknown>
    }>
    owner_type?: string
    owner_id?: string
}

export async function apiUpdateProjectSettings(
    projectId: string,
    payload: ProjectSettingsPayload,
) {
    return ApiService.fetchDataWithAxios<ProjectSettingsResponse>({
        url: `/v1/projects/${projectId}`,
        method: 'patch',
        data: payload,
    })
}

export async function apiUpdateProjectModules(projectId: string, modules: string[]) {
    return ApiService.fetchDataWithAxios<{
        id: string
        name: string
        modules: string[]
        effective_modules?: string[]
        module_configs?: Array<{
            module_id?: string
            enabled?: boolean
            personal_settings?: Record<string, unknown>
            integration_settings?: Record<string, unknown>
            integration_methods_enabled?: string[]
        }>
        module_policies?: Array<{
            id?: string
            module_id?: string
            effect?: string
            subject?: string
            action?: string
            resource?: string
            condition?: Record<string, unknown>
        }>
        owner_type?: string
        owner_id?: string
    }>({
        url: `/v1/projects/${projectId}`,
        method: 'patch',
        data: { modules },
    })
}

export type ModuleRegistryItem = {
    id: string
    name: string
    description: string
    locked: boolean
    dependencies: string[]
    integrationMethods: Array<{
        id: string
        name: string
        description: string
    }>
    personalSettingsSchema: Record<string, unknown>
    integrationSettingsSchema: Record<string, unknown>
    policyCapabilities: Array<{
        subject: string
        actions: string[]
    }>
}

export async function apiGetModulesRegistry() {
    return ApiService.fetchDataWithAxios<{ list: ModuleRegistryItem[] }>({
        url: '/v1/modules/registry',
        method: 'get',
    })
}

/* ── Record sharing (phase 4d, spec §13.4) ──────────────────────────────── */

export type ShareableResource = 'contacts' | 'companies' | 'deals' | 'orders' | 'activities'

export type RecordShare = {
    id: string
    project_id: string
    resource: string
    record_id: string
    grantee_type: 'user' | 'department' | string
    grantee_id: string
    created_by: string
    created_at?: string
    /** ISO expiry; empty/absent means a permanent (never-expiring) share. */
    expires_at?: string
}

export async function apiListRecordShares(
    projectId: string,
    resource: ShareableResource,
    recordId: string,
) {
    return ApiService.fetchDataWithAxios<RecordShare[]>({
        url: `/v1/projects/${projectId}/shares`,
        method: 'get',
        params: { resource, recordId },
    })
}

export async function apiShareRecord(
    projectId: string,
    payload: {
        resource: ShareableResource
        recordId: string
        granteeType: 'user' | 'department'
        granteeId: string
        /** ISO expiry; omit for a permanent share (backend defaults to no expiry). */
        expiresAt?: string
    },
) {
    return ApiService.fetchDataWithAxios<RecordShare>({
        url: `/v1/projects/${projectId}/shares`,
        method: 'post',
        data: payload,
    })
}

export async function apiUnshareRecord(projectId: string, shareId: string) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/projects/${projectId}/shares/${shareId}`,
        method: 'delete',
    })
}

/* ── E2-15: ABAC policies + access simulator (PDP) ────────────────────────────
 *
 * Contract source: SCR-PRJSET-POLICIES / SCR-PRJSET-ACCESS-SIMULATOR
 * (project-settings/SCREENS.md), permission-abac-visibility/TZ.md, K2-abac
 * (`AbacErrorCode`, closed set of 10 operators), K3fe-be PDP endpoints.
 *
 * Wired by contract — `POST /access/simulate` ships in K3fe-be; the ABAC
 * policy read/validate/save endpoints are the project-settings policy contract.
 */

/** One ABAC policy rule as stored/edited (FR-ABAC-3, mirrors shared AbacNode subset). */
export type AbacPolicyCondition = {
    /** attribute reference: record.<flat> | user.<attr> | project.<attr> */
    attribute: string
    /** closed operator set v1 (10 ops, K2-abac). */
    operator: AbacOperator
    /** scalar literal (or scalar[] for in/nin). */
    value: AbacLiteral
}

export type AbacPolicyRule = {
    id?: string
    subject: string
    action: string
    effect: 'allow' | 'deny'
    /** AND-composed conditions (one rule = one predicate). */
    conditions: AbacPolicyCondition[]
    /** rule of a disabled/unpaid module → marked inactive, still stored (FR-ABAC-11). */
    inactive?: boolean
    moduleId?: string
}

export type AbacOperator =
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'nin'
    | 'and'
    | 'or'
    | 'not'

export type AbacLiteral = string | number | boolean | null | Array<string | number | boolean>

/** GET /api/projects/:pid/policies → rules + module defaults (SCR EL-PLC-3). */
export type ProjectPoliciesResponse = {
    rules: AbacPolicyRule[]
    moduleDefaults?: AbacPolicyRule[]
    sharingEnabled?: boolean
    sharingNotify?: boolean
}

export async function apiGetProjectPolicies(projectId: string) {
    return ApiService.fetchDataWithAxios<ProjectPoliciesResponse>({
        url: `/v1/projects/${projectId}/policies`,
        method: 'get',
    })
}

/**
 * PATCH /api/projects/:pid/policies → 207 accepted/rejected[] (FR-ABAC-22) or
 * 422 POLICY_NOT_COMPILABLE / 400 OWNER_LOCKOUT (anti-lockout, FR-ABAC-24).
 */
export type PolicySaveResult = {
    accepted: AbacPolicyRule[]
    rejected?: Array<{ index: number; code: string; message?: string; path?: string }>
    selfLockoutWarning?: boolean
    ownerLockout?: boolean
    affectedRecords?: number
    affectedUsers?: { count: number; sample: string[] }
}

export async function apiUpdateProjectPolicies(
    projectId: string,
    payload: {
        rules: AbacPolicyRule[]
        sharingEnabled?: boolean
        sharingNotify?: boolean
    },
) {
    return ApiService.fetchDataWithAxios<PolicySaveResult>({
        url: `/v1/projects/${projectId}/policies`,
        method: 'patch',
        data: payload,
    })
}

/** POST /api/projects/:pid/policies/validate — dual-compile dry-validate (EL-PLC-5). */
export async function apiValidateProjectPolicies(
    projectId: string,
    rules: AbacPolicyRule[],
) {
    return ApiService.fetchDataWithAxios<PolicySaveResult>({
        url: `/v1/projects/${projectId}/policies/validate`,
        method: 'post',
        data: { rules },
    })
}

/** FR-ACCESS-570: per-module visibility summary for the current user (membership only). */
export type VisibilitySummaryModule = {
    module: string
    mode: string
    level: string
}

export async function apiMyVisibilitySummary(projectId: string) {
    return ApiService.fetchDataWithAxios<{ modules: VisibilitySummaryModule[] }>({
        url: `/v1/projects/${projectId}/me/visibility-summary`,
        method: 'get',
    })
}

/** One layer of the PDP explain trace (RBAC → ABAC → visibility → sharing). */
export type AccessTraceStep = {
    layer: 'rbac' | 'abac' | 'visibility' | 'sharing'
    /**
     * Per-layer effect from the PDP explain trace — mirrors the backend contract
     * exactly (control.proto `AccessTraceStep.effect`): allow | deny | narrow |
     * pass | grant. A `deny` is decisive (deny > allow, FR-MPRJ-18).
     */
    effect: 'allow' | 'deny' | 'narrow' | 'pass' | 'grant'
    /** rule/role id if the step matched a specific rule (control.proto `rule_id`). */
    ruleId?: string
    /** human-readable reason (no values of fields hidden from caller — FR-ABAC-20). */
    reason?: string
    /** step belongs to a disabled module / layer not consulted (FR-ABAC-11). */
    inactive?: boolean
    /**
     * RBAC-layer permission keys the decision matched on, when the backend
     * supplies them. Never carries record field values (FR-ABAC-20).
     */
    matchedKeys?: string[]
}

export type AccessSimulateResult = {
    decision: 'allow' | 'deny'
    reason?: string
    trace: AccessTraceStep[]
}

/**
 * POST /api/v1/projects/:pid/access/simulate — PDP explain (E2-09, K3fe-be).
 * "given user + resource + recordId? + action → allow/deny with per-layer trace".
 * Same engine as enforcement (`explain=true`), not a parallel implementation.
 *
 * `draftRules` carries the UNSAVED policy set for the "preview unsaved" path
 * from SCR-PRJSET-POLICIES (ST-30); omitted for a plain simulation.
 */
export async function apiSimulateAccess(
    projectId: string,
    payload: {
        userId: string
        subject: string
        action: string
        recordId?: string
        draftRules?: AbacPolicyRule[]
    },
) {
    return ApiService.fetchDataWithAxios<AccessSimulateResult>({
        url: `/v1/projects/${projectId}/access/simulate`,
        method: 'post',
        data: payload,
    })
}

/**
 * GET /api/v1/projects/:pid/permissions — PDP permission projection for the
 * current user (API-2, ui-shell/TZ §5.1). Source that `usePermissionProjection`
 * switches to in E2-13 (permissive → fail-closed).
 */
export type ProjectPermissionProjection = {
    /** `subject:action` allow-list (precise PDP form). */
    allowed: string[]
    modulePolicyFlags?: Record<string, boolean>
    visibilityScope?: Record<string, unknown>
    /** epoch stamp (K3-invalidation) — projection is invalidated on role/policy change. */
    epoch?: number
}

export async function apiGetProjectPermissions(projectId: string) {
    return ApiService.fetchDataWithAxios<ProjectPermissionProjection>({
        url: `/v1/projects/${projectId}/permissions`,
        method: 'get',
    })
}

/* ── E2-16: Access Units (groups) + VisibilityPolicy ─────────────────────────
 *
 * Contract source: RFC-ACCESS-GROUPS §7.3 (AccessUnitGrpc) + BFF
 * `/api/v1/access-units*` (K3-groups, merged), organization/SCREENS.md.
 *
 * Two distinct group→group axes (RFC §2.1, NORMATIVE):
 *   parentId            structural hierarchy (tree, own_subgroups walks ONLY this);
 *   memberType='group'  composition (DAG, affects only effectiveUsers).
 */

export type AccessUnitScopeType = 'ORGANIZATION' | 'PROJECT'
export type AccessUnitKind = 'department' | 'team' | 'territory' | 'custom'
export type AccessUnitMemberType = 'user' | 'group'

export const ACCESS_UNIT_KINDS: readonly AccessUnitKind[] = [
    'department',
    'team',
    'territory',
    'custom',
]

export const ACCESS_UNIT_KIND_LABELS: Record<AccessUnitKind, string> = {
    department: 'Отдел',
    team: 'Команда',
    territory: 'Территория',
    custom: 'Группа',
}

export type AccessUnit = {
    id: string
    scopeType: AccessUnitScopeType
    scopeId: string
    name: string
    kind: AccessUnitKind
    /** OPTIONAL structural hierarchy (tree) — own_subgroups walks ONLY this. */
    parentId?: string | null
    /** OPTIONAL leader. */
    leaderUserId?: string | null
    archivedAt?: string | null
}

export type AccessUnitMember = {
    groupId: string
    memberType: AccessUnitMemberType
    /** userId | childGroupId. */
    memberId: string
    /** denormalized for display (member name / group name). */
    memberName?: string
}

/** GET /api/v1/access-units?scopeType=&scopeId= (ListAccessUnits §7.3). */
export async function apiGetAccessUnits(params: {
    scopeType: AccessUnitScopeType
    scopeId: string
}) {
    return ApiService.fetchDataWithAxios<AccessUnit[]>({
        url: '/v1/access-units',
        method: 'get',
        params,
    })
}

/** POST /api/v1/access-units (CreateAccessUnit §7.3). */
export async function apiCreateAccessUnit(payload: {
    scopeType: AccessUnitScopeType
    scopeId: string
    name: string
    kind: AccessUnitKind
    parentId?: string | null
    leaderUserId?: string | null
}) {
    return ApiService.fetchDataWithAxios<AccessUnit>({
        url: '/v1/access-units',
        method: 'post',
        data: payload,
    })
}

/** PATCH /api/v1/access-units/:id (UpdateAccessUnit §7.3). */
export async function apiUpdateAccessUnit(
    unitId: string,
    payload: { name?: string; kind?: AccessUnitKind; leaderUserId?: string | null },
) {
    return ApiService.fetchDataWithAxios<AccessUnit>({
        url: `/v1/access-units/${unitId}`,
        method: 'patch',
        data: payload,
    })
}

/** PATCH /api/v1/access-units/:id/parent (SetUnitParent §7.3 — hierarchy axis). */
export async function apiSetAccessUnitParent(
    unitId: string,
    parentId: string | null,
) {
    return ApiService.fetchDataWithAxios<AccessUnit>({
        url: `/v1/access-units/${unitId}/parent`,
        method: 'patch',
        data: { parentId },
    })
}

/** DELETE /api/v1/access-units/:id (ArchiveAccessUnit §7.3 — soft, R7). */
export async function apiArchiveAccessUnit(unitId: string) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/access-units/${unitId}`,
        method: 'delete',
    })
}

/** GET /api/v1/access-units/:id/members (ListUnitMembers §7.3). */
export async function apiGetAccessUnitMembers(unitId: string) {
    return ApiService.fetchDataWithAxios<AccessUnitMember[]>({
        url: `/v1/access-units/${unitId}/members`,
        method: 'get',
    })
}

/**
 * POST /api/v1/access-units/:id/members (AddUnitMember §7.3).
 * memberType='group' requires manage on BOTH groups (M6.4/B3) — 403 otherwise.
 */
export async function apiAddAccessUnitMember(
    unitId: string,
    payload: { memberType: AccessUnitMemberType; memberId: string },
) {
    return ApiService.fetchDataWithAxios<AccessUnitMember>({
        url: `/v1/access-units/${unitId}/members`,
        method: 'post',
        data: payload,
    })
}

/** DELETE /api/v1/access-units/:id/members (RemoveUnitMember §7.3). */
export async function apiRemoveAccessUnitMember(
    unitId: string,
    payload: { memberType: AccessUnitMemberType; memberId: string },
) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/access-units/${unitId}/members`,
        method: 'delete',
        data: payload,
    })
}

/**
 * Expanded-member preview для вложения группы (BX-MODEL-8 §7.2, safety-by-construction).
 * Показывает, насколько вырастет эффективный состав до сохранения, и сколько
 * участников из другого пространства будут отброшены изоляцией скоупов (cross-scope drop).
 */
export type CompositionPreview = {
    currentUserCount: number
    projectedUserCount: number
    addedUserCount: number
    crossScopeDropped: number
}

/** GET /api/v1/access-units/:id/composition-preview?addGroupId= (BX-MODEL-8 §7.2). */
export async function apiPreviewUnitComposition(
    unitId: string,
    addGroupId?: string,
): Promise<CompositionPreview> {
    return ApiService.fetchDataWithAxios<CompositionPreview>({
        url: `/v1/access-units/${unitId}/composition-preview`,
        method: 'get',
        params: addGroupId ? { addGroupId } : {},
    })
}

/*
 * BX-MODEL-4 — консолидация видимости. Единственная поверхность охвата записей в
 * box — простые 5 уровней (`VisibilityConfig`/`VISIBILITY_LEVELS` выше, PATCH через
 * `apiUpdateProjectSettings`). V2-примитивы per-role (`VisibilityPolicy`
 * own_groups/selected_groups) и их writer `apiUpdateVisibilityPolicies` удалены:
 * box-путь обновления проекта нормализует `visibilityConfig` только легаси-строками
 * (control `normalizeVisibilityConfig`), поэтому запись `{rules}`-политик молча
 * терялась бы → рассинхрон. Движок (resolver) остаётся dual-source и понимает обе
 * формы на чтение; box просто не предлагает вторую пишущую поверхность.
 */

export async function apiGetProjectMembers<T>(projectId: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/projects/${projectId}/members`,
        method: 'get',
    })
}

/** Member as returned by GET /projects/:id/members (control contract §3.1). */
export type ProjectMember = {
    id: string
    name: string
    email: string
    role: ProjectRole
    department?: string
    source?: string
}

/**
 * POST /api/v1/projects/:projectId/members — add member (control contract #29).
 * TO-BE on backend (WM5-project-be / E4-27): logic exists in
 * `projects.service.ts:207`, not yet exposed in proto/REST. FE wired against the
 * contracted shape; works once be ships the endpoint.
 */
export async function apiAddProjectMember(
    projectId: string,
    payload: { userId?: string; email?: string; role: ProjectRole },
) {
    return ApiService.fetchDataWithAxios<ProjectMember>({
        url: `/v1/projects/${projectId}/members`,
        method: 'post',
        data: payload,
    })
}

/** PATCH /api/v1/projects/:projectId/members/:userId — change role (contract #30, TO-BE be). */
export async function apiUpdateProjectMemberRole(
    projectId: string,
    userId: string,
    role: ProjectRole,
) {
    return ApiService.fetchDataWithAxios<ProjectMember>({
        url: `/v1/projects/${projectId}/members/${userId}`,
        method: 'patch',
        data: { role },
    })
}

/** DELETE /api/v1/projects/:projectId/members/:userId — remove member (FR-PROJ-215). */
export async function apiPreviewRemoveProjectMember(projectId: string, userId: string) {
    return ApiService.fetchDataWithAxios<{
        ownedCount: number
        breakdown: { domain: string; count: number }[]
    }>({
        url: `/v1/projects/${projectId}/members/${userId}/remove-preview`,
        method: 'get',
    })
}

export async function apiRemoveProjectMember(
    projectId: string,
    userId: string,
    options?: { reassignToUserId?: string },
) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/projects/${projectId}/members/${userId}`,
        method: 'delete',
        data: options?.reassignToUserId ? { reassignToUserId: options.reassignToUserId } : undefined,
    })
}

/**
 * POST /api/v1/projects/:projectId/transfer-ownership — hand the `owner` role to
 * another existing member (FR-MPRJ-4/24, OQ-UX-PRJSET-6). The backend swaps the
 * old owner down to `admin` atomically so the LAST_OWNER invariant is preserved.
 *
 * ❌ Backend NOT ready: no proto/REST yet (control contract has no transfer
 * method; member mutations #29-31 themselves are TO-BE). FE is wired against the
 * contracted shape and gated behind owner-only UI + a dependency note on the
 * board — the transfer action stays hidden until the endpoint ships.
 */
export async function apiTransferProjectOwnership(
    projectId: string,
    newOwnerUserId: string,
    confirmName: string,
) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/projects/${projectId}/transfer-ownership`,
        method: 'post',
        data: { newOwnerUserId, confirmName },
    })
}

/* ── Project lifecycle (FR-PROJ-10/12, control contract #32 + TO-BE) ─────── */

/**
 * DELETE /api/v1/projects/:projectId — archive project (contract #32, TO-BE be).
 * `isArchived` field already exists in schema (`schema.prisma:49`); REST/proto
 * pending in WM5-project-be (E4-27).
 */
export async function apiArchiveProject(projectId: string) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/projects/${projectId}`,
        method: 'delete',
    })
}

/** POST /api/v1/projects/:projectId/unarchive — restore from archive (FR-PROJ-11, TO-BE be). */
export async function apiUnarchiveProject(projectId: string) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/projects/${projectId}/unarchive`,
        method: 'post',
    })
}

/**
 * POST /api/v1/projects/:projectId/request-deletion — soft-delete (retention window,
 * FR-PROJ-12/170). `confirmName` must match the project name.
 */
export async function apiDeleteProject(projectId: string, confirmName: string) {
    return ApiService.fetchDataWithAxios<{ ok: boolean; purgeAt?: string }>({
        url: `/v1/projects/${projectId}/request-deletion`,
        method: 'post',
        data: { confirmName },
    })
}

/** POST /api/v1/projects/:projectId/restore — cancel pending deletion (FR-PROJ-12, TO-BE be). */
export async function apiRestoreProject(projectId: string) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/projects/${projectId}/restore`,
        method: 'post',
    })
}

// ─── CRM (dashboard, contacts, companies, deals, …) ───────────────────────────

// ── TODO-052: ЕДИНСТВЕННОЕ место трансляции ответа statistics-BFF → DashboardData.
// Gateway (statistics-bff.controller.ts) отдаёт kpi/funnel/sources/overdue/
// upcoming/stalled (dashboard) и sales/funnel/sources/team/byDepartment/
// orderTypes (statistics), а экраны
// модуля statistics читают statistics/dealsByStage/dealsBySource/topManagers/
// overdueActivities/… — без маппера оба экрана всегда показывали «Пока нет
// данных». Не добавляй чтение сырых полей в компонентах — расширяй эти мапперы.
type BffMetricValue = {
    key?: string
    label?: string
    value?: number
    previousValue?: number
    growthRate?: number
}
type BffBreakdown = { key?: string; label?: string; count?: number; amount?: number }
type BffActivityRef = { id?: string; title?: string; dueAt?: unknown; ownerId?: string }
type BffStalledDeal = { id?: string; name?: string; amount?: number }
type BffTeamRow = {
    ownerId?: string
    /**
     * ФИО резолвит gateway: `StatisticsBffController.teamFe` прогоняет `owner_id`
     * строк reports через справочник auth и кладёт результат в `ownerName` и
     * `assigneeName` (на CRM-ответах ту же роль играет AssigneeNameInterceptor,
     * FR-MSTAT-29). Само поле опционально: пользователь мог быть удалён —
     * тогда плейсхолдер, а НЕ сырой UUID (см. `bffTeam`).
     *
     * FR-STAT-360: за порогом N_OWNER строка свёрнута в подразделение —
     * `ownerId` пуст, заполнены `departmentId` и имя отдела в `ownerName`.
     */
    assigneeId?: string
    assigneeName?: string
    ownerName?: string
    departmentId?: string
    dealsCount?: number
    amount?: number
    avgCheck?: number
    activitiesCount?: number
}
type BffDepartmentRow = {
    departmentId?: string
    departmentName?: string
    dealsCount?: number
    amount?: number
    avgCheck?: number
    managersCount?: number
}

const bffArr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

// Ключ (`key`) — это id стадии/источника из домена, `label` — только подпись.
// Мэпперы обязаны донести ОБА: drill в целевой список идёт по id (`?stageId=`,
// `?source=`), а по display-имени целевой список сматчить запись не может.
function bffFunnelToStages(
    v: unknown,
): { stage: string; count: number; amount: number; stageId?: string }[] {
    return bffArr<BffBreakdown>(v).map((f) => ({
        stage: String(f.label || f.key || '—'),
        stageId: f.key ? String(f.key) : undefined,
        count: Number(f.count ?? 0),
        amount: Number(f.amount ?? 0),
    }))
}

function bffSources(
    v: unknown,
): { source: string; count: number; sourceKey?: string }[] {
    return bffArr<BffBreakdown>(v).map((s) => ({
        source: String(s.label || s.key || 'Без источника'),
        sourceKey: s.key ? String(s.key) : undefined,
        count: Number(s.count ?? 0),
    }))
}

/**
 * `team[]` BFF → `topManagers` (id сохраняется — по нему drill, FR-MSTAT-24).
 *
 * Имя приходит с gateway (`ownerName`/`assigneeName` — резолв справочника auth
 * в `StatisticsBffController.teamFe`). Если имени в ответе нет (пользователь
 * удалён либо справочник не ответил) —
 * показываем честный плейсхолдер: сырой UUID пользователю не показываем НИКОГДА
 * (id остаётся в `ownerId` — он нужен только для drill, не для отображения).
 */
function bffTeam(v: unknown): DashboardData['topManagers'] {
    return bffArr<BffTeamRow>(v).map((t) => {
        const ownerId = String(t.ownerId ?? t.assigneeId ?? '')
        const departmentId = String(t.departmentId ?? '')
        const name = String(t.ownerName || t.assigneeName || '').trim()
        return {
            name:
                name ||
                (ownerId
                    ? 'Сотрудник без имени'
                    : departmentId
                      ? 'Отдел без названия'
                      : 'Без ответственного'),
            ownerId: ownerId || undefined,
            departmentId: departmentId || undefined,
            deals: Number(t.dealsCount ?? 0),
            amount: Number(t.amount ?? 0),
            conversion: 0,
        }
    })
}

/**
 * `orderTypes[]` BFF (`order_types`, TODO-272 / FR-STAT-280/290) → срез
 * «Типы продаж». Имя типа резолвит gateway (`StatisticsBffController.orderTypesFe`),
 * `orderTypeId` сохраняем: по нему идёт drill в список продаж (`/orders?typeId=`),
 * по подписи список не сматчить. Без этого маппера срез терялся между BFF и
 * экраном — виджет всегда рисовал «данных нет».
 */
function bffOrderTypes(v: unknown): DashboardData['orderTypes'] {
    return bffArr<{ orderTypeId?: string; orderTypeName?: string; count?: number }>(v).map(
        (t) => {
            const orderTypeId = String(t.orderTypeId ?? '')
            const name = String(t.orderTypeName ?? '').trim()
            return {
                orderTypeId,
                // Тип мог быть удалён — плейсхолдер, а не сырой UUID в подписи.
                orderTypeName: name || (orderTypeId ? 'Тип без названия' : 'Без типа'),
                count: Number(t.count ?? 0),
            }
        },
    )
}

/**
 * `byDepartment[]` BFF (`by_department`, FR-MSTAT-28) → срез «Отделы».
 * Имя отдела — из ответа gateway; без него — плейсхолдер, а не сырой UUID.
 */
function bffDepartments(v: unknown): DashboardData['byDepartment'] {
    return bffArr<BffDepartmentRow>(v).map((d) => {
        const departmentId = String(d.departmentId ?? '')
        const name = String(d.departmentName ?? '').trim()
        return {
            departmentId,
            name: name || (departmentId ? 'Отдел без названия' : 'Без отдела'),
            deals: Number(d.dealsCount ?? 0),
            amount: Number(d.amount ?? 0),
            avgCheck: Number(d.avgCheck ?? 0),
            managersCount: Number(d.managersCount ?? 0),
        }
    })
}

function bffActivities(v: unknown): DashboardData['overdueActivities'] {
    return bffArr<BffActivityRef>(v).map((a) => ({
        id: String(a.id ?? ''),
        title: String(a.title ?? ''),
        dueAt: a.dueAt,
        assigneeId: a.ownerId,
    })) as unknown as DashboardData['overdueActivities']
}

/**
 * Счётчик из ответа BFF: число или числовая строка (int64 у gRPC-loader'а с
 * `longs: String`). Не число / отсутствует → undefined, чтобы потребитель мог
 * отличить «сервер не посчитал» от честного нуля.
 */
function bffCount(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
        return Number(v)
    }
    return undefined
}

function bffMeta(raw: Record<string, unknown>) {
    return {
        asOf: raw.asOf as DashboardData['asOf'],
        partial: raw.partial === true,
        scopeLevel: raw.scopeLevel as DashboardData['scopeLevel'],
    }
}

/** GET /api/v1/dashboard (kpi/funnel/sources/overdue/upcoming/stalled) → DashboardData. */
function mapBffDashboardToFrontend(raw: Record<string, unknown>): DashboardData {
    return {
        statistics: bffArr<BffMetricValue>(raw.kpi).map((k) => ({
            key: String(k.key ?? ''),
            label: String(k.label ?? ''),
            value: Number(k.value ?? 0),
            // TODO-504: сравнение с прошлым периодом НЕ подменяем нулём.
            // `?? 0` превращал «поля нет» (старая сборка домена) в «рост 0%»,
            // и BFF-тест этого не ловил — подмену делал маппер, а не gateway.
            // undefined доезжает до `KpiCell` и там означает «индикатор не
            // рисуем», честный ноль — остаётся нулём.
            previousValue: bffCount(k.previousValue),
            growthRate: bffCount(k.growthRate),
        })),
        dealsByStage: bffFunnelToStages(raw.funnel),
        dealsTimeline: [],
        dealsBySource: bffSources(raw.sources),
        topManagers: [],
        recentDeals: [],
        overdueActivities: bffActivities(raw.overdue),
        upcomingActivities: bffActivities(raw.upcoming),
        stalledDeals: bffArr<BffStalledDeal>(raw.stalled).map((d) => ({
            id: String(d.id ?? ''),
            name: String(d.name ?? ''),
            amount: Number(d.amount ?? 0),
        })) as unknown as DashboardData['stalledDeals'],
        // TODO-498: размеры списков ДО усечения лимитом. Без них виджет считал
        // остаток от собственного усечённого массива и «+ ещё N» был вечным
        // нулём. Поля нет (старый gateway) → undefined, виджет остаётся на
        // AS-IS-поведении, а не показывает выдуманное число.
        overdueTotal: bffCount(raw.overdueTotal),
        upcomingTotal: bffCount(raw.upcomingTotal),
        stalledTotal: bffCount(raw.stalledTotal),
        ...bffMeta(raw),
    }
}

/** GET /api/v1/statistics (sales/funnel/sources/team) → DashboardData (analytics-срезы). */
function mapBffStatisticsToFrontend(raw: Record<string, unknown>): DashboardData {
    return {
        statistics: [],
        dealsByStage: bffFunnelToStages(raw.funnel),
        dealsTimeline: [],
        dealsBySource: bffSources(raw.sources),
        // team несёт ownerId/dealsCount/amount (conversion в контракте BFF нет).
        topManagers: bffTeam(raw.team),
        // FR-STAT-360: BFF пишет, чем сгруппирован team — иначе виджет
        // продолжает звать свёрнутые строки «менеджерами».
        teamGrouping: raw.teamGrouping === 'department' ? 'department' : 'user',
        // by_department посчитан доменом и уже уходит в ответе BFF — читаем его,
        // иначе срез «Отделы» молча теряется (FR-MSTAT-28).
        byDepartment: bffDepartments(raw.byDepartment),
        // order_types: reports считает, gateway резолвит имена типов — срез
        // «Типы продаж» (TODO-272).
        orderTypes: bffOrderTypes(raw.orderTypes),
        stageDurations: bffArr<{
            stage_id?: string
            label?: string
            transition_count?: number
            avg_duration_ms?: number
        }>(raw.stageDurations).map((r) => ({
            stageId: String(r.stage_id ?? ''),
            label: String(r.label ?? r.stage_id ?? ''),
            transitionCount: Number(r.transition_count ?? 0),
            avgDurationMs: Number(r.avg_duration_ms ?? 0),
        })),
        recentDeals: [],
        overdueActivities: [],
        upcomingActivities: [],
        // Динамика продаж: срез sales BFF ({bucket,count,amount}).
        sales: bffArr<{ bucket?: string; count?: number; amount?: number }>(raw.sales).map(
            (p) => ({
                bucket: String(p.bucket ?? ''),
                count: Number(p.count ?? 0),
                amount: Number(p.amount ?? 0),
            }),
        ),
        ...bffMeta(raw),
    }
}

/**
 * Operational dashboard metrics (C1-stats-be `GET /api/v1/dashboard`,
 * statistics-TZ §5.5/FR-MSTAT-1/4/7). `projectId` + `period` (+ custom `from`/`to`)
 * go to the gateway BFF which fans out to `*.GetMetrics` under the viewer's
 * visibility scope and route-guard (`statistics:read` + module). Response carries
 * `asOf`/`partial`/`scopeLevel` meta (FR-MSTAT-14/15/26).
 */
export async function apiGetDashboard<T>(params?: {
    projectId?: string
    period?: string
    from?: number
    to?: number
}) {
    const raw = await ApiService.fetchDataWithAxios<Record<string, unknown>>({
        url: '/v1/dashboard',
        method: 'get',
        params,
    })
    return mapBffDashboardToFrontend(raw ?? {}) as T
}

/**
 * Analytics metrics (C1-stats-be `GET /api/v1/statistics`, FR-MSTAT-2/17).
 * Detailed slices (`sales|funnel|sources|team|by_department|order_types`) under
 * the same visibility scope + route-guard. Read-only.
 */
export async function apiGetStatistics<T>(params?: {
    projectId?: string
    period?: string
    from?: number
    to?: number
    slices?: string[]
}) {
    const raw = await ApiService.fetchDataWithAxios<Record<string, unknown>>({
        url: '/v1/statistics',
        method: 'get',
        params,
    })
    return mapBffStatisticsToFrontend(raw ?? {}) as T
}

/**
 * Экспорт сводки (`GET /api/v1/statistics/export`, FR-MSTAT-2/22/23).
 *
 * Gateway принимает `format=csv|json` (по умолчанию csv) и отдаёт готовый файл
 * с `Content-Disposition`. Ходим ЧЕРЕЗ ApiService, а не сырым `fetch`: сырой
 * запрос не проходит axios-перехватчик и теряет `Authorization`/`X-Project-Id`
 * (стратегия localStorage/sessionStorage → 401 вместо файла) — тот же паттерн,
 * что у `apiDownloadVersion` в DocumentsService.
 */
export async function apiExportStatistics(params: {
    projectId: string
    period: string
    format: 'csv' | 'json'
    from?: number
    to?: number
    slices?: string[]
}) {
    return ApiService.fetchDataWithAxios<Blob>({
        url: '/v1/statistics/export',
        method: 'get',
        params,
        responseType: 'blob',
    })
}

export async function apiGetContacts<T, U extends Record<string, unknown>>(params: U) {
    const data = await ApiService.fetchDataWithAxios<{ list: unknown[]; total: number }>({ url: '/v1/contacts', method: 'get', params })
    if (data?.list && Array.isArray(data.list)) {
        return { list: data.list.map((item) => mapBackendContactToFrontend(item as Record<string, unknown>)), total: data.total } as T
    }
    return data as T
}

export async function apiGetContact<T>(id: string, params?: { projectId?: string }) {
    const data = await ApiService.fetchDataWithAxios<Record<string, unknown>>({ url: `/v1/contacts/${id}`, method: 'get', params })
    return (data ? mapBackendContactToFrontend(data) : data) as T
}

/** История изменений контакта (audit). Mirrors apiGetCompanyHistory. */
export async function apiGetContactHistory<T>(
    id: string,
    params: { projectId: string; limit?: number; cursor?: string },
) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/contacts/${id}/history`,
        method: 'get',
        params,
    })
}

export type ContactWritePayload = {
    firstName?: string
    lastName?: string
    middleName?: string
    phone?: string
    email?: string
    position?: string
    companyId?: string
    companyIds?: string[]
    source?: string
    assigneeId?: string
    /**
     * W-6 — подразделение-владелец. Принимается ТОЛЬКО на создании
     * (`v1-data-bff.controller#createContact` → `department_id`): в update домен
     * его вычёркивает наравне с ownerId (`contacts.service.ts`
     * STRIPPED_UPDATE_FIELDS), смена отдела идёт через
     * `apiReassignContacts({ newDepartmentId })`.
     */
    departmentId?: string
    tags?: string[]
    notes?: string
    forceCreate?: boolean
    trashCollisionResolution?: 'restore' | 'create_new'
}

export type DuplicateCandidate = {
    contactId: string
    displayName: string
    matchedOn: 'email' | 'phone'
    maskedValue: string
    /** Soft-deleted (trash) — FR-DEALS-040 «Похожий в корзине». */
    deleted?: boolean
}

/**
 * TODO-176 — генератор ключа идемпотентности для мутаций контактов.
 *
 * Домен contact ведёт ledger (`contact.grpc.controller.ts` — `withIdempotency`
 * на create/import/merge), gateway пробрасывает заголовок в gRPC-метадату
 * (`downstream-metadata.ts`: `idempotency-key`). До этой правки FE заголовок не
 * слал вовсе — ledger был мёртв, а повторный клик/ретрай создавал дубль записи
 * (для merge — повторно выполнял разрушающую операцию).
 *
 * Ключ генерируется ОДИН раз на попытку пользователя: вызывающий код передаёт
 * его явно, если попытка может ретраиться несколькими вызовами api-функции.
 * Без аргумента — новый ключ на каждый вызов (= один клик).
 */
export function newIdempotencyKey(): string {
    const c = globalThis.crypto as Crypto | undefined
    if (c?.randomUUID) return c.randomUUID()
    // jsdom/старые браузеры без crypto.randomUUID — ключ всё равно должен быть.
    return `ff-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

const idempotencyHeader = (key?: string) => ({
    'Idempotency-Key': key ?? newIdempotencyKey(),
})

export async function apiInstallProjectModule(
    projectId: string,
    moduleId: string,
    idempotencyKey?: string,
) {
    return ApiService.fetchDataWithAxios<ProjectModuleState>({
        url: `/v1/projects/${projectId}/modules/${moduleId}/install`,
        method: 'post',
        headers: idempotencyHeader(idempotencyKey),
    })
}

export async function apiUninstallProjectModule(
    projectId: string,
    moduleId: string,
    idempotencyKey?: string,
) {
    return ApiService.fetchDataWithAxios<ProjectModuleState>({
        url: `/v1/projects/${projectId}/modules/${moduleId}/uninstall`,
        method: 'post',
        headers: idempotencyHeader(idempotencyKey),
    })
}

export async function apiEnableProjectModule(
    projectId: string,
    moduleId: string,
    idempotencyKey?: string,
) {
    return ApiService.fetchDataWithAxios<ProjectModuleState>({
        url: `/v1/projects/${projectId}/modules/${moduleId}/enable`,
        method: 'post',
        headers: idempotencyHeader(idempotencyKey),
    })
}

export async function apiDisableProjectModule(
    projectId: string,
    moduleId: string,
    opts?: { cascade?: boolean },
    idempotencyKey?: string,
) {
    return ApiService.fetchDataWithAxios<ProjectModuleState>({
        url: `/v1/projects/${projectId}/modules/${moduleId}/disable`,
        method: 'post',
        data: opts ?? {},
        headers: idempotencyHeader(idempotencyKey),
    })
}

export type ModuleUpgradePreview = {
    module_id: string
    from_version: string
    to_version: string
    upgrade_class: 'patch' | 'minor' | 'major' | 'none' | string
    requires_confirmation: boolean
    migration_required: boolean
    migrations?: Array<{
        from_major?: number
        to_major?: number
        script_ref?: string
        reversible?: boolean
    }>
}

/** POST .../upgrade/preview — class + migration requirement, no mutation. */
export async function apiPreviewUpgradeProjectModule(
    projectId: string,
    moduleId: string,
    payload?: { toVersion?: string },
) {
    return ApiService.fetchDataWithAxios<ModuleUpgradePreview>({
        url: `/v1/projects/${projectId}/modules/${moduleId}/upgrade/preview`,
        method: 'post',
        data: payload ?? {},
    })
}

export async function apiUpgradeProjectModule(
    projectId: string,
    moduleId: string,
    payload?: { toVersion?: string; confirmMajor?: boolean },
    idempotencyKey?: string,
) {
    return ApiService.fetchDataWithAxios<ProjectModuleState>({
        url: `/v1/projects/${projectId}/modules/${moduleId}/upgrade`,
        method: 'post',
        data: payload ?? {},
        headers: idempotencyHeader(idempotencyKey),
    })
}

/** POST .../resume-delivery — explicit runtime resume with DLQ fate (FR-PLATFORM-115). */
export async function apiResumeModuleDelivery(
    projectId: string,
    moduleId: string,
    dlq: 'discard' | 'deliver',
    idempotencyKey?: string,
) {
    return ApiService.fetchDataWithAxios<ProjectModuleState>({
        url: `/v1/projects/${projectId}/modules/${moduleId}/resume-delivery`,
        method: 'post',
        data: { dlq },
        headers: idempotencyHeader(idempotencyKey),
    })
}

/** POST /api/contacts — create with soft dedup-radar (contract §3.3). */
export async function apiCreateContact<T = Contact>(
    payload: ContactWritePayload,
    params?: { projectId?: string },
    /** TODO-176: ключ идемпотентности попытки (по умолчанию — новый на вызов). */
    idempotencyKey?: string,
) {
    const data = await ApiService.fetchDataWithAxios<Record<string, unknown>>({
        url: '/v1/contacts',
        method: 'post',
        params,
        data: payload,
        headers: idempotencyHeader(idempotencyKey),
    })
    return (data ? mapBackendContactToFrontend(data) : data) as T
}

/** PUT /api/contacts/:id — update (contract §3.4). */
export async function apiUpdateContact<T = Contact>(
    id: string,
    payload: ContactWritePayload,
    params?: { projectId?: string },
) {
    const data = await ApiService.fetchDataWithAxios<Record<string, unknown>>({
        url: `/v1/contacts/${id}`,
        method: 'put',
        params,
        data: payload,
    })
    return (data ? mapBackendContactToFrontend(data) : data) as T
}

/** DELETE /api/contacts/:id — soft-delete to trash (contract §3.5). */
export async function apiDeleteContact(id: string, params?: { projectId?: string }) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/contacts/${id}`,
        method: 'delete',
        params,
    })
}

/** GET /api/contacts/duplicates — dedup-radar (contract §3.8). */
export async function apiFindContactDuplicates(params: {
    projectId?: string
    email?: string
    phone?: string
    excludeId?: string
}) {
    return ApiService.fetchDataWithAxios<{
        candidates: DuplicateCandidate[]
        possibleExternalDuplicate: boolean
    }>({ url: '/v1/contacts/duplicates', method: 'get', params })
}

export type ImportResult = {
    created: number
    updated?: number
    skipped: number | { row: number; reason: string; matchedContactId?: string; matchedField?: string }[]
    errors: string[] | { row: number; message: string }[]
}

/** POST /api/contacts/import — CSV import with batch dedup (contract §3.7). */
export async function apiImportContacts(
    formData: FormData,
    params?: { projectId?: string },
    /** TODO-176: один ключ на попытку импорта — повтор того же файла не создаёт вторую пачку. */
    idempotencyKey?: string,
) {
    return ApiService.fetchDataWithAxios<ImportResult, FormData>({
        url: '/v1/contacts/import',
        method: 'post',
        params,
        data: formData,
        headers: {
            'Content-Type': 'multipart/form-data',
            ...idempotencyHeader(idempotencyKey),
        },
    })
}

/**
 * EXTRA-CONTACTS-1 — серверный экспорт контактов (`GET /v1/contacts/export`,
 * gateway `v1-data-bff.controller.ts`, `@RequirePermission('contacts','export')`).
 *
 * Раньше кнопка экспорта клеила CSV из уже загруженной СТРАНИЦЫ списка (10 строк
 * по умолчанию) — «выгрузить всё» отдавало десять записей. Сервер отдаёт готовый
 * файл в пределах того же visibility-scope, что и список.
 *
 * Ручка принимает РОВНО `projectId`, `format`, `query` — параметров `source`/
 * `assigneeId` у неё нет (в отличие от GET /v1/contacts), поэтому сюда их не
 * передаём и не делаем вид, что фильтры применились. Паритет фильтров экспорта
 * со списком — задача на владельца gateway.
 */
export async function apiExportContacts(params: {
    projectId: string
    format?: 'csv' | 'json'
    query?: string
}) {
    try {
        return await ApiService.fetchDataWithAxios<Blob>({
            url: '/v1/contacts/export',
            method: 'get',
            params: {
                projectId: params.projectId,
                format: params.format ?? 'csv',
                ...(params.query ? { query: params.query } : {}),
            },
            responseType: 'blob',
        })
    } catch (err) {
        // При responseType:'blob' axios кладёт в response.data Blob и для ОШИБОК —
        // конверт `{ error: { message } }` в нём остаётся нечитаемым, и любой
        // осмысленный отказ сервера (400 «выборка больше лимита выгрузки», 403)
        // превращался в общее «Произошла ошибка». Разворачиваем конверт обратно
        // в объект, чтобы extractApiError показал причину пользователю.
        throw await unwrapBlobApiError(err)
    }
}

/** Текст Blob-а. `Blob.text()` есть не везде (Safari < 14, jsdom) — оттуда FileReader. */
function blobText(blob: Blob): Promise<string> {
    if (typeof blob.text === 'function') return blob.text()
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error)
        reader.readAsText(blob)
    })
}

/** Blob-тело ошибки → распарсенный конверт ошибки на том же axios-объекте. */
async function unwrapBlobApiError(err: unknown): Promise<unknown> {
    const response = (err as { response?: { data?: unknown } })?.response
    const data = response?.data
    if (!response || !(data instanceof Blob)) return err
    try {
        const text = await blobText(data)
        if (text) response.data = JSON.parse(text)
    } catch {
        // Не JSON (или Blob уже прочитан) — оставляем как есть, вызывающий
        // покажет сетевое сообщение axios.
    }
    return err
}

/**
 * TODO-177 — POST /v1/contacts/reassign (gateway `v1-data-bff.controller.ts`,
 * `@RequirePermission('contacts','manage')`).
 *
 * Единственный путь смены владельца контакта: `UpdateContact` поле ownerId
 * вычёркивает (`contacts.service.ts` STRIPPED_UPDATE_FIELDS, FR-MCON-24).
 *
 * W-6: тем же путём меняется и подразделение-владелец — `departmentId` домен
 * вычёркивает из update так же, как ownerId. Домен требует РОВНО ОДНО из
 * `newOwnerId`/`newDepartmentId` (`contacts.service.ts#reassign`: два значения
 * или ни одного → INVALID_ARGUMENT) и снимает парное поле: запись принадлежит
 * либо сотруднику, либо отделу.
 */
export async function apiReassignContacts(
    payload: { contactIds: string[]; newOwnerId?: string; newDepartmentId?: string },
    params?: { projectId?: string },
) {
    return ApiService.fetchDataWithAxios<{ reassigned: number }>({
        url: '/v1/contacts/reassign',
        method: 'post',
        params,
        data: payload,
    })
}

/** FR-CONTACTS-467: пакетное переназначение «ушёл X → всё на Y». */
export async function apiReassignContactsFromOwner(
    payload: { fromOwnerId: string; toOwnerId: string },
    params?: { projectId?: string },
) {
    return ApiService.fetchDataWithAxios<{ reassigned: number }>({
        url: '/v1/contacts/reassign-from-owner',
        method: 'post',
        params,
        data: payload,
    })
}

export type ContactsModuleSettings = {
    defaultCountry?: string
    trashTtlDays?: number
    shadowTtlDays?: number
    driftDetectionEnabled?: boolean
}

export const DEFAULT_CONTACTS_MODULE_SETTINGS: ContactsModuleSettings = {
    defaultCountry: '7',
    trashTtlDays: 7,
    shadowTtlDays: 30,
    driftDetectionEnabled: true,
}

export async function apiGetContactsModuleSettings(projectId: string) {
    return ApiService.fetchDataWithAxios<ContactsModuleSettings>({
        url: `/projects/${projectId}/modules/contacts/settings`,
        method: 'get',
    })
}

export async function apiPutContactsModuleSettings(
    projectId: string,
    settings: ContactsModuleSettings,
) {
    return ApiService.fetchDataWithAxios<ContactsModuleSettings>({
        url: `/projects/${projectId}/modules/contacts/settings`,
        method: 'put',
        data: settings,
    })
}

export async function apiGetCompanyContacts(
    companyId: string,
    params: { projectId: string },
) {
    const data = await ApiService.fetchDataWithAxios<{
        list: unknown[]
        total: number
        truncated?: boolean
    }>({
        url: `/v1/companies/${companyId}/contacts`,
        method: 'get',
        params,
    })
    if (data?.list && Array.isArray(data.list)) {
        return {
            list: data.list.map((item) =>
                mapBackendContactToFrontend(item as Record<string, unknown>),
            ),
            total: data.total,
            truncated: data.truncated,
        }
    }
    return data
}

/**
 * GET /api/contacts (deletedAt!=null) — trash list (contract §3.5/SCR-CONTACTS-TRASH).
 * BFF принимает `state=trashed`; пока эндпоинт TO-BE, FE шлёт фильтр и маппит ответ.
 */
export async function apiGetTrashedContacts<T = { list: Contact[]; total: number }>(
    params: { projectId?: string; pageIndex?: number; pageSize?: number },
) {
    const data = await ApiService.fetchDataWithAxios<{ list: unknown[]; total: number }>({
        url: '/v1/contacts',
        method: 'get',
        params: { ...params, state: 'trashed' },
    })
    if (data?.list && Array.isArray(data.list)) {
        return {
            list: data.list.map((item) => mapBackendContactToFrontend(item as Record<string, unknown>)),
            total: data.total,
        } as T
    }
    return data as T
}

export type RestoreOutcome = {
    outcome: 'restored' | 'collision'
    contact?: Contact
    collision?: {
        candidates: DuplicateCandidate[]
        options: ('merge' | 'clear_keys')[]
    }
}

/** POST /api/contacts/:id/restore — restore from trash with collision fork (contract §3.6). */
export async function apiRestoreContact(
    id: string,
    body?: { collisionResolution?: 'merge' | 'clear_keys' },
    params?: { projectId?: string },
) {
    const data = await ApiService.fetchDataWithAxios<Record<string, unknown>>({
        url: `/v1/contacts/${id}/restore`,
        method: 'post',
        params,
        data: body ?? {},
    })
    const outcome = data as unknown as RestoreOutcome
    if (outcome?.contact) {
        outcome.contact = mapBackendContactToFrontend(
            outcome.contact as unknown as Record<string, unknown>,
        )
    }
    // Нормализуем кандидатов коллизии: BE отдаёт сырой {id, firstName, lastName, email, phone},
    // а диалог рендерит форму DuplicateCandidate {contactId, displayName, maskedValue}.
    // Толерантно к обеим формам (сырая BE / уже нормализованная).
    if (outcome?.outcome === 'collision' && outcome.collision) {
        const rawCandidates = (outcome.collision.candidates ?? []) as unknown as Array<
            Record<string, unknown>
        >
        outcome.collision.candidates = rawCandidates.map((cand) => {
            const firstName = (cand.firstName as string) ?? ''
            const lastName = (cand.lastName as string) ?? ''
            const email = (cand.email as string) ?? ''
            const phone = (cand.phone as string) ?? ''
            const contactId = (cand.contactId ?? cand.id ?? '') as string
            const displayName =
                (cand.displayName as string) ??
                ([firstName, lastName].join(' ').trim() || email || phone || contactId)
            const maskedValue = (cand.maskedValue as string) ?? (email || phone || '')
            return {
                contactId,
                displayName,
                maskedValue,
                matchedOn: (cand.matchedOn as 'email' | 'phone') ?? 'email',
            } as DuplicateCandidate
        })
    }
    return outcome
}

export type DuplicatePair = {
    left: DuplicateCandidate
    right: DuplicateCandidate
    matchedOn: 'email' | 'phone'
}

/** GET /api/contacts/duplicate-queue — potential duplicate pairs (contract §3.9). */
export async function apiGetContactDuplicateQueue(params: {
    projectId?: string
    pageIndex?: number
    pageSize?: number
}) {
    return ApiService.fetchDataWithAxios<{ pairs: DuplicatePair[]; total: number }>({
        url: '/v1/contacts/duplicate-queue',
        method: 'get',
        params,
    })
}

/** POST /api/contacts/merge — merge source into target (contract §3.10). */
export async function apiMergeContacts<T = Contact>(
    body: { sourceId: string; targetId: string; survivorFields?: Record<string, string> },
    params?: { projectId?: string },
    /** TODO-176: merge разрушающий (донор поглощается) — повтор должен реиграть ответ, а не сливать снова. */
    idempotencyKey?: string,
) {
    const data = await ApiService.fetchDataWithAxios<Record<string, unknown>>({
        url: '/v1/contacts/merge',
        method: 'post',
        params,
        data: body,
        headers: idempotencyHeader(idempotencyKey),
    })
    return (data ? mapBackendContactToFrontend(data) : data) as T
}

/**
 * TODO-161 — POST /api/v1/contacts/:id/unmerge (contract §3.11, FR-CONTACTS-260).
 *
 * Откат слияния: `id` — это ДОНОР (тень слияния), а не мастер. Домен воскрешает
 * донора и возвращает его карточку. Окно — 30 дней с момента слияния, после чего
 * приходит 409 (`details.reason = 'unmerge_expired'`). Право на шлюзе —
 * contacts:manage (как у merge; DECISIONS merge/unmerge).
 */
export async function apiUnmergeContact<T = Contact>(
    sourceId: string,
    params?: { projectId?: string },
) {
    const data = await ApiService.fetchDataWithAxios<Record<string, unknown>>({
        url: `/v1/contacts/${sourceId}/unmerge`,
        method: 'post',
        params,
        data: {},
    })
    return (data ? mapBackendContactToFrontend(data) : data) as T
}

export type ContactLinkRef = { id: string; title: string }
export type ContactLinks = {
    deals: ContactLinkRef[]
    orders: ContactLinkRef[]
    activities: ContactLinkRef[]
    documents: ContactLinkRef[]
    companies: ContactLinkRef[]
}

/** GET /api/contacts/:id/links — merge preview aggregate (contract §3.12). */
export async function apiGetContactLinks(id: string, params?: { projectId?: string }) {
    return ApiService.fetchDataWithAxios<ContactLinks>({
        url: `/v1/contacts/${id}/links`,
        method: 'get',
        params,
    })
}

export async function apiGetCompanies<T, U extends Record<string, unknown>>(params: U) {
    const data = await ApiService.fetchDataWithAxios<{ list: unknown[]; total: number }>({ url: '/v1/companies', method: 'get', params })
    if (data?.list && Array.isArray(data.list)) {
        return { list: data.list.map((item) => mapBackendCompanyToFrontend(item as Record<string, unknown>)), total: data.total } as T
    }
    return data as T
}

export async function apiGetCompany<T>(id: string, params?: { projectId?: string }) {
    const data = await ApiService.fetchDataWithAxios<Record<string, unknown>>({ url: `/v1/companies/${id}`, method: 'get', params })
    return (data ? mapBackendCompanyToFrontend(data) : data) as T
}

export async function apiGetDeals<T, U extends Record<string, unknown>>(params: U) {
    return ApiService.fetchDataWithAxios<T>({ url: '/v1/deals', method: 'get', params })
}

export async function apiGetDealsKanban<T>(pipelineId?: string) {
    // Gateway BFF резолвит воронку/этапы по projectId ТОЛЬКО из query (X-Project-Id
    // заголовок он для этих ручек не читает) → без явного projectId ответ 404
    // "Pipeline not found" и доска падает в «Не удалось загрузить». withProjectId
    // добирает текущий проект из стора.
    const params = withProjectId(pipelineId ? { pipelineId } : {})
    return ApiService.fetchDataWithAxios<T>({ url: '/v1/deals/kanban', method: 'get', params })
}

export async function apiGetDeal<T>(id: string, projectId?: string) {
    return ApiService.fetchDataWithAxios<T>({ url: `/v1/deals/${id}`, method: 'get', params: projectId ? { projectId } : undefined })
}

/** GET /v1/deals/:id/stage-history — полная история стадий (FR-REPORTS-250). */
export async function apiGetDealStageHistory<T>(id: string, projectId?: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deals/${id}/stage-history`,
        method: 'get',
        params: projectId ? { projectId } : undefined,
    })
}

export async function apiGetPipelines<T>() {
    // projectId ОБЯЗАТЕЛЕН в query: без него gateway отдаёт пустой список воронок
    // (заголовок X-Project-Id для этой ручки не читается) → селектор воронки и
    // канбан-доска остаются пустыми.
    return ApiService.fetchDataWithAxios<T>({ url: '/v1/pipelines', method: 'get', params: withProjectId({}) })
}

export async function apiGetDealSources<T>() {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/deal-sources',
        method: 'get',
        params: withProjectId({}),
    })
}

/** POST /deal-sources — create a lead/deal source (deals:manage). */
export async function apiCreateDealSource<T>(payload: { name: string; color?: string }) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/deal-sources',
        method: 'post',
        params: withProjectId({}),
        data: payload,
    })
}

/** PUT /deal-sources/:id — rename / recolor a source (deals:manage). */
export async function apiUpdateDealSource<T>(
    id: string,
    payload: { name?: string; color?: string },
) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deal-sources/${id}`,
        method: 'put',
        params: withProjectId({}),
        data: payload,
    })
}

/** DELETE /deal-sources/:id — remove a source (deals:manage). */
export async function apiDeleteDealSource<T>(id: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deal-sources/${id}`,
        method: 'delete',
        params: withProjectId({}),
    })
}

/**
 * GET /members — участники проекта (селекты «Ответственный», доступ к записи).
 *
 * projectId ОБЯЗАТЕЛЕН в query: BFF читает именно `@Query('projectId')`
 * (`crm-bff.controller.ts` → `project.listMembers`), и при пустом значении control
 * отдаёт `{ list: [] }` — селекты молча пустеют. Поэтому pid подставляется из стора
 * через withProjectId (как в apiGetDealSources/apiGetPipelines); явный params
 * перекрывает стор, если вызывающий знает проект точнее.
 */
export async function apiGetMembers<T>(params?: { projectId?: string }) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/members',
        method: 'get',
        params: withProjectId({ ...params }),
    })
}

// TODO-184: projectId ОБЯЗАТЕЛЕН в query — gateway читает его из query/заголовка
// и без него передаёт в orders пустой `project_id`, т.е. виджет «Продажи» в
// карточке сделки/компании и селектор продажи в drawer молча оставались пустыми.
// `withProjectId` идемпотентен — явный projectId вызывающего (OrderList) не перетирается.
export async function apiGetOrders<T, U extends Record<string, unknown>>(params: U) {
    return ApiService.fetchDataWithAxios<T>({ url: '/v1/orders', method: 'get', params: withProjectId(params) })
}

/** Итог серверной выгрузки продаж: сам файл + признак полноты набора. */
export type OrdersExportResult = {
    blob: Blob
    /** Сервер отдал НЕ весь отфильтрованный набор (упёрся в потолок выгрузки). */
    truncated: boolean
    /** Сколько строк реально в файле. */
    rowCount: number
    /** Сколько строк видно по этим фильтрам всего (по данным домена). */
    total: number
}

/**
 * TODO-409: серверный экспорт продаж — `GET /api/v1/orders/export`
 * (crm-bff.controller.ts `exportOrders`, право `orders:export`, тот же
 * visibility-scope, что и у списка). Выгружается весь отфильтрованный набор
 * (BFF листает домен страницами по 100 — доменный клампе размера страницы),
 * но не больше жёсткого потолка `ORDERS_EXPORT_MAX_ROWS` = 10 000 строк.
 *
 * Факт усечения обязан дойти до пользователя, поэтому здесь `AxiosBase`, а не
 * `ApiService`: последний отдаёт только `response.data`, а признак полноты живёт
 * в заголовках `X-Export-*` (gateway перечисляет их в CORS `exposedHeaders`).
 * Сам файл тоже несёт маркер усечения строкой/элементом — на случай, если файл
 * откроют мимо UI. Ответ — файл (CSV/JSON), поэтому `responseType: 'blob'`.
 */
export async function apiExportOrders(params: {
    format?: 'csv' | 'json'
    query?: string
    dealId?: string
    typeId?: string
    status?: string
    stageId?: string
}): Promise<OrdersExportResult> {
    const res = await AxiosBase({
        url: '/v1/orders/export',
        method: 'get',
        params: withProjectId({ format: 'csv', ...params } as Record<string, unknown>),
        responseType: 'blob',
    })
    const head = (name: string) => {
        const raw = (res.headers as Record<string, unknown> | undefined)?.[name]
        return raw == null ? '' : String(raw)
    }
    const num = (name: string) => {
        const n = Number(head(name))
        return Number.isFinite(n) ? n : 0
    }
    return {
        blob: res.data as Blob,
        // Заголовка нет (старый gateway / прокси его срезал) — не выдумываем усечение,
        // но и не выдумываем полноту: маркер внутри файла остаётся вторым каналом.
        truncated: head('x-export-truncated') === 'true',
        rowCount: num('x-export-row-count'),
        total: num('x-export-total'),
    }
}

export async function apiGetOrdersKanban<T>(typeId?: string) {
    // projectId ОБЯЗАТЕЛЕН в query (см. apiGetPipelines): без него gateway отдаёт
    // пустые columns → доска «Нет типов продаж с этапами».
    // typeId — фильтр доски по типу продажи (BFF `ordersKanban(@Query('typeId'))`
    // → gRPC `type_id`). Без него селектор типа на доске был декоративным:
    // домен всегда отдавал первый тип проекта.
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/orders/kanban',
        method: 'get',
        params: withProjectId(typeId ? { typeId } : {}),
    })
}

// TODO-047: одиночные orders-эндпоинты передают projectId ЯВНО в query
// (withProjectId) — gateway читает его из query/заголовка, без него домен
// фильтрует {projectId: ''} → NOT_FOUND на карточке/мутациях продажи.
export async function apiGetOrder<T>(id: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/orders/${id}`,
        method: 'get',
        params: withProjectId({}),
    })
}

/**
 * TODO-414: реальная лента изменений продажи (`GET /v1/orders/:id/history`,
 * BFF читает неизменяемую цепочку audit — как у контактов и компаний). До неё
 * карточка «История» синтезировала события из createdAt/updatedAt на клиенте.
 */
export async function apiGetOrderHistory<T>(id: string, params: { limit?: number } = {}) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/orders/${id}/history`,
        method: 'get',
        params: withProjectId(params),
    })
}

export async function apiGetOrderTypes<T>() {
    // projectId ОБЯЗАТЕЛЕН в query (см. apiGetPipelines): без него список типов
    // продаж пуст → селектор типа и доска продаж остаются без колонок.
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/order-types',
        method: 'get',
        params: withProjectId({}),
    })
}

export async function apiGetOrderType<T>(id: string, version?: number) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/order-types/${id}`,
        method: 'get',
        params: withProjectId(version !== undefined ? { version } : {}),
    })
}

/** POST /order-types (§3.3 CreateOrderType, orders:manage). */
export async function apiCreateOrderType<T>(payload: Record<string, unknown>) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/order-types',
        method: 'post',
        params: withProjectId({}),
        data: payload,
    })
}
/** PUT /order-types/:id (§3.4 UpdateOrderType → новая ревизия, orders:manage). */
export async function apiUpdateOrderType<T>(id: string, payload: Record<string, unknown>) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/order-types/${id}`,
        method: 'put',
        params: withProjectId({}),
        data: payload,
    })
}
/** DELETE /order-types/:id (§3.5 DeleteOrderType — soft, orders:manage). */
export async function apiDeleteOrderType<T>(id: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/order-types/${id}`,
        method: 'delete',
        params: withProjectId({}),
    })
}
/** POST /order-types/:id/restore (§3.6 RestoreOrderType, orders:manage). */
export async function apiRestoreOrderType<T>(id: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/order-types/${id}/restore`,
        method: 'post',
        params: withProjectId({}),
    })
}

export async function apiGetActivities<T, U extends Record<string, unknown>>(params: U) {
    return ApiService.fetchDataWithAxios<T>({ url: '/v1/activities', method: 'get', params: withProjectId(params) })
}

/**
 * GET /v1/activities/calendar — готовая календарная проекция активностей
 * (`crm-bff.controller.ts` @Get('activities/calendar') → `ActivityGrpc.ListActivitiesCalendar`).
 * Домен сам решает грани события: встреча — интервал start/end, задача — all-day
 * метка на dueDate, звонок — точка; цвет по типу, просроченное — красным
 * (`activity.service.ts#calendar`). Ответ — плоский массив
 * `{id,title,start,end,allDay,color,extendedProps:{type,overdue}}`, даты уже ISO.
 *
 * Поддерживаемые сервером параметры (ровно они, больше ручка не принимает):
 *  - `type` — ОДИН из task|call|meeting|note (не список; чужое значение → 422);
 *  - `mine` — 'self' сужает до текущего пользователя внутри его visibility-scope;
 *  - `linkEntityId` — активности, связанные с конкретной сущностью;
 *  - `dateFrom`/`dateTo` — epoch ms.
 *
 * TODO-071: `dateFrom`/`dateTo` домен применяет предикатом ТОЛЬКО по `dueDate`
 * (`activity.service.ts#calendar`), а у встречи срока может не быть вовсе
 * (обязательны лишь start/end). Поэтому диапазон отсекает встречи без dueDate —
 * экран календаря его сознательно не шлёт, пока фильтр в домене не научится
 * покрывать startDate/endDate. Параметры оставлены здесь для точечных вызовов
 * (например «активности сущности за период»), где встречи не критичны.
 */
export async function apiGetActivitiesCalendar<T>(params?: {
    type?: string
    mine?: string
    linkEntityId?: string
    dateFrom?: number
    dateTo?: number
}) {
    const query: Record<string, unknown> = {}
    if (params?.type) query.type = params.type
    if (params?.mine) query.mine = params.mine
    if (params?.linkEntityId) query.linkEntityId = params.linkEntityId
    if (params?.dateFrom != null) query.dateFrom = params.dateFrom
    if (params?.dateTo != null) query.dateTo = params.dateTo
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/activities/calendar',
        method: 'get',
        params: withProjectId(query),
    })
}

// GetActivity требует непустой projectId в query (activity contract §GET /api/activities/:id,
// «Query: projectId (обяз.)»; пустой → 422 INVALID_ARGUMENT). Без него карточка активности
// не открывается (клик по строке ведёт на /activities/:id → error-state). Тот же паттерн, что T-009.
export async function apiGetActivity<T>(id: string, projectId?: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/activities/${id}`,
        method: 'get',
        params: withProjectId(projectId ? { projectId } : {}),
    })
}

export async function apiGetProducts<T, U extends Record<string, unknown>>(params: U) {
    return ApiService.fetchDataWithAxios<T>({ url: '/v1/products', method: 'get', params })
}

export async function apiGetProduct<T>(id: string, projectId?: string) {
    return ApiService.fetchDataWithAxios<T>({ url: `/v1/products/${id}`, method: 'get', params: projectId ? { projectId } : undefined })
}

/**
 * GET /v1/products/:id/usage — FR-PRODUCTS-230: срез связей по отделам и людям.
 * `byUser` пуст, если у наблюдателя нет полной видимости (PII-гейт домена).
 */
export async function apiGetProductUsage(
    id: string,
    params?: { projectId?: string; departmentId?: string },
) {
    return ApiService.fetchDataWithAxios<{
        dealsCount: number
        activeDealsCount: number
        ordersCount: number
        byDepartment: { departmentId: string; deals: number; orders: number }[]
        byUser: { userId: string; deals: number; orders: number }[]
    }>({
        url: `/v1/products/${id}/usage`,
        method: 'get',
        params,
    })
}

/** GET /api/products/categories — distinct category dictionary (product contract §3.9). */
export async function apiGetProductCategories(projectId?: string) {
    return ApiService.fetchDataWithAxios<string[]>({
        url: '/v1/products/categories',
        method: 'get',
        params: projectId ? { projectId } : undefined,
    })
}

/**
 * POST /api/products — create (product contract §3.3).
 *
 * Idempotency-Key обязателен на уровне вызова (CANON §5.1): домен product ведёт
 * ledger (`withIdempotency` на CreateProduct), gateway пробрасывает заголовок в
 * gRPC-метадату — но без заголовка от FE ledger мёртв, и ретрай/повторный клик
 * создаёт дубль продукта (тот же класс, что TODO-176 у контактов).
 */
export async function apiCreateProduct<T = ProductType>(
    payload: ProductWritePayload,
    params?: { projectId?: string },
    idempotencyKey?: string,
) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/products',
        method: 'post',
        params,
        data: payload,
        headers: idempotencyHeader(idempotencyKey),
    })
}

/** PUT /api/products/:id — update (product contract §3.4). */
export async function apiUpdateProduct<T = ProductType>(
    id: string,
    payload: ProductWritePayload,
    params?: { projectId?: string },
) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/products/${id}`,
        method: 'put',
        params,
        data: payload,
    })
}

/** POST /api/products/:id/archive — soft-delete with affected breakdown (product contract §3.5). */
export async function apiArchiveProduct(id: string, params?: { projectId?: string }) {
    return ApiService.fetchDataWithAxios<{ ok: boolean; affected?: ProductArchiveAffected }>({
        url: `/v1/products/${id}/archive`,
        method: 'post',
        params,
    })
}

/** POST /api/products/:id/restore — restore from archive (product contract §3.6). */
export async function apiRestoreProduct<T = ProductType>(id: string, params?: { projectId?: string }) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/products/${id}/restore`,
        method: 'post',
        params,
    })
}

/** DELETE /api/products/:id?force= — archive (force=false) or hard delete (force=true) (product contract §3.7). */
export async function apiDeleteProduct(
    id: string,
    params?: { projectId?: string; force?: boolean },
) {
    return ApiService.fetchDataWithAxios<{ ok: boolean; affected?: ProductArchiveAffected }>({
        url: `/v1/products/${id}`,
        method: 'delete',
        params,
    })
}

// ─── Mutations (contract for future API) ─────────────────────────────────────

// TODO-043: все мутации сделок/воронок передают projectId ЯВНО в query
// (withProjectId), а не только неявным заголовком x-project-id — это тот
// источник, который читают и ProjectAccessGuard, и хендлеры gateway. В тело
// projectId не кладём: BFF отклоняет несовпадающее body-значение (403).

export async function apiCreateDeal<T>(payload: Record<string, unknown>) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/deals',
        method: 'post',
        params: withProjectId({}),
        data: payload,
    })
}
export async function apiUpdateDeal<T>(id: string, payload: Record<string, unknown>) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deals/${id}`,
        method: 'put',
        params: withProjectId({}),
        data: payload,
    })
}
export async function apiDeleteDeal<T>(id: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deals/${id}`,
        method: 'delete',
        params: withProjectId({}),
    })
}

/** Close a deal as won or lost (pipe contract §9 `CloseDeal`). */
export async function apiCloseDeal<T>(
    id: string,
    payload: { result: 'won' | 'lost'; lostReasonId?: string; lostReasonComment?: string },
) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deals/${id}/close`,
        method: 'post',
        params: withProjectId({}),
        data: payload,
    })
}

export type DealOrdersSummary = {
    total: number
    byStatus: Record<string, number>
    items: Array<{
        id: string
        number: string
        status: string
        stageId: string
        assigneeName: string
        /** Display names for the deal-card widget (FR-ORDERS-440). */
        stageName: string
        typeName: string
        productName: string
        dealName: string
    }>
}

/** Orders linked to a deal — used before close-as-lost fork (FR-DEALS-120). */
export async function apiGetDealOrdersSummary(dealId: string) {
    return ApiService.fetchDataWithAxios<DealOrdersSummary>({
        url: `/v1/deals/${dealId}/orders-summary`,
        method: 'get',
        params: withProjectId({}),
    })
}

/** Reopen a closed deal to an active stage (pipe contract §10 `ReopenDeal`). */
export async function apiReopenDeal<T>(
    id: string,
    payload: { reason: string; targetStageId: string },
) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deals/${id}/reopen`,
        method: 'post',
        params: withProjectId({}),
        data: payload,
    })
}

/** Restore a soft-deleted deal (pipe contract §16 `RestoreDeal`). */
export async function apiRestoreDeal<T>(id: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deals/${id}/restore`,
        method: 'post',
        params: withProjectId({}),
    })
}

/** List soft-deleted deals — корзина (pipe contract §15 `ListTrashed`/`ListDeals(deleted=true)`). */
export async function apiGetTrashedDeals<T>(params?: { projectId?: string; pageIndex?: number; pageSize?: number }) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/deals',
        method: 'get',
        params: { ...(params || {}), deleted: true },
    })
}

/** Deals dashboard aggregates (pipe contract §5 `GetDashboard`, FR-MDEAL-40). */
export async function apiGetDealDashboard<T>(params?: { projectId?: string; from?: number; to?: number; pipelineId?: string }) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/deals/dashboard',
        method: 'get',
        params,
    })
}

/** FR-PSET-055 — preview module disable impact before confirmation. */
export async function apiGetModuleDisableImpact(projectId: string, moduleId: string) {
    return ApiService.fetchDataWithAxios<{
        dependentEnabledModules: Array<{ id: string; name: string }>
        unfinishedRecords: number
        stoppedAutomations: Array<{ id: string; name: string }>
        webhookDlqSuspended?: boolean
    }>({
        url: `/v1/projects/${projectId}/modules/${moduleId}/disable-impact`,
        method: 'get',
    })
}

/** FR-PSET-050 — preview hard-dependency cascade before enabling a module. */
export async function apiGetModuleEnableImpact(projectId: string, moduleId: string) {
    return ApiService.fetchDataWithAxios<{
        cascadeModules: Array<{ id: string; name: string }>
    }>({
        url: `/v1/projects/${projectId}/modules/${moduleId}/enable-impact`,
        method: 'get',
    })
}

/** FR-PSET-340 — (re)apply onboarding template provisioning for an existing project. */
export async function apiApplyProjectTemplate(
    projectId: string,
    templateId?: string,
) {
    return ApiService.fetchDataWithAxios<{
        id: string
        name?: string
        template_id?: string
        templateId?: string
    }>({
        url: `/v1/projects/${projectId}/apply-template`,
        method: 'post',
        data: { templateId: templateId ?? '' },
    })
}

/** @deprecated Use apiGetModuleDisableImpact — kept for legacy deals-only callers. */
export async function apiGetDealsDisableCascadePreview(projectId: string) {
    return ApiService.fetchDataWithAxios<{
        openDealCount: number | null
        cascadeModules: Array<{ id: string; name: string }>
    }>({
        url: '/v1/deals/disable-cascade-preview',
        method: 'get',
        params: { projectId },
    })
}

/** Drift diff of a linked contact/company snapshot (pipe contract §4 `GetDealDrift`). */
export async function apiGetDealDrift<T>(id: string, projectId?: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deals/${id}/drift`,
        method: 'get',
        params: projectId ? { projectId } : undefined,
    })
}

/** Accept drift: refresh snapshot, clear driftFlag (pipe contract §13 `AcceptContactDrift`). */
export async function apiAcceptDealDrift<T>(id: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deals/${id}/accept-drift`,
        method: 'post',
        params: withProjectId({}),
    })
}

/** FR-DEALS-290: mass accept drift for selected deals. */
export async function apiBulkAcceptDealDrift<T>(payload: { dealIds: string[]; target?: string }) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/deals/bulk/accept-drift',
        method: 'post',
        params: withProjectId({}),
        data: payload,
    })
}

/** Qualify a light deal → contact/company with dedup (gateway composite, pipe contract §4 / FR-MDEAL-2..6). */
export async function apiQualifyDeal<T>(
    id: string,
    payload: {
        target: 'contact' | 'company'
        /** Link an existing entity. */
        contactId?: string
        companyId?: string
        /** Or create a new one from these fields. */
        create?: { firstName?: string; lastName?: string; phone?: string; email?: string; name?: string }
    },
) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deals/${id}/qualify`,
        method: 'post',
        params: withProjectId({}),
        data: payload,
    })
}

/** Link an existing contact to a deal (pipe contract §11 `LinkContact`). */
export async function apiLinkDealContact<T>(id: string, contactId: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deals/${id}/link-contact`,
        method: 'post',
        params: withProjectId({}),
        data: { contactId },
    })
}

/** Link an existing company to a deal (pipe contract §12 `LinkCompany`). */
export async function apiLinkDealCompany<T>(id: string, companyId: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deals/${id}/link-company`,
        method: 'post',
        params: withProjectId({}),
        data: { companyId },
    })
}

/** Bulk reassign / move / change pipeline (pipe contract §14 `BulkUpdateDeals`). */
export async function apiBulkUpdateDeals<T>(payload: {
    dealIds: string[]
    change:
        | { assigneeId: string }
        | { departmentId: string }
        | { stageId: string }
        | { pipelineId: string }
}) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/deals/bulk',
        method: 'post',
        params: withProjectId({}),
        data: payload,
    })
}

/** Lost-reason dictionary (pipe contract §23 `ListLostReasons`). */
export async function apiGetLostReasons<T>(activeOnly = true) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/lost-reasons',
        method: 'get',
        params: { activeOnly },
    })
}

/** Pipeline CRUD (pipe contract §18-20). */
export async function apiGetPipeline<T>(id: string) {
    return ApiService.fetchDataWithAxios<T>({ url: `/v1/pipelines/${id}`, method: 'get' })
}
export async function apiCreatePipeline<T>(payload: Record<string, unknown>) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/pipelines',
        method: 'post',
        params: withProjectId({}),
        data: payload,
    })
}
export async function apiUpdatePipeline<T>(id: string, payload: Record<string, unknown>) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/pipelines/${id}`,
        method: 'put',
        params: withProjectId({}),
        data: payload,
    })
}
export async function apiDeletePipeline<T>(id: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/pipelines/${id}`,
        method: 'delete',
        params: withProjectId({}),
    })
}

/**
 * Companies write-path. Gateway читает проект ТОЛЬКО из query (`@Query('projectId')`
 * в v1-data-bff.controller — createCompany/updateCompany/deleteCompany), заголовок
 * `X-Project-Id` для этих ручек в handler не попадает: без явного query-параметра
 * в gRPC уходил `project_id: undefined` → домен писал/искал запись вне проекта.
 * `withProjectId` добирает текущий проект из стора (как у pipelines/orders).
 */
export async function apiCreateCompany<T>(
    payload: Record<string, unknown>,
    params?: { projectId?: string },
) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/companies',
        method: 'post',
        params: withProjectId(params ?? {}),
        data: payload,
    })
}
export async function apiUpdateCompany<T>(
    id: string,
    payload: Record<string, unknown>,
    params?: { projectId?: string },
) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/companies/${id}`,
        method: 'put',
        params: withProjectId(params ?? {}),
        data: payload,
    })
}
export async function apiDeleteCompany<T>(id: string, params?: { projectId?: string }) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/companies/${id}`,
        method: 'delete',
        params: withProjectId(params ?? {}),
    })
}

export async function apiCreateOrder<T>(payload: Record<string, unknown>) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/orders',
        method: 'post',
        params: withProjectId({}),
        data: payload,
    })
}

/** POST /v1/orders/batch — пакетное создание продаж из сделки (FR-ORDERS-135). */
export async function apiCreateOrdersBatch<T>(payload: Record<string, unknown>) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/orders/batch',
        method: 'post',
        params: withProjectId({}),
        data: payload,
    })
}
export async function apiUpdateOrder<T>(id: string, payload: Record<string, unknown>) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/orders/${id}`,
        method: 'put',
        params: withProjectId({}),
        data: payload,
    })
}

export async function apiCreateActivity<T>(
    payload: Record<string, unknown>,
    idempotencyKey?: string,
) {
    // NFR-ACT-100: gateway forwards `Idempotency-Key` into gRPC metadata; the
    // activity domain now dedups create. Without this header a client retry
    // after a timeout creates a duplicate row.
    const { projectId } = payload
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/activities',
        method: 'post',
        params: withProjectId(projectId ? { projectId } : {}),
        data: payload,
        headers: idempotencyHeader(idempotencyKey),
    })
}
export async function apiUpdateActivity<T>(id: string, payload: Record<string, unknown>) {
    // TODO-028: gateway экспонирует только PATCH /v1/activities/:id и читает
    // projectId из query — PUT отвечал 404, а projectId в теле игнорировался
    // (теперь BFF отклоняет несовпадающий body.projectId). Поэтому: PATCH +
    // projectId в params, из тела он вынимается.
    const { projectId, ...data } = payload
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/activities/${id}`,
        method: 'patch',
        params: withProjectId(projectId ? { projectId } : {}),
        data,
    })
}

/** Soft-delete an activity (activity contract §3 `DeleteActivity`, право `activities:delete`/`manage`). */
export async function apiDeleteActivity<T>(
    id: string,
    projectId?: string,
    idempotencyKey?: string,
) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/activities/${id}`,
        method: 'delete',
        params: projectId ? { projectId } : undefined,
        headers: idempotencyHeader(idempotencyKey),
    })
}

/** Restore a soft-deleted activity (activity contract §3 `RestoreActivity`). */
export async function apiRestoreActivity<T>(
    id: string,
    projectId?: string,
    idempotencyKey?: string,
) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/activities/${id}/restore`,
        method: 'post',
        params: projectId ? { projectId } : undefined,
        headers: idempotencyHeader(idempotencyKey),
    })
}

/** Complete an activity with a result (activity contract §3 `CompleteActivity`, FR-MACT-11). */
export async function apiCompleteActivity<T>(
    id: string,
    payload: { result?: string; actualDuration?: number; completedAt?: number },
    projectId?: string,
    idempotencyKey?: string,
) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/activities/${id}/complete`,
        method: 'post',
        data: payload,
        params: projectId ? { projectId } : undefined,
        headers: idempotencyHeader(idempotencyKey),
    })
}

/** Overdue badge counter (activity contract §3 `CountOverdue`, FR-MACT-9). */
export async function apiGetOverdueCount<T>(projectId?: string, assigneeId?: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/activities/overdue-count',
        method: 'get',
        params: { ...(projectId ? { projectId } : {}), ...(assigneeId ? { assigneeId } : {}) },
    })
}

/** Bulk complete/delete selected activities (activity contract §3 `POST /api/activities/bulk`, FR-MACT-30). */
export async function apiBulkActivities<T>(
    payload: {
        action: 'complete' | 'delete'
        ids: string[]
        result?: string
        projectId?: string
    },
    idempotencyKey?: string,
) {
    // projectId идёт в query, чтобы ручка и ProjectAccessGuard видели его независимо
    // от тела; в body остаётся для обратной совместимости.
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/activities/bulk',
        method: 'post',
        data: payload,
        params: payload.projectId ? { projectId: payload.projectId } : undefined,
        headers: idempotencyHeader(idempotencyKey),
    })
}

export async function apiMoveDealStage<T>(dealId: string, stageId: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/deals/${dealId}/stage`,
        method: 'put',
        params: withProjectId({}),
        data: { stageId },
    })
}
export async function apiMoveOrderStage<T>(orderId: string, stageId: string, acceptDrift?: boolean) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/orders/${orderId}/stage`,
        method: 'put',
        params: withProjectId({}),
        data: { stageId, ...(acceptDrift !== undefined ? { acceptDrift } : {}) },
    })
}

// ─── Orders TO-BE lifecycle (orders contract §3.12/§3.15/§3.16/§3.17) ─────────
/** POST /orders/:id/cancel (§3.12 CancelOrder, orders:write + владение). */
export async function apiCancelOrder<T>(id: string, reason?: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/orders/${id}/cancel`,
        method: 'post',
        params: withProjectId({}),
        data: reason ? { reason } : {},
    })
}
/** POST /orders/:id/accept-drift (§3.15 AcceptDrift, orders:write + владение/Manager+). */
export async function apiAcceptOrderDrift<T>(id: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/orders/${id}/accept-drift`,
        method: 'post',
        params: withProjectId({}),
    })
}
/** POST /orders/:id/retry (§3.16 RetryFinalAction, orders.integration:invoke + Manager+). */
export async function apiRetryOrderFinalAction<T>(id: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/orders/${id}/retry`,
        method: 'post',
        params: withProjectId({}),
    })
}
/** POST /orders/reassign (§3.17 ReassignOrders, orders:write + Manager+). */
export async function apiReassignOrders<T>(payload: {
    fromAssigneeId: string
    toAssigneeId: string
    filter?: { typeId?: string; status?: string; stageId?: string }
}) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/orders/reassign',
        method: 'post',
        params: withProjectId({}),
        data: payload,
    })
}
/** GET /orders/:id/drift (§3.14 CheckDrift). */
export async function apiCheckOrderDrift<T>(id: string) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/orders/${id}/drift`,
        method: 'get',
        params: withProjectId({}),
    })
}

export async function apiImportCompanies<T>(payload: {
    file: File
    mapping?: Record<string, string>
    dedupMode?: 'skip' | 'update' | 'create'
    projectId?: string
}) {
    const formData = new FormData()
    formData.append('file', payload.file)
    if (payload.mapping) {
        formData.append('mappingJson', JSON.stringify(payload.mapping))
    }
    if (payload.dedupMode) {
        formData.append('dedupMode', payload.dedupMode)
    }
    return ApiService.fetchDataWithAxios<T, FormData>({
        url: '/v1/companies/import',
        method: 'post',
        data: formData,
        params: payload.projectId ? { projectId: payload.projectId } : undefined,
    })
}

// ─── Companies: card / history / trash / dedup / owner (contract docs/tz/contracts/company.md) ──

/**
 * Дедуп-подсказка по ИНН/домену/названию (не блокирует). Контракт §3.12.
 *
 * TODO-362: формы заполняют не «домен», а `email`/`website` — домен выводит домен
 * сам (deriveDomain), но только из тех полей, что доехали. Без проброса подсказка
 * по e-mail/сайту молча не срабатывала.
 *
 * Ответ: `{ candidates: [{ id, name, inn, matchReason, deleted }] }`. `deleted:true`
 * — кандидат лежит в КОРЗИНЕ. Ключ идентичности он при этом НЕ держит: soft-delete
 * снимает `identityHash` (`company/src/companies/companies.service.ts` remove()),
 * так что 409 на сохранении не будет. Показываем его по другой причине: иначе
 * пользователь заводит третью копию компании вместо того, чтобы восстановить свою
 * же запись из корзины. «Открыть» и тем более взять такого кандидата в слияние
 * нельзя (merge читает только живые записи) — UI обязан пометить его и предложить
 * восстановление.
 */
export async function apiFindCompanyDuplicates<T>(params: {
    projectId: string
    inn?: string
    name?: string
    domain?: string
    email?: string
    website?: string
}) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/companies/duplicates',
        method: 'get',
        params,
    })
}

/** История изменений компании (audit). Контракт §3.5. */
export async function apiGetCompanyHistory<T>(
    id: string,
    params: { projectId: string; limit?: number; cursor?: string },
) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/companies/${id}/history`,
        method: 'get',
        params,
    })
}

/**
 * Композит карточки компании — GET /v1/companies/:id/card (контракт §3.3).
 *
 * Один запрос вместо четырёх списков «по 1000 с фильтром в памяти»: gateway
 * собирает связанные сущности у доменов-доноров уже отфильтрованными по компании
 * (deals/orders — company_id, activities — link_entity_type=company, contacts —
 * обратный M2M), каждый донор fail-soft (упавший блок приходит пустым, а не рушит
 * карточку). `stats` — честные счётчики домена (total), а не длина отданной страницы.
 */
export async function apiGetCompanyCard<T>(id: string, params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/companies/${id}/card`,
        method: 'get',
        params,
    })
}

/**
 * Результат серверной выгрузки компаний. `truncated` — gateway упёрся в потолок
 * (10 000 строк) и файл НЕПОЛНЫЙ; молчать об этом нельзя.
 */
export type CompaniesExportResult = {
    blob: Blob
    filename: string
    /** X-Export-Count: сколько строк реально попало в файл. */
    count?: number
    /** X-Export-Truncated: выгрузка обрезана потолком. */
    truncated: boolean
}

/**
 * Выгрузка компаний — GET /v1/companies/export (TODO-158, FR-COMPANIES-240,
 * контракт §3.18).
 *
 * Почему сервер, а не CSV на клиенте: клиентская сборка видит только текущую
 * СТРАНИЦУ таблицы, поэтому «экспорт» отдавал 10-25 строк вместо отфильтрованного
 * набора. Gateway листает домен страницами по 100 (домен режет page_size до 100),
 * применяя ту же visibility/ABAC, что и список, и отдаёт готовый файл.
 *
 * Параметры — ровно те же, что у `apiGetCompanies`, включая сортировку: выгрузка
 * обязана совпадать с видимым набором и по составу, и по порядку.
 */
export async function apiExportCompanies(params: {
    projectId: string
    format?: 'csv' | 'json'
    query?: string
    filterStatus?: string
    filterOwnerId?: string
    filterDepartmentId?: string
    filterIndustry?: string
    filterRegion?: string
    filterTags?: string
    sortBy?: string
    sortDir?: string
}): Promise<CompaniesExportResult> {
    const res = await AxiosBase.request<Blob>({
        url: '/v1/companies/export',
        method: 'get',
        params,
        responseType: 'blob',
    })
    const header = (name: string): string | undefined => {
        const raw = (res.headers as unknown as Record<string, unknown>)?.[name]
        return raw == null ? undefined : String(raw)
    }
    const count = Number(header('x-export-count'))
    const filename = /filename="?([^";]+)"?/i.exec(header('content-disposition') ?? '')?.[1]
    return {
        blob: res.data,
        filename:
            filename ??
            `companies-${new Date().toISOString().slice(0, 10)}.${params.format ?? 'csv'}`,
        count: Number.isFinite(count) ? count : undefined,
        // Заголовок ставится только при усечении; он открыт наружу через CORS
        // exposedHeaders на gateway, иначе браузер до него не допускает.
        truncated: (header('x-export-truncated') ?? '').toLowerCase() === 'true',
    }
}

/** Корзина (soft-deleted компании проекта). Контракт §3.10. */
export async function apiGetCompaniesTrash<T, U extends Record<string, unknown>>(params: U) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/companies/trash',
        method: 'get',
        params,
    })
}

/** Восстановить из корзины (опц. стратегия разрешения коллизии). Контракт §3.11. */
export async function apiRestoreCompany<T>(
    id: string,
    payload?: { strategy?: 'merge' | 'clear_key' | 'as_new' },
    params?: { projectId?: string },
) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/companies/${id}/restore`,
        method: 'post',
        data: payload ?? {},
        params,
    })
}

/** Переназначить владельца компании. Контракт §3.8. */
export async function apiReassignCompanyOwner<T>(
    id: string,
    payload: { ownerId: string; departmentId?: string },
    params?: { projectId?: string },
) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/companies/${id}/owner`,
        method: 'patch',
        data: payload,
        params,
    })
}

/** Удалить компанию навсегда (hard-delete из корзины). Контракт §3.9/§9.7 (purge). */
export async function apiPurgeCompany<T>(id: string, params?: { projectId?: string }) {
    return ApiService.fetchDataWithAxios<T>({
        url: `/v1/companies/${id}`,
        method: 'delete',
        params: { ...(params ?? {}), force: true },
    })
}

/** Превью merge дублей (dry-run, конфликты полей + счётчики связей). Контракт §3.14. */
export type CompanyMergePreview = {
    fieldConflicts: { field: string; master?: string; loser?: string }[]
    relations: {
        contacts?: number
        deals?: number
        orders?: number
        activities?: number
        documents?: number
    }
}
export async function apiPreviewCompanyMerge<T = CompanyMergePreview>(
    payload: { masterId: string; loserId: string },
    params?: { projectId?: string },
) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/companies/merge/preview',
        method: 'post',
        data: payload,
        params,
    })
}

/** Слить loser в master (идемпотентно per loser → merge_pending). Контракт §3.15. */
export async function apiMergeCompanies<T>(
    payload: {
        masterId: string
        loserId: string
        fieldDecisions?: Record<string, 'master' | 'loser'>
    },
    params?: { projectId?: string },
) {
    return ApiService.fetchDataWithAxios<T>({
        url: '/v1/companies/merge',
        method: 'post',
        data: payload,
        params,
    })
}

/* ── Project integrations & API-keys (F3-integ-be contract, project-scoped) ──
 *
 * Minimal v1 contract agreed on the board (F3-integ-be DoD):
 *   /api/v1/projects/:projectId/integrations*  — CRUD config of REST/Kafka/DB
 *       integrations. Secrets are write-only: never returned in list/get
 *       (IDOR pattern W0-control-idor — secret only echoed once on create where
 *       applicable, otherwise stored opaque). Guard: ProjectAccessGuard,
 *       `project:manage`.
 *   /api/v1/projects/:projectId/api-keys*      — issue / list (masked) / revoke
 *       project API keys. Full key value returned ONLY on POST (issue); list
 *       returns masked prefix only.
 *
 * FE wired against the contracted shape (same approach as members/lifecycle):
 * works end-to-end once F3-integ-be ships the endpoints; until then the tab
 * surfaces loading/error+retry states instead of mock data.
 */

export type IntegrationType = 'rest' | 'kafka' | 'db'

/** Connection config — structured per type. Secrets are write-only. */
export type IntegrationConfig = {
    // rest
    endpoint?: string
    httpMethod?: string
    /**
     * REST webhook subscription filter (BX-INTEG-3/6): routing-keys of project
     * events this integration should receive, or `['*']` for all. The control
     * delivery consumer matches events against this list; absent/empty = nothing
     * subscribed. The endpoint is validated anti-SSRF at write time.
     */
    events?: string[]
    // kafka
    brokers?: string
    topic?: string
    // db
    driver?: string
    host?: string
    port?: number
    database?: string
    username?: string
}

/** Integration as returned by list/get — NO secret fields. */
export type ProjectIntegration = {
    id: string
    type: IntegrationType
    name: string
    status: 'active' | 'inactive' | 'error'
    config: IntegrationConfig
    createdAt?: string
    updatedAt?: string
}

export type CreateIntegrationPayload = {
    type: IntegrationType
    name: string
    config: IntegrationConfig
    /** Write-only secret (token / password). Not echoed back in list/get. */
    secret?: string
    status?: 'active' | 'inactive'
}

export async function apiGetIntegrations(projectId: string) {
    return ApiService.fetchDataWithAxios<{ list: ProjectIntegration[] }>({
        url: `/v1/projects/${projectId}/integrations`,
        method: 'get',
    })
}

export async function apiCreateIntegration(
    projectId: string,
    payload: CreateIntegrationPayload,
) {
    return ApiService.fetchDataWithAxios<ProjectIntegration>({
        url: `/v1/projects/${projectId}/integrations`,
        method: 'post',
        data: payload,
    })
}

export async function apiUpdateIntegration(
    projectId: string,
    integrationId: string,
    payload: Partial<CreateIntegrationPayload>,
) {
    return ApiService.fetchDataWithAxios<ProjectIntegration>({
        url: `/v1/projects/${projectId}/integrations/${integrationId}`,
        method: 'patch',
        data: payload,
    })
}

export async function apiDeleteIntegration(
    projectId: string,
    integrationId: string,
) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/projects/${projectId}/integrations/${integrationId}`,
        method: 'delete',
    })
}

/** Delivery status as recorded by the control webhook-delivery consumer. */
export type WebhookDeliveryStatus = 'success' | 'dead_lettered'

/**
 * One outbound webhook attempt (BX-INTEG-5 "Deliveries" panel). Mirrors the BFF
 * shape from `GET /v1/projects/:id/integrations/:integrationId/deliveries`.
 * `httpCode` is null when the target returned no HTTP response (network
 * error / timeout / blocked at send-time by the anti-SSRF re-check).
 */
export type WebhookDelivery = {
    id: string
    projectId: string
    integrationId: string
    eventType: string
    url: string
    httpCode: number | null
    status: WebhookDeliveryStatus
    attempts: number
    error: string
    createdAt?: string
}

/**
 * List the most recent webhook deliveries for a REST integration (manage-gated).
 * `limit` is optional; the BFF caps/defaults it server-side.
 */
export async function apiGetIntegrationDeliveries(
    projectId: string,
    integrationId: string,
    limit?: number,
) {
    return ApiService.fetchDataWithAxios<{ list: WebhookDelivery[] }>({
        url: `/v1/projects/${projectId}/integrations/${integrationId}/deliveries`,
        method: 'get',
        params: limit ? { limit } : undefined,
    })
}

/** API-key as returned by list — masked, NO full secret. */
export type ProjectApiKey = {
    id: string
    name: string
    /** Masked display value, e.g. `ff_live_••••••••c3d4`. */
    maskedKey: string
    createdAt?: string
    lastUsedAt?: string | null
}

/** Issue response — `key` (full value) present ONLY here, shown once. */
export type IssuedApiKey = ProjectApiKey & {
    /** Full plaintext key — returned once on issue, never again. */
    key: string
}

export async function apiGetApiKeys(projectId: string) {
    return ApiService.fetchDataWithAxios<{ list: ProjectApiKey[] }>({
        url: `/v1/projects/${projectId}/api-keys`,
        method: 'get',
    })
}

export async function apiIssueApiKey(
    projectId: string,
    payload: { name: string },
) {
    return ApiService.fetchDataWithAxios<IssuedApiKey>({
        url: `/v1/projects/${projectId}/api-keys`,
        method: 'post',
        data: payload,
    })
}

export async function apiRevokeApiKey(projectId: string, keyId: string) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/projects/${projectId}/api-keys/${keyId}`,
        method: 'delete',
    })
}

/* ---------------------------------------------------------------------------
 * organization-module (C5) — greenfield TO-BE: seats, department-bindings,
 * offboard, reorg-preview, deactivate/reactivate.
 *
 * Контракт FE/экранов: docs/ux/screens/organization/SCREENS.md (SCR-MORG-*).
 * Эндпоинты помечены TODO(be) там, где ещё не в API-контракте control —
 * зависимость на C5-org-be. До готовности FE деградирует (empty/disabled).
 * ------------------------------------------------------------------------- */

// ─── SCR-MORG-DEPT-BINDINGS — привязка отдела к проектам, FR-MORG-7/8/9/10 ────

export type DepartmentBinding = {
    id: string
    departmentId: string
    projectId: string
    projectName?: string
    /** ⚠️ ПРОЕКТНАЯ роль по умолчанию (не орг-роль!), FR-MORG-2. */
    defaultRole: string
    scope: 'self'
    status: 'active' | 'paused' | string
    /** source=manual строки не материализуются биндингом. */
    source?: 'binding' | 'manual' | string
    createdAt?: string | number
}

/** GET department bindings (FR-MORG-7). Право `bindings:read`. */
export async function apiGetDepartmentBindings(deptId: string) {
    return ApiService.fetchDataWithAxios<DepartmentBinding[]>({
        url: `/v1/system/departments/${deptId}/bindings`,
        method: 'get',
    })
}

export async function apiCreateDepartmentBinding(
    deptId: string,
    payload: { projectId: string; defaultRole: string; scope?: 'self' },
) {
    return ApiService.fetchDataWithAxios<DepartmentBinding>({
        url: `/v1/system/departments/${deptId}/bindings`,
        method: 'post',
        data: { scope: 'self', ...payload },
    })
}

export async function apiUpdateDepartmentBinding(
    deptId: string,
    bindingId: string,
    payload: { defaultRole?: string; scope?: 'self'; status?: string },
) {
    return ApiService.fetchDataWithAxios<DepartmentBinding>({
        url: `/v1/system/departments/${deptId}/bindings/${bindingId}`,
        method: 'patch',
        data: payload,
    })
}

export async function apiDeleteDepartmentBinding(
    deptId: string,
    bindingId: string,
) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/system/departments/${deptId}/bindings/${bindingId}`,
        method: 'delete',
    })
}

// ─── SCR-MORG-REORG-PREVIEW — dry-run последствий, FR-MORG-21/US-MORG-21 ──────

export type ReorgImpactKind =
    | 'department_delete'
    | 'department_reparent'
    | 'binding_expand'
    | 'employee_offboard'
    | 'org_deactivate'
    | string

export type ReorgAffectedItem = {
    userId: string
    name?: string
    projectId?: string
    projectName?: string
    /** Направление эффекта на доступ. */
    effect: 'gain' | 'lose' | 'change' | string
}

export type ReorgPreview = {
    kind: ReorgImpactKind
    affectedCount: number
    gainCount: number
    loseCount: number
    affected: ReorgAffectedItem[]
    /** Хеш состояния, по которому считалось превью — для drift-гейта (ST-25). */
    computedFrom?: string
    partial?: boolean
}

/**
 * POST reorg preview (dry-run). FR-MORG-21.
 * `target` — id отдела/биндинга/орг; `payload` — параметры операции.
 */
export async function apiReorgPreview(
    body: {
        kind: ReorgImpactKind
        departmentId?: string
        bindingId?: string
        strategy?: string
        newParentId?: string | null
        userId?: string
        defaultRole?: string
    },
) {
    return ApiService.fetchDataWithAxios<ReorgPreview>({
        url: '/v1/system/reorg/preview',
        method: 'post',
        data: body,
    })
}

// ─── SCR-MORG-EMPLOYEE-OFFBOARD — мастер увольнения, FR-MORG-19/25/27/28 ──────

export type OffboardPreview = {
    userId: string
    name?: string
    /** Проекты, доступ к которым теряется (FR-MORG-25). */
    projects: { projectId: string; projectName?: string }[]
    /** Записи на переназначение per-project (FR-MORG-28). */
    reassign: { projectId: string; projectName?: string; recordCount: number }[]
    /** Владельца нельзя уволить (cannot_remove_owner). */
    isOwner: boolean
    partial?: boolean
}

/** GET offboard preview (последствия увольнения). Право `employees:delete`. */
export async function apiGetOffboardPreview(userId: string) {
    return ApiService.fetchDataWithAxios<OffboardPreview>({
        url: `/v1/system/employees/${userId}/offboard/preview`,
        method: 'get',
    })
}

export type OffboardResult = {
    ok: boolean
    /** Переназначено сразу. */
    reassigned: number
    /** Требует ручного переназначения (нет живого получателя) — FR-MORG-28. */
    unassigned: number
    /** Каскад идёт по событию — eventual (ST-26/28). */
    processing?: boolean
}

/**
 * POST offboard (увольнение с каскадом §3.4). FR-MORG-27 / BX-OFFB-2.
 * `reassignToUserId` — активный сотрудник, которому переназначаются записи
 * уволенного (пусто → бэк берёт действующего админа). Переназначение eventual.
 */
export async function apiOffboardEmployee(
    userId: string,
    reassignToUserId?: string,
) {
    return ApiService.fetchDataWithAxios<OffboardResult>({
        url: `/v1/system/employees/${userId}/offboard`,
        method: 'post',
        data: { reassignToUserId: reassignToUserId ?? '' },
    })
}

// ─── SCR-MORG-DELETE — деактивация/реактивация орг, FR-MORG-43/OQ-MORG-5 ──────

export type OrgDeactivatePreview = {
    projectCount: number
    employeeCount: number
}

export async function apiGetDeactivatePreview() {
    return ApiService.fetchDataWithAxios<OrgDeactivatePreview>({
        url: '/v1/system/deactivate/preview',
        method: 'get',
    })
}

export async function apiDeactivateOrganization() {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: '/v1/system/deactivate',
        method: 'post',
    })
}

export async function apiReactivateOrganization() {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: '/v1/system/reactivate',
        method: 'post',
    })
}
