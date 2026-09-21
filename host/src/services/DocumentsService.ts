import ApiService from './ApiService'

/**
 * Documents-domain API client (contract docs/tz/contracts/documents.md).
 *
 * Все запросы идут на gateway REST. base = `appConfig.apiPrefix` (`/api`), а версия
 * домена `/v1` — часть пути каждой ручки (как chat/projects/permissions), поэтому
 * клиент НЕ зависит от build-time `VITE_API_PREFIX` ремоута: даже при standalone-сборке
 * documents-remote запросы уходят на URI-versioned `/api/v1/documents…` (домен
 * documents на gateway версионирован). `projectId` передаётся query-параметром
 * (gateway также читает заголовок X-Project-Id) — единая конвенция фронта.
 * Небезопасные мутации несут `Idempotency-Key` (генерируется на клиенте).
 */

// ─── Типы (зеркало схем контракта) ──────────────────────────────────────────

export type DocContextType = 'order' | 'deal' | 'contact' | 'company'
export type DocContextTypeWithNone = DocContextType | 'none'
export type TemplateStatus = 'draft' | 'published' | 'archived'
export type GeneratedVia = 'manual' | 'regenerate' | 'automation' | 'upload'

export interface TemplateSummary {
    id: string
    name: string
    contextType: DocContextType
    orderTypeId?: string | null
    status: TemplateStatus
    currentRevision: number | null
    draftRevision: number | null
    mimeType: string
    createdBy: string
    createdAt: number
    updatedAt: number
    /** TO-BE счётчик созданных документов (eventual, может отсутствовать). */
    documentsCreated?: number
}

export interface TemplateRevision {
    version: number
    declaredVariables: string[]
    fileHash: string
    engine: string
    publishedAt: number | null
    createdBy: string
    createdAt: number
}

export interface TemplateDetail extends TemplateSummary {
    projectId: string
    revision: TemplateRevision
}

export interface VariableDef {
    key: string
    label: string
    group: string
    required: boolean
    source: 'order' | 'deal' | 'contact' | 'company' | 'global'
}

export interface DocumentGroup {
    groupId: string
    projectId: string
    contextType: DocContextTypeWithNone
    contextRecordId?: string | null
    templateId?: string | null
    name: string
    ownerId: string
    ownerDepartmentId?: string | null
    currentVersion: number
    generatedVia: GeneratedVia
    driftStale: boolean
    createdAt: number
    updatedAt: number
    /** Current-version snapshot for list filters (optional). */
    emptyRequiredVars?: string[]
    mimeType?: string
}

export interface DocumentVersion {
    versionId: string
    version: number
    mimeType: string
    sizeBytes: number
    fileHash: string
    templateId?: string | null
    templateRevision?: number | null
    emptyRequiredVars: string[]
    generatedBy: string
    generatedVia: GeneratedVia
    triggerEventId?: string | null
    createdAt: number
}

export interface DriftValueChange {
    key: string
    oldValue: string
    newValue: string
}

export interface DriftStatus {
    hasDrift: boolean
    changedKeys: string[]
    changedValues?: DriftValueChange[]
    sourceAvailable: boolean
}

export interface DocumentDetailResponse {
    group: DocumentGroup
    versions: DocumentVersion[]
    drift: DriftStatus
}

export interface GenerateWarnings {
    emptyRequired: string[]
    drift: { changedKeys: string[] } | null
}

export interface GenerateResponse {
    group: DocumentGroup
    version: DocumentVersion
    warnings: GenerateWarnings
}

// ─── Утилита идемпотентности ─────────────────────────────────────────────────

function idempotencyKey(): string {
    try {
        return crypto.randomUUID()
    } catch {
        return `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`
    }
}

// ─── Шаблоны ────────────────────────────────────────────────────────────────

export interface ListTemplatesParams {
    projectId: string
    contextType?: DocContextType
    recordId?: string
    status?: TemplateStatus
}

/** GET /api/v1/document-templates (§3.1). */
export async function apiListTemplates(params: ListTemplatesParams) {
    return ApiService.fetchDataWithAxios<{ items: TemplateSummary[] }>({
        url: '/v1/document-templates',
        method: 'get',
        params,
    })
}

/** GET /api/v1/document-templates/:id (§3.2). */
export async function apiGetTemplate(
    id: string,
    params: { projectId: string; version?: number },
) {
    return ApiService.fetchDataWithAxios<TemplateDetail>({
        url: `/v1/document-templates/${id}`,
        method: 'get',
        params,
    })
}

