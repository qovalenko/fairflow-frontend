/**
 * chatService — axios-обёртки путей gateway-BFF `/api/v1/chat/...`
 * (точное зеркало docs/tz/contracts/chat.md §2.1/§6 и 06-frontend-contract.md §6).
 *
 * ApiService.fetchDataWithAxios bind'ит baseURL=`/api` (app.config.apiPrefix),
 * поэтому url здесь начинается с `/v1/chat`. JWT и общий заголовок X-Project-Id
 * ставит AxiosBase-интерцептор host'а (Волна 1). Однако chat-BFF резолвит scope
 * СТРОГО из query `?projectId=` (`@Query('projectId')` → outbound-metadata, без
 * фолбэка на заголовок X-Project-Id) — поэтому каждый вызов идёт через chatRequest(),
 * который подмешивает projectId из projectStore именно в query. Без него gateway-BFF
 * отвечает `3 INVALID_ARGUMENT: Не удалось определить scope`.
 *
 * Дедуп (задача #25): общие утилиты (генератор idempotency-ключей) переиспользуются
 * из host-клиента `services/ChatService`, не дублируются здесь.
 */
import ApiService from '@/services/ApiService'
// Идемпотентность-ключей общий генератор берём из host-клиента чата
// (services/ChatService), чтобы не дублировать реализацию UUID (задача #25).
import { newClientMessageId } from '@/services/ChatService'
import { useProjectStore } from '@/store/projectStore'
import type {
    ConversationVM,
    MessageVM,
    MemberVM,
    AttachmentVM,
    PresenceVM,
    ReadReceiptsVM,
    UnreadCountVM,
    OutgoingMessage,
    ScopeFilter,
    EntityRef,
    EntityRefType,
} from './chatTypes'

const BASE = '/v1/chat'

/**
 * Враппер над ApiService.fetchDataWithAxios: подмешивает projectId в query из текущего
 * projectStore, если вызывающий не задал его явно. Все chat-эндпоинты project-scoped —
 * без scope gateway-BFF отвечает `3 INVALID_ARGUMENT: Не удалось определить scope`.
 * projectId в сторе = тот же, что отдаёт useResolvedProjectId, поэтому конфликта
 * query↔scope нет (личное пространство → currentProjectId пуст → header не шлём).
 */
function chatRequest<T, R = Record<string, unknown>>(
    cfg: Parameters<typeof ApiService.fetchDataWithAxios<T, R>>[0],
): Promise<T> {
    const pid = useProjectStore.getState().currentProjectId
    const params = (cfg as { params?: Record<string, unknown> }).params
    const hasPid = params != null && params.projectId != null
    if (pid && !hasPid) {
        return ApiService.fetchDataWithAxios<T, R>({
            ...cfg,
            params: { ...(params ?? {}), projectId: pid },
        })
    }
    return ApiService.fetchDataWithAxios<T, R>(cfg)
}

/**
 * Имена участников проекта (control `/v1/projects/:id/members`) для резолва
 * userId→имя в чате (подписи отправителей, заголовок DM). Доступно любому
 * участнику проекта (только membership). Возвращает [] на ошибке/без projectId.
 */
export async function apiListProjectMembers(
    projectId?: string,
): Promise<{ id: string; name: string }[]> {
    if (!projectId) return []
    try {
        const res = await ApiService.fetchDataWithAxios<unknown>({
            url: `/v1/projects/${projectId}/members`,
            method: 'get',
        })
        const list = Array.isArray(res) ? res : ((res as { list?: unknown[] })?.list ?? [])
        return (list as { id?: string; userId?: string; name?: string; email?: string }[]).map(
            (m) => ({
                id: m.id ?? m.userId ?? '',
                name: m.name || m.email || m.id || m.userId || '',
            }),
        )
    } catch {
        return []
    }
}

// ─── Raw (snake_case) wire-типы (keepCase loader) ─────────────────────────────

