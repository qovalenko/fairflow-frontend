import ApiService from './ApiService'

/**
 * Chat-domain API client (контракт docs/tz/contracts/chat.md +
 * docs/tz/areas/chat-module/06-frontend-contract.md §6).
 *
 * Чат — бизнес-модуль (`kind:'business'`, съёмный per-project). Полноэкранный
 * экран живёт в remote `modules/chat`; в host-shell остаётся только дропдаун
 * «Чаты» в шапке (БП-13/FR-CHAT-42) — он использует подмножество этих методов
 * (список бесед, счётчик непрочитанных, read-all, быстрый ответ).
 *
 * Все запросы идут на gateway REST `/api/v1/chat/*` (точное зеркало BFF-таблицы
 * TZ §6.2). Заголовки: `Authorization: Bearer`, `X-Project-Id`/`?projectId=`,
 * `Idempotency-Key` на небезопасных POST.
 *
 * Гейт UX: `enabledModules.includes('chat')` + `usePermission('chat','read')`.
 * Истина доступа — backend-guard (FE-гейт только UX, BR-SHELL-4).
 */

// ─── Типы (FE-VM, 06-frontend-contract §3) ───────────────────────────────────

export type ConversationType = 'dm' | 'group' | 'project_channel'
export type ConversationScopeKind = 'project' | 'org' | 'workspace'

/** Сегмент-фильтр дропдауна/списка (06-frontend-contract §2.1/§3.1). */
export type ChatScopeFilter = 'dm_group' | 'project_channel' | 'all'

/** Scope счётчика непрочитанных (FR-CHAT-20/47): текущий проект или все проекты. */
export type ChatUnreadScope = 'current' | 'all'

export interface ConversationScope {
    kind: ConversationScopeKind
    scopeId: string
}

export interface ConversationLastMessage {
    text: string
    senderId: string
    sentAt: number
    kind: 'text' | 'system'
}

/** FE-модель беседы из ListConversations (FR-CHAT-1). */
export interface ConversationVM {
    id: string
    type: ConversationType
    /** DM: резолвится gateway (имя собеседника). */
    title: string
    avatarUrl?: string
    scope: ConversationScope
    lastMessage?: ConversationLastMessage
    lastMessageAt: number
    unreadCount: number
    archivedAt?: number | null
}

/** Ответ `GET /api/v1/chat/conversations`. */
export interface ConversationListResponse {
    conversations: ConversationVM[]
}

export interface ConversationListParams {
    projectId: string
    /** Сегмент — фильтрация на FE по scope (BFF отдаёт все доступные). */
    scopeFilter?: ChatScopeFilter
    includeArchived?: boolean
}

/** Ответ `GET /api/v1/chat/unread-count` (FR-CHAT-20). */
export interface UnreadCountResponse {
    count: number
    byProject?: { projectId: string; count: number }[]
}

/** Тело быстрого inline-ответа (POST .../messages, FR-CHAT-10). */
export interface SendMessagePayload {
    /** UUID, генерится ДО отправки (идемпотентность, FR-CHAT-41). */
    clientMessageId: string
    text: string
    replyToId?: string | null
    mentionIds?: string[]
    attachments?: {
        documentId: string
        versionId: string
        fileName: string
        mime: string
        size: number
    }[]
}

/** Отправленное сообщение (FE-VM, подмножество — для дропдауна достаточно). */
export interface SentMessageVM {
    id: string
    seq: number
    conversationId: string
    text: string
    sentAt: number
    clientMessageId: string
}

function idempotencyKey(): string {
    try {
        return crypto.randomUUID()
    } catch {
        return `ik_${Date.now()}_${Math.random().toString(36).slice(2)}`
    }
}

/** Сгенерировать clientMessageId (UUID) до оптимистичной отрисовки (FR-CHAT-41). */
export function newClientMessageId(): string {
    return idempotencyKey()
}

// ─── Методы (контракт §6) ────────────────────────────────────────────────────

