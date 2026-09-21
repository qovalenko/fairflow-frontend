import ApiService from './ApiService'

/**
 * Notification-domain API client (контракт docs/tz/contracts/notification.md).
 *
 * Уведомления — системная часть host-shell (`kind:"system"`, FR-MNOT-1..36).
 * Колокольчик, лента и настройки живут в host (а не отдельным remote).
 * Все запросы идут на gateway REST `/api/notification/*`.
 *
 * Гейт UX: `enabledModules.includes('notifications')` + `usePermission('notifications','read')`.
 * Истина доступа — backend-guard (SEC-N-1: ProjectAccessGuard + @RequirePermission).
 *
 * Скоупинг:
 *  - count/list/read/read-all/catalog — project-scope (`X-Project-Id`), отправляем `projectId` query
 *    (по паттерну SearchService; gateway также читает заголовок).
 *  - preferences — user-scope (без проекта), адресат из JWT (SEC-N-5).
 */

// ─── Типы (зеркало схем контракта §3) ────────────────────────────────────────

/** FE-форма одного уведомления (BFF `notificationFe`, §3.2). */
export interface NotificationItem {
    id: string
    /** Заголовок (BFF: `title`). */
    target: string
    /** Тело (BFF: `body`). */
    description: string
    /** ISO-дата создания (BFF мапит `created_at`). */
    date: string
    /** Категория/тип (`deals|sales|data|activities|org|billing|import`). */
    category?: string
    severity?: 'info' | 'important' | 'critical'
    /** Deep-link к источнику (FR-MNOT-21); пусто → раскрытие в ленте. */
    location?: string
    /** Человекочитаемый ярлык места (модуль-источник). */
    locationLabel?: string
    /** Метка проекта при scope=all (FR-MNOT-22). */
    projectId?: string
    projectLabel?: string
    status?: 'queued' | 'sent' | 'read' | 'suppressed' | 'failed'
    readed: boolean
}

/** Ответ `GET /api/notification/list` (BFF — массив FE-формы, §3.2). */
export interface NotificationListResponse {
    list: NotificationItem[]
    total: number
}

export interface NotificationListParams {
    projectId: string
    pageIndex?: number
    /** ≤ 200, дефолт 25 (NFR-MNOT-3). */
    pageSize?: number
    unreadOnly?: boolean
    category?: string
    /** `current|all` (Should, FR-MNOT-22). */
    scope?: 'current' | 'all'
}

/** Ответ `PUT /api/notification/read-all` (§3.4). */
export interface MarkAllReadResponse {
    updated: number
    unread: number
}

export type EmailMode = 'immediate' | 'hourly' | 'daily' | 'off'

/** Одна строка настройки каналов категории (§3.6). */
export interface CategoryPref {
    in_app: boolean
    email: boolean
    /** Дублировать email если офлайн (FR-MNOT-36). */
    escalate_offline?: boolean
}

/** Per-user-настройки (`Preferences`, §3.6). */
export interface NotificationPreferences {
    user_id?: string
    email_mode: EmailMode
    /** "HH:mm" — время дайджеста (FR-MNOT-35). */
    digest_time?: string | null
    timezone?: string | null
    categories: Record<string, CategoryPref>
    quiet_hours?: { from: string; to: string; tz: string } | null
    updated_at?: number
}

/** Тело `PUT /api/notification/preferences` (§3.7; без `user_id` — SEC-N-5). */
export interface UpdatePreferencesPayload {
    email_mode?: EmailMode
    digest_time?: string | null
    timezone?: string | null
    categories?: Record<string, CategoryPref>
}

/** Одна категория каталога (`CategorySpec`, §3.8). */
export interface CategorySpec {
    category: string
    module: string
    title: string
    severity: 'info' | 'important' | 'critical'
    default_channels: string[]
    /** `true` ⇔ critical (неотключаемо, FR-MNOT-17 — без переключателей). */
    mandatory: boolean
}

/** Ответ `GET /api/notification/catalog` (§3.8). */
export interface CatalogResponse {
    categories: CategorySpec[]
}