interface RawScope {
    kind: string
    scopeId?: string
    scope_id?: string
}
interface RawLastMessage {
    id: string
    text: string
    sender_id?: string
    senderId?: string
    sent_at?: number
    sentAt?: number
    kind?: string
}
interface RawConversation {
    id: string
    type: string
    scope?: RawScope
    project_id?: string
    projectId?: string
    title?: string
    avatar_url?: string
    avatarUrl?: string
    created_by?: string
    createdBy?: string
    my_role?: string
    myRole?: string
    last_message?: RawLastMessage | null
    lastMessage?: RawLastMessage | null
    last_message_at?: number
    lastMessageAt?: number
    unread_count?: number
    unreadCount?: number
    archived_at?: number | null
    archivedAt?: number | null
    members?: RawMember[]
}
interface RawMember {
    user_id?: string
    userId?: string
    role?: string
    joined_at?: number
    left_at?: number | null
    last_read_seq?: number
}
interface RawAttachment {
    document_id?: string
    documentId?: string
    version_id?: string
    versionId?: string
    file_name?: string
    fileName?: string
    mime?: string
    size?: number
}
interface RawMessage {
    id: string
    seq: number
    conversation_id?: string
    conversationId?: string
    sender_id?: string
    senderId?: string
    sender_type?: string
    senderType?: string
    kind?: string
    text?: string
    attachments?: RawAttachment[]
    mention_ids?: string[]
    mentionIds?: string[]
    entity_refs?: RawEntityRef[]
    entityRefs?: RawEntityRef[]
    reply_to_id?: string | null
    replyToId?: string | null
    client_message_id?: string
    clientMessageId?: string
    edited_at?: number | null
    editedAt?: number | null
    deleted_at?: number | null
    deletedAt?: number | null
    sent_at?: number
    sentAt?: number
}
interface RawEntityRef {
    type?: string
    id?: string
    label?: string
}

// ─── Нормализаторы snake_case → VM ────────────────────────────────────────────

function normScope(s?: RawScope): ConversationVM['scope'] {
    return {
        kind: (s?.kind as ConversationVM['scope']['kind']) ?? 'project',
        scopeId: s?.scopeId ?? s?.scope_id ?? '',
    }
}

function normLastMessage(m?: RawLastMessage | null): ConversationVM['lastMessage'] {
    if (!m) return null
    return {
        id: m.id,
        text: m.text ?? '',
        senderId: m.senderId ?? m.sender_id ?? '',
        sentAt: m.sentAt ?? m.sent_at ?? 0,
        kind: (m.kind as 'text' | 'system') ?? 'text',
    }
}

export function normConversation(c: RawConversation): ConversationVM {
    // gateway-BFF отдаёт camelCase; snake — запасной путь. Время/счётчики Long-safe.
    return {
        id: c.id,
        type: (c.type as ConversationVM['type']) ?? 'group',
        title: c.title ?? '',
        avatarUrl: c.avatarUrl ?? c.avatar_url,
        scope: normScope(c.scope),
        projectId: c.projectId ?? c.project_id,
        createdBy: c.createdBy ?? c.created_by,
        myRole: (c.myRole ?? c.my_role) as ConversationVM['myRole'],
        lastMessage: normLastMessage(c.lastMessage ?? c.last_message),
        lastMessageAt: toNum(c.lastMessageAt ?? c.last_message_at),
        unreadCount: toNum(c.unreadCount ?? c.unread_count),
        archivedAt: toNum(c.archivedAt ?? c.archived_at) || null,
        members: Array.isArray(c.members) ? c.members.map(normMember) : undefined,
    }
}

export function normMember(m: RawMember): MemberVM {
    return {
        userId: m.userId ?? m.user_id ?? '',
        role: (m.role as MemberVM['role']) ?? 'member',
        joinedAt: m.joined_at,
        leftAt: m.left_at ?? null,
        lastReadSeq: m.last_read_seq,
    }
}

function normAttachment(a: RawAttachment): AttachmentVM {
    return {
        documentId: a.documentId ?? a.document_id ?? '',
        versionId: a.versionId ?? a.version_id ?? '',
        fileName: a.fileName ?? a.file_name ?? '',
        mime: a.mime ?? 'application/octet-stream',
        size: a.size ?? 0,
    }
}

function normEntityRefs(refs?: RawEntityRef[]): EntityRef[] {
    if (!Array.isArray(refs)) return []
    return refs
        .filter((r) => r.type && r.id)
        .map((r) => ({
            type: r.type as EntityRefType,
            id: r.id!,
            label: r.label ?? '',
        }))
}

/**
 * gRPC int64 → number: gateway отдаёт время/seq либо числом, либо Long
 * `{ low, high, unsigned }` (protobuf без longs:Number). Нормализуем в число (ms
 * влезают в 53 бита) — иначе dayjs(Long) даёт «Invalid Date», а сортировка по seq врёт.
 */