/** GET /api/v1/chat/conversations (FR-CHAT-1). Список бесед проекта. */
export async function apiGetChatConversations(params: ConversationListParams) {
    const { projectId, includeArchived = false } = params
    return ApiService.fetchDataWithAxios<ConversationListResponse>({
        url: '/v1/chat/conversations',
        method: 'get',
        params: {
            projectId,
            ...(includeArchived ? { includeArchived: true } : {}),
        },
    })
}

/** GET /api/v1/chat/unread-count (FR-CHAT-20). Счётчик непрочитанных проекта. */
export async function apiGetChatUnreadCount(params: {
    projectId: string
    scopeFilter?: ChatUnreadScope
}) {
    return ApiService.fetchDataWithAxios<UnreadCountResponse>({
        url: '/v1/chat/unread-count',
        method: 'get',
        params: {
            projectId: params.projectId,
            ...(params.scopeFilter ? { scopeFilter: params.scopeFilter } : {}),
        },
    })
}

/** POST /api/v1/chat/read-all (FR-CHAT-19). Прочитать всё в проекте. */
export async function apiChatMarkAllRead(params: { projectId: string }) {
    return ApiService.fetchDataWithAxios<UnreadCountResponse>({
        url: '/v1/chat/read-all',
        method: 'post',
        params: { projectId: params.projectId },
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/** POST /api/v1/chat/conversations/{id}/read (FR-CHAT-18). Прочитать беседу до seq. */
export async function apiChatMarkRead(params: {
    conversationId: string
    projectId: string
    uptoSeq?: number
}) {
    return ApiService.fetchDataWithAxios<UnreadCountResponse>({
        url: `/v1/chat/conversations/${params.conversationId}/read`,
        method: 'post',
        params: { projectId: params.projectId },
        data: params.uptoSeq != null ? { uptoSeq: params.uptoSeq } : {},
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
}

/**
 * POST /api/v1/chat/conversations/{id}/messages (FR-CHAT-10). Отправка сообщения.
 * `clientMessageId` дублируется в `Idempotency-Key` (06-frontend-contract §4.3,
 * OQ-3): дубль одного намерения → тот же объект (200), не второе сообщение.
 */
export async function apiSendChatMessage(params: {
    conversationId: string
    projectId: string
    payload: SendMessagePayload
}) {
    return ApiService.fetchDataWithAxios<SentMessageVM, SendMessagePayload>({
        url: `/v1/chat/conversations/${params.conversationId}/messages`,
        method: 'post',
        params: { projectId: params.projectId },
        data: params.payload,
        headers: { 'Idempotency-Key': params.payload.clientMessageId },
    })
}

/**
 * Realtime-поток чата (06-frontend-contract §4.2, FR-CHAT-22/25/40).
 * WS `/ws/chat` основной; этот URL — SSE-fallback `/api/v1/chat/stream`
 * (read-only деградация — отправка через REST). Сам EventSource держит
 * подписчик (дропдаун — на badge-кадры).
 */
export function chatStreamUrl(params: { projectId?: string }): string {
    const base = '/api/v1/chat/stream'
    const q = new URLSearchParams()
    if (params.projectId) q.set('projectId', params.projectId)
    const qs = q.toString()
    return qs ? `${base}?${qs}` : base
}

/** Извлекает код ошибки из axios-ответа (конверт error.code + плоский code, CONVENTIONS). */
export function chatErrorCode(err: unknown): string | undefined {
    const ax = err as
        | { response?: { data?: { error?: { code?: string }; code?: string } } }
        | undefined
    const data = ax?.response?.data
    if (!data) return undefined
    if (data.error?.code) return data.error.code
    if (typeof data.code === 'string') return data.code
    return undefined
}

/** 403 MODULE_DISABLED / CHAT_MODULE_DISABLED — раздел недоступен, а не ошибка ленты. */
export function isChatModuleDisabledError(err: unknown): boolean {
    const code = chatErrorCode(err)
    return code === 'MODULE_DISABLED' || code === 'CHAT_MODULE_DISABLED'
}