/** Дефолты, пока be-каталог не отдаёт значения (каркас на моках). */
export const DEFAULT_CATALOG: CategorySpec[] = [
    { category: 'deals', module: 'deals', title: 'Сделки', severity: 'info', default_channels: ['in_app'], mandatory: false },
    { category: 'sales', module: 'orders', title: 'Продажи', severity: 'critical', default_channels: ['in_app', 'email'], mandatory: true },
    { category: 'data', module: 'contacts', title: 'Данные и шаринг', severity: 'info', default_channels: ['in_app'], mandatory: false },
    { category: 'activities', module: 'activities', title: 'Активности и напоминания', severity: 'important', default_channels: ['in_app', 'email'], mandatory: false },
    { category: 'org', module: 'control', title: 'Организация и приглашения', severity: 'critical', default_channels: ['in_app', 'email'], mandatory: true },
    { category: 'billing', module: 'billing', title: 'Биллинг', severity: 'critical', default_channels: ['in_app', 'email'], mandatory: true },
    { category: 'import', module: 'contacts', title: 'Импорт/экспорт', severity: 'info', default_channels: ['in_app'], mandatory: false },
]

/** Дефолтные prefs (нет записи → дефолты, §3.6). */
export const DEFAULT_PREFERENCES: NotificationPreferences = {
    email_mode: 'off',
    digest_time: null,
    timezone: null,
    categories: {},
    quiet_hours: null,
}

function idempotencyKey(): string {
    try {
        return crypto.randomUUID()
    } catch {
        return `ik_${Date.now()}_${Math.random().toString(36).slice(2)}`
    }
}

// ─── Методы (контракт §2) ─────────────────────────────────────────────────────

/** GET /api/notification/count (§3.1). Счётчик непрочитанных для колокольчика/бейджа. */
export async function apiGetNotificationCount(params: {
    projectId: string
    unreadOnly?: boolean
    scope?: 'current' | 'all'
}) {
    const { projectId, unreadOnly = true, scope } = params
    return ApiService.fetchDataWithAxios<{ count: number }>({
        url: '/notification/count',
        method: 'get',
        params: {
            projectId,
            unread_only: unreadOnly,
            ...(scope ? { scope } : {}),
        },
    })
}

/** GET /api/notification/list (§3.2). Лента с пагинацией. */
export async function apiGetNotificationList(params: NotificationListParams) {
    const { projectId, pageIndex = 0, pageSize = 25, unreadOnly = false, category, scope } = params
    return ApiService.fetchDataWithAxios<NotificationListResponse>({
        url: '/notification/list',
        method: 'get',
        params: {
            projectId,
            page_index: pageIndex,
            page_size: pageSize,
            unread_only: unreadOnly,
            ...(category ? { category } : {}),
            ...(scope ? { scope } : {}),
        },
    })
}

/** PUT /api/notification/:id/read (§3.3). Отметить одно прочитанным (идемпотентно). */
export async function apiMarkNotificationRead(params: { id: string; projectId: string }) {
    return ApiService.fetchDataWithAxios<NotificationItem>({
        url: `/notification/${params.id}/read`,
        method: 'put',
        params: { projectId: params.projectId },
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/** PUT /api/notification/read-all (§3.4). Отметить все непрочитанные проекта (FR-MNOT-8). */
export async function apiMarkAllNotificationsRead(params: {
    projectId: string
    scope?: 'current' | 'all'
}) {
    return ApiService.fetchDataWithAxios<MarkAllReadResponse>({
        url: '/notification/read-all',
        method: 'put',
        params: { projectId: params.projectId, ...(params.scope ? { scope: params.scope } : {}) },
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/** GET /api/notification/preferences (§3.6). User-scope (без проекта). */
export async function apiGetNotificationPreferences() {
    return ApiService.fetchDataWithAxios<NotificationPreferences>({
        url: '/notification/preferences',
        method: 'get',
    })
}

/** PUT /api/notification/preferences (§3.7). Upsert per-user (SEC-N-5: без user_id в теле). */
export async function apiUpdateNotificationPreferences(payload: UpdatePreferencesPayload) {
    return ApiService.fetchDataWithAxios<NotificationPreferences, UpdatePreferencesPayload>({
        url: '/notification/preferences',
        method: 'put',
        data: payload,
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/** GET /api/notification/catalog (§3.8). Каталог категорий проекта из манифестов. */
export async function apiGetNotificationCatalog(params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<CatalogResponse>({
        url: '/notification/catalog',
        method: 'get',
        params: { projectId: params.projectId },
    })
}

/**
 * SSE-поток ленты (§3.5, FR-MNOT-9). Возвращает URL для EventSource.
 * Сам EventSource держит host (один на сессию, переиспользуется BELL/LIST/TOAST).
 */
export function notificationStreamUrl(params: { projectId?: string; scope?: 'current' | 'all' }): string {
    const base = '/api/notification/stream'
    const q = new URLSearchParams()
    if (params.projectId) q.set('projectId', params.projectId)
    if (params.scope) q.set('scope', params.scope)
    const qs = q.toString()
    return qs ? `${base}?${qs}` : base
}