function toNum(v: unknown): number {
    if (v == null) return 0
    if (typeof v === 'number') return v
    if (typeof v === 'object') {
        const l = v as { low?: number; high?: number }
        if (typeof l.low === 'number') return (l.high ?? 0) * 4294967296 + (l.low >>> 0)
    }
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

export function normMessage(m: RawMessage): MessageVM {
    const edited = m.editedAt ?? m.edited_at
    const deleted = m.deletedAt ?? m.deleted_at
    return {
        id: m.id,
        // gateway-BFF отдаёт camelCase (senderId/sentAt/…); snake — запасной путь.
        seq: toNum(m.seq),
        conversationId: m.conversationId ?? m.conversation_id ?? '',
        senderId: m.senderId ?? m.sender_id ?? '',
        senderType: ((m.senderType ?? m.sender_type) as MessageVM['senderType']) ?? 'user',
        kind: (m.kind as MessageVM['kind']) ?? 'text',
        text: m.text ?? '',
        attachments: (m.attachments ?? []).map(normAttachment),
        mentionIds: m.mentionIds ?? m.mention_ids ?? [],
        entityRefs: normEntityRefs(m.entityRefs ?? m.entity_refs),
        replyToId: m.replyToId ?? m.reply_to_id ?? null,
        clientMessageId: m.clientMessageId ?? m.client_message_id,
        editedAt: edited != null ? toNum(edited) : null,
        deletedAt: deleted != null ? toNum(deleted) : null,
        sentAt: toNum(m.sentAt ?? m.sent_at),
    }
}

// idempotencyKey — общий генератор из host-клиента (см. импорт newClientMessageId выше).
const idempotencyKey = newClientMessageId

// ─── Беседы ───────────────────────────────────────────────────────────────────

/** GET /api/v1/chat/conversations (FR-CHAT-1). */
export async function apiListConversations(params: {
    projectId?: string
    includeArchived?: boolean
    scopeFilter?: 'current' | 'all'
}): Promise<ConversationVM[]> {
    const res = await chatRequest<{ conversations: RawConversation[] }>({
        url: `${BASE}/conversations`,
        method: 'get',
        params: {
            ...(params.projectId ? { projectId: params.projectId } : {}),
            ...(params.includeArchived ? { includeArchived: true } : {}),
            ...(params.scopeFilter ? { scopeFilter: params.scopeFilter } : {}),
        },
    })
    return (res.conversations ?? []).map(normConversation)
}

/** GET /api/v1/chat/conversations/{id} (FR-CHAT-1). */
export async function apiGetConversation(
    id: string,
    projectId?: string,
): Promise<ConversationVM & { members: MemberVM[] }> {
    const res = await chatRequest<RawConversation>({
        url: `${BASE}/conversations/${id}`,
        method: 'get',
        // projectId обязателен для gateway-BFF (requireProjectId) — без него 500.
        params: projectId ? { projectId } : undefined,
    })
    return { ...normConversation(res), members: (res.members ?? []).map(normMember) }
}

/** POST /api/v1/chat/conversations (FR-CHAT-2,3,4,5). */
export async function apiCreateConversation(body: {
    type: 'dm' | 'group' | 'project_channel'
    peerUserId?: string
    title?: string
    memberUserIds?: string[]
    projectId?: string
}): Promise<ConversationVM> {
    const res = await chatRequest<RawConversation>({
        url: `${BASE}/conversations`,
        method: 'post',
        params: body.projectId ? { projectId: body.projectId } : undefined,
        data: {
            // gateway-BFF читает camelCase (body.peerUserId/...), домен-snake — на gateway через keepCase
            type: body.type,
            peerUserId: body.peerUserId,
            title: body.title,
            memberUserIds: body.memberUserIds,
        },
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
    return normConversation(res)
}

/**
 * POST/DELETE /api/v1/chat/conversations/{id}/members (FR-CHAT-6).
 * method: 'post' — добавление/смена ролей (gateway требует chat:manage);
 * method: 'delete' — удаление участников. Self-leave (remove == [self], без add/
 * roleChanges) на DELETE-роуте не требует chat:manage (детектится по телу на gateway),
 * поэтому выход из беседы обязан идти через DELETE.
 */
export async function apiUpdateMembers(
    id: string,
    body: {
        add?: string[]
        remove?: string[]
        roleChanges?: { userId: string; role: string }[]
    },
    method: 'post' | 'delete' = 'post',
): Promise<ConversationVM & { members: MemberVM[] }> {
    const res = await chatRequest<RawConversation>({
        url: `${BASE}/conversations/${id}/members`,
        method,
        data: {
            add: body.add,
            remove: body.remove,
            roleChanges: body.roleChanges?.map((r) => ({ userId: r.userId, role: r.role })),
        },
    })
    return { ...normConversation(res), members: (res.members ?? []).map(normMember) }
}

/** POST /api/v1/chat/conversations/{id}/transfer-ownership (FR-CHAT-8). */
export async function apiTransferOwnership(
    id: string,
    newOwnerUserId: string,
): Promise<ConversationVM> {
    const res = await chatRequest<RawConversation>({
        url: `${BASE}/conversations/${id}/transfer-ownership`,
        method: 'post',
        data: { newOwnerUserId: newOwnerUserId },
    })
    return normConversation(res)
}

/** POST /api/v1/chat/conversations/{id}/archive (FR-CHAT-7). */
export async function apiArchiveConversation(id: string): Promise<ConversationVM> {
    const res = await chatRequest<RawConversation>({
        url: `${BASE}/conversations/${id}/archive`,
        method: 'post',
    })
    return normConversation(res)
}

// ─── Сообщения ──────────────────────────────────────────────────────────────

/** GET /api/v1/chat/conversations/{id}/messages?beforeSeq=&limit= (FR-CHAT-12, keyset). */
export async function apiGetMessages(params: {
    conversationId: string
    beforeSeq?: number
    limit?: number
    projectId?: string
}): Promise<MessageVM[]> {
    const res = await chatRequest<{ messages: RawMessage[] }>({
        url: `${BASE}/conversations/${params.conversationId}/messages`,
        method: 'get',
        params: {
            ...(params.beforeSeq != null ? { beforeSeq: params.beforeSeq } : {}),
            limit: params.limit ?? 50,
            // projectId обязателен для gateway-BFF (requireProjectId) — без него 500.
            ...(params.projectId ? { projectId: params.projectId } : {}),
        },
    })
    return (res.messages ?? []).map(normMessage)
}

/** POST /api/v1/chat/conversations/{id}/messages (FR-CHAT-10,41) — idempotency by clientMessageId. */
export async function apiSendMessage(
    conversationId: string,
    msg: OutgoingMessage,
): Promise<MessageVM> {
    const res = await chatRequest<RawMessage>({
        url: `${BASE}/conversations/${conversationId}/messages`,
        method: 'post',
        data: {
            // gateway-BFF читает camelCase (см. chat-bff.controller body.X); домен-snake — на gateway
            text: msg.text,
            clientMessageId: msg.clientMessageId,
            attachments: msg.attachments.map((a) => ({
                documentId: a.documentId,
                versionId: a.versionId,
                fileName: a.fileName,
                mime: a.mime,
                size: a.size,
            })),
            mentionIds: msg.mentionIds,
            replyToId: msg.replyToId ?? undefined,
        },
        // clientMessageId дублируется как Idempotency-Key (06-frontend-contract §4.3, OQ-3)
        headers: { 'Idempotency-Key': msg.clientMessageId },
    })
    return normMessage(res)
}

/** PATCH /api/v1/chat/messages/{id} (FR-CHAT-13,15). */
export async function apiEditMessage(messageId: string, text: string): Promise<MessageVM> {
    const res = await chatRequest<RawMessage>({
        url: `${BASE}/messages/${messageId}`,
        method: 'patch',
        data: { text },
    })
    return normMessage(res)
}

/** DELETE /api/v1/chat/messages/{id} (FR-CHAT-14,49) — tombstone. */
export async function apiDeleteMessage(messageId: string): Promise<MessageVM> {
    const res = await chatRequest<RawMessage>({
        url: `${BASE}/messages/${messageId}`,
        method: 'delete',
    })
    return normMessage(res)
}

// ─── Read-курсоры / счётчики ──────────────────────────────────────────────────

/** POST /api/v1/chat/conversations/{id}/read (FR-CHAT-18). */
export async function apiMarkRead(
    conversationId: string,
    uptoSeq: number,
): Promise<{ unreadCount: number; totalUnread: number }> {
    const res = await chatRequest<{
        unreadCount?: number
        totalUnread?: number
    }>({
        url: `${BASE}/conversations/${conversationId}/read`,
        method: 'post',
        data: { uptoSeq },
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
    return { unreadCount: res.unreadCount ?? 0, totalUnread: res.totalUnread ?? 0 }
}

/** POST /api/v1/chat/read-all (FR-CHAT-19). */
export async function apiMarkAllRead(projectId?: string): Promise<{ updated: number }> {
    const res = await chatRequest<{ updated?: number }>({
        url: `${BASE}/read-all`,
        method: 'post',
        params: projectId ? { projectId } : undefined,
        data: {},
        headers: { 'Idempotency-Key': idempotencyKey() },
    })
    return { updated: res.updated ?? 0 }
}

/** GET /api/v1/chat/unread-count (FR-CHAT-20,47). */
export async function apiGetUnreadCount(params: {
    projectId?: string
    scopeFilter?: 'current' | 'all'
}): Promise<UnreadCountVM> {
    const res = await chatRequest<{
        count?: number
        byProject?: { projectId: string; count: number }[]
    }>({
        url: `${BASE}/unread-count`,
        method: 'get',
        params: {
            ...(params.projectId ? { projectId: params.projectId } : {}),
            ...(params.scopeFilter ? { scopeFilter: params.scopeFilter } : {}),
        },
    })
    return {
        count: res.count ?? 0,
        byProject: (res.byProject ?? []).map((p) => ({ projectId: p.projectId, count: p.count })),
    }
}

/** GET /api/v1/chat/conversations/{id}/read-receipts (FR-CHAT-21). */
export async function apiGetReadReceipts(
    conversationId: string,
    uptoSeq: number,
): Promise<ReadReceiptsVM> {
    const res = await chatRequest<{
        readBy?: RawMember[]
        readCount?: number
        totalMembers?: number
        aggregateOnly?: boolean
    }>({
        url: `${BASE}/conversations/${conversationId}/read-receipts`,
        method: 'get',
        params: { uptoSeq },
    })
    return {
        readBy: (res.readBy ?? []).map(normMember),
        readCount: res.readCount ?? 0,
        totalMembers: res.totalMembers ?? 0,
        aggregateOnly: !!res.aggregateOnly,
    }
}

/** GET /api/v1/chat/conversations/{id}/presence (FR-CHAT-23). */
export async function apiGetPresence(conversationId: string): Promise<PresenceVM[]> {
    const res = await chatRequest<{
        presence?: { userId?: string; user_id?: string; online?: boolean; last_seen_at?: number }[]
    }>({
        url: `${BASE}/conversations/${conversationId}/presence`,
        method: 'get',
    })
    return (res.presence ?? []).map((p) => ({
        userId: p.userId ?? p.user_id ?? '',
        online: !!p.online,
        lastSeenAt: p.last_seen_at,
    }))
}

// ─── Вложения (через documents, FR-CHAT-16,17) ────────────────────────────────

/** POST /api/v1/chat/attachments (multipart) — gateway грузит в MinIO через documents. */
export async function apiUploadAttachment(
    conversationId: string,
    file: File,
): Promise<AttachmentVM> {
    const form = new FormData()
    form.append('file', file)
    form.append('conversation_id', conversationId)
    const res = await chatRequest<RawAttachment, FormData>({
        url: `${BASE}/attachments`,
        method: 'post',
        data: form,
        headers: { 'Content-Type': 'multipart/form-data' },
    })
    return normAttachment(res)
}

/** GET /api/v1/chat/attachments/{versionId}/download-url (FR-CHAT-17). */
export async function apiGetAttachmentDownloadUrl(
    versionId: string,
): Promise<{ url: string; expiresAt?: number }> {
    const res = await chatRequest<{ url: string; expires_at?: number }>({
        url: `${BASE}/attachments/${versionId}/download-url`,
        method: 'get',
    })
    return { url: res.url, expiresAt: res.expires_at }
}

// ─── Realtime URLs (06-frontend-contract §4.2) ────────────────────────────────

/**
 * JWT для realtime: браузер не может слать Authorization на WS/EventSource.
 * WS (TODO-285): токен уходит в первом кадре `{type:'auth', token}` после connect,
 * не в query string. SSE: cookie `ff_access_token` / `token` (gateway читает cookie).
 */
export function realtimeToken(): string | null {
    return typeof window !== 'undefined' ? localStorage.getItem('token') : null
}

/** SSE-fallback URL `/api/v1/chat/stream` (для EventSource). */
export function chatStreamUrl(params: { projectId?: string }): string {
    const base = '/api/v1/chat/stream'
    const q = new URLSearchParams()
    if (params.projectId) q.set('projectId', params.projectId)
    const qs = q.toString()
    return qs ? `${base}?${qs}` : base
}

/** WS URL `/ws/chat` (основной транспорт). JWT — только в auth-кадре после onopen. */
export function chatSocketUrl(params: { projectId?: string }): string {
    const proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host = typeof window !== 'undefined' ? window.location.host : ''
    const q = new URLSearchParams()
    if (params.projectId) q.set('projectId', params.projectId)
    const qs = q.toString()
    return `${proto}://${host}/ws/chat${qs ? `?${qs}` : ''}`
}

/** Re-export типов scopeFilter UI ↔ backend scope_filter (документация). */
export type { ScopeFilter }

// ─── Поиск CRM-сущностей для inline-ссылок в сообщениях (P2.c) ─────────────────
//
// Backend-контракт чата не хранит entity-ссылки — они кодируются токеном в text
// (chatEntityRefs.ts). Пикер ищет сущности через СУЩЕСТВУЮЩИЕ gateway-ручки
// списков CRM (host/services/CrmService): те же `/v1/{deals,contacts,companies,
// orders}` c query-поиском (`query`) и projectId. Не дублируем клиента —
// переиспользуем host-обёртки (ApiService bind'ит `/api`, JWT/scope — интерцептор).
import {
    apiGetDeals,
    apiGetContacts,
    apiGetCompanies,
    apiGetOrders,
} from '@/services/CrmService'

interface RawEntityList {
    list?: Array<Record<string, unknown>>
    total?: number
}

const SEARCH_LIMIT = 8

function str(v: unknown): string {
    return typeof v === 'string' ? v : v == null ? '' : String(v)
}

/** Метка сущности по её сырой записи (поля сверены по host/@types/crm). */
function entityLabel(type: EntityRefType, r: Record<string, unknown>): string {
    switch (type) {
        case 'deal':
            return str(r.name) || str(r.title) || 'Сделка'
        case 'contact': {
            const full = `${str(r.firstName)} ${str(r.lastName)}`.trim()
            return full || str(r.email) || str(r.phone) || 'Контакт'
        }
        case 'company':
            return str(r.name) || 'Компания'
        case 'order': {
            const num = str(r.number)
            const t = str(r.typeName)
            return [num && `№ ${num}`, t].filter(Boolean).join(' · ') || 'Продажа'
        }
    }
}

/**
 * Поиск CRM-сущностей по подстроке названия для пикера композера. Возвращает
 * EntityRef[] (type/id/label). Пустой результат ≠ ошибка: на сбое запроса бросает
 * (пикер разделяет «ничего не найдено» и «ошибка поиска»). projectId обязателен
 * для CRM-доменов; без него — сразу [].
 */
export async function apiSearchEntities(
    type: EntityRefType,
    query: string,
    projectId?: string,
): Promise<EntityRef[]> {
    if (!projectId) return []
    const params = { query: query.trim(), pageSize: SEARCH_LIMIT, projectId }
    try {
        let data: RawEntityList
        switch (type) {
            case 'deal':
                data = await apiGetDeals<RawEntityList, typeof params>(params)
                break
            case 'contact':
                data = await apiGetContacts<RawEntityList, typeof params>(params)
                break
            case 'company':
                data = await apiGetCompanies<RawEntityList, typeof params>(params)
                break
            case 'order':
                data = await apiGetOrders<RawEntityList, typeof params>(params)
                break
        }
        const list = Array.isArray(data?.list) ? data.list : []
        return list
            .map((r): EntityRef | null => {
                const id = str(r.id) || str(r._id)
                if (!id) return null
                return { type, id, label: entityLabel(type, r) }
            })
            .filter((x): x is EntityRef => x !== null)
            .slice(0, SEARCH_LIMIT)
    } catch {
        throw new Error('entity-search-failed')
    }
}