/** GET /api/v1/document-templates/:id/revisions (§3.7). */
export async function apiListTemplateRevisions(
    id: string,
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<{ items: TemplateRevision[] }>({
        url: `/v1/document-templates/${id}/revisions`,
        method: 'get',
        params,
    })
}

/**
 * GET /api/v1/document-templates/:id/download (§3.16 / G4).
 * Отдаёт короткоживущий presigned URL на исходный DOCX ревизии. `version` — опц.
 * (по умолчанию текущая опубликованная, иначе черновая). Вызывающий открывает `url`.
 */
export async function apiDownloadTemplate(
    id: string,
    params: { projectId: string; version?: number },
) {
    return ApiService.fetchDataWithAxios<{ url: string; expiresAt: number }>({
        url: `/v1/document-templates/${id}/download`,
        method: 'get',
        params,
    })
}

/** POST /api/v1/document-templates (§3.3) — multipart создание шаблона. */
export async function apiCreateTemplate(
    form: FormData,
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<TemplateSummary, FormData>({
        url: '/v1/document-templates',
        method: 'post',
        params,
        data: form,
        headers: {
            'Content-Type': 'multipart/form-data',
            'Idempotency-Key': idempotencyKey(),
        },
    })
}

/** PUT /api/v1/document-templates/:id (§3.4) — новая редакция / правка метаданных. */
export async function apiUpdateTemplate(
    id: string,
    form: FormData,
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<TemplateSummary, FormData>({
        url: `/v1/document-templates/${id}`,
        method: 'put',
        params,
        data: form,
        headers: {
            'Content-Type': 'multipart/form-data',
            'Idempotency-Key': idempotencyKey(),
        },
    })
}

/** POST /api/v1/document-templates/:id/publish (§3.5). */
export async function apiPublishTemplate(
    id: string,
    params: { projectId: string },
    version?: number,
) {
    return ApiService.fetchDataWithAxios<TemplateSummary>({
        url: `/v1/document-templates/${id}/publish`,
        method: 'post',
        params,
        data: version != null ? { version } : {},
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/** POST /api/v1/document-templates/:id/archive (§3.6). */
export async function apiArchiveTemplate(id: string, params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<TemplateSummary>({
        url: `/v1/document-templates/${id}/archive`,
        method: 'post',
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/** DELETE /api/v1/document-templates/:id (§3.8) — soft. */
export async function apiDeleteTemplate(id: string, params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/document-templates/${id}`,
        method: 'delete',
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/** GET /api/v1/document-variables (§3.9) — каталог переменных по контексту. */
export async function apiListDocumentVariables(params: {
    projectId: string
    contextType: DocContextType
    /** Тип продажи — подмешивает динамические `order.field.*` (FR-DOCS-310). */
    orderTypeId?: string
    recordId?: string
}) {
    return ApiService.fetchDataWithAxios<{ items: VariableDef[] }>({
        url: '/v1/document-variables',
        method: 'get',
        params,
    })
}

// ─── Документы ──────────────────────────────────────────────────────────────

export interface ListDocumentsParams {
    projectId: string
    contextType?: DocContextType
    recordId?: string
    ownerId?: string
    hasDrift?: boolean
    from?: number
    to?: number
    pageIndex?: number
    pageSize?: number
    search?: string
    sourceKind?: 'generated' | 'uploaded'
    fileType?: string
    templateId?: string
    emptyVarsOnly?: boolean
}

/** GET /api/v1/documents (§3.10). */
export async function apiListDocuments(params: ListDocumentsParams) {
    return ApiService.fetchDataWithAxios<{ list: DocumentGroup[]; total: number }>({
        url: '/v1/documents',
        method: 'get',
        params,
    })
}

/** GET /api/v1/documents/:groupId (§3.11) — карточка с версиями + drift. */
export async function apiGetDocument(groupId: string, params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<DocumentDetailResponse>({
        url: `/v1/documents/${groupId}`,
        method: 'get',
        params,
    })
}

/** GET /api/v1/documents/:groupId/versions (§3.12). */
export async function apiListDocumentVersions(
    groupId: string,
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<{ items: DocumentVersion[] }>({
        url: `/v1/documents/${groupId}/versions`,
        method: 'get',
        params,
    })
}

/** GET /api/v1/documents/:groupId/drift (§3.17). */
export async function apiCheckDrift(groupId: string, params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<DriftStatus>({
        url: `/v1/documents/${groupId}/drift`,
        method: 'get',
        params,
    })
}

export interface GeneratePayload {
    templateId: string
    contextType: DocContextType
    recordId: string
    useRevision?: 'current' | 'source'
    /** FR-ORDERS-255: подтвердить drift реквизитов продажи перед генерацией. */
    acceptDrift?: boolean
}

/** POST /api/v1/documents/generate (§3.13). */
export async function apiGenerateDocument(
    payload: GeneratePayload,
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<GenerateResponse, GeneratePayload>({
        url: '/v1/documents/generate',
        method: 'post',
        params,
        data: payload,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/** POST /api/v1/documents/:groupId/regenerate (§3.14). */
export async function apiRegenerateDocument(
    groupId: string,
    payload: { useRevision?: 'current' | 'source'; expectedVersion?: number; acceptDrift?: boolean },
    params: { projectId: string },
) {
    return ApiService.fetchDataWithAxios<GenerateResponse>({
        url: `/v1/documents/${groupId}/regenerate`,
        method: 'post',
        params,
        data: payload,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/** POST /api/v1/documents/upload (§3.15) — multipart загрузка файла. */
export async function apiUploadDocument(form: FormData, params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<
        { group: DocumentGroup; version: DocumentVersion },
        FormData
    >({
        url: '/v1/documents/upload',
        method: 'post',
        params,
        data: form,
        headers: {
            'Content-Type': 'multipart/form-data',
            'Idempotency-Key': idempotencyKey(),
        },
    })
}

/** DELETE /api/v1/documents/:groupId (§3.19) — soft-delete. */
export async function apiDeleteDocument(groupId: string, params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<{ ok: boolean }>({
        url: `/v1/documents/${groupId}`,
        method: 'delete',
        params,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/**
 * GET /api/v1/documents/versions/:versionId/download (§3.16 / G4).
 *
 * Ручка gateway JWT-защищена и отдаёт JSON `{ url, expiresAt }` с короткоживущим
 * presigned URL (НЕ 302 и НЕ сам файл — см. crm-bff.controller.downloadVersion).
 * Поэтому её нельзя открывать через `window.open` навигацией: заголовок
 * `Authorization` из token-strategy туда не попадает → 401 либо сырой JSON во
 * вкладке. Ходим обычным axios-запросом (перехватчик добавит токен), а открываем
 * уже полученный `url`. Тот же паттерн, что у `apiDownloadTemplate`.
 */
export async function apiDownloadVersion(
    versionId: string,
    params: { projectId: string; ttlSec?: number },
) {
    return ApiService.fetchDataWithAxios<{ url: string; expiresAt: number }>({
        url: `/v1/documents/versions/${versionId}/download`,
        method: 'get',
        params,
    })
}

// ─── Хелперы UI ──────────────────────────────────────────────────────────────

export const CONTEXT_LABELS: Record<DocContextTypeWithNone, string> = {
    order: 'Продажа',
    deal: 'Сделка',
    contact: 'Контакт',
    company: 'Компания',
    none: 'Без привязки',
}

/** Маппинг contextType → host-маршрут карточки записи (исправляет AS-IS-баг). */
export function contextRecordRoute(
    contextType: DocContextTypeWithNone,
    recordId?: string | null,
): string | null {
    if (!recordId || contextType === 'none') return null
    const map: Record<DocContextType, string> = {
        order: '/orders',
        deal: '/deals',
        contact: '/contacts',
        company: '/companies',
    }
    const prefix = map[contextType as DocContextType]
    return prefix ? `${prefix}/${recordId}` : null
}

export const GENERATED_VIA_LABELS: Record<GeneratedVia, string> = {
    manual: 'создан вручную',
    regenerate: 'перевыпущен после изменения реквизитов',
    automation: 'авто',
    upload: 'загружен',
}

/** Короткий бейдж способа создания для списка (EL-LIST-11). */
export const GENERATED_VIA_BADGE: Record<GeneratedVia, string> = {
    manual: 'вручную',
    regenerate: 'перевыпуск',
    automation: 'авто',
    upload: 'загружен',
}

/** Человекочитаемый короткий тип файла из MIME. */
export function mimeShort(mimeType?: string): string {
    if (!mimeType) return 'FILE'
    if (mimeType.includes('wordprocessingml') || mimeType.includes('msword')) return 'DOCX'
    if (mimeType.includes('pdf')) return 'PDF'
    if (mimeType.includes('spreadsheetml') || mimeType.includes('ms-excel')) return 'XLSX'
    if (mimeType.includes('presentationml') || mimeType.includes('ms-powerpoint')) return 'PPTX'
    return mimeType.split('/').pop()?.toUpperCase().slice(0, 5) || 'FILE'
}

export function formatBytes(bytes?: number): string {
    if (!bytes || bytes <= 0) return '—'
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}
