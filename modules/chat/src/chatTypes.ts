/**
 * FE-модель домена «Чат» — зеркало backend-контракта docs/tz/contracts/chat.md (§3, §4)
 * и frontend-контракта 06-frontend-contract.md (§3). keepCase: gateway-loader отдаёт
 * snake_case; chatService нормализует в camelCase VM ниже.
 */

export type ConversationType = 'dm' | 'group' | 'project_channel'
export type ScopeKind = 'project' | 'org' | 'workspace'
export type MemberRole = 'owner' | 'admin' | 'member'
export type MessageKind = 'text' | 'system'
export type SenderType = 'user' | 'integration' | 'system'
export type ScopeFilter = 'dm_group' | 'project_channel' | 'all'

export interface Scope {
    kind: ScopeKind
    scopeId: string
}

export interface LastMessageVM {
    id: string
    text: string
    senderId: string
    sentAt: number
    kind: MessageKind
}

/** FE-модель беседы из ListConversations (FR-CHAT-1). */
export interface ConversationVM {
    id: string
    type: ConversationType
    title: string
    avatarUrl?: string
    scope: Scope
    projectId?: string
    createdBy?: string
    myRole?: MemberRole
    lastMessage?: LastMessageVM | null
    lastMessageAt: number
    unreadCount: number
    archivedAt?: number | null
    /** Состав беседы (для DM — чтобы вывести имя собеседника в списке). */
    members?: MemberVM[]
}

export interface MemberVM {
    userId: string
    role: MemberRole
    joinedAt?: number
    leftAt?: number | null
    lastReadSeq?: number
}

export interface AttachmentVM {
    documentId: string
    versionId: string
    fileName: string
    mime: string
    size: number
}

/** FE-модель сообщения из GetMessages (FR-CHAT-12), keyset по seq. */
export interface MessageVM {
    id: string
    seq: number
    conversationId: string
    senderId: string
    senderType: SenderType
    kind: MessageKind
    text: string
    attachments: AttachmentVM[]
    mentionIds: string[]
    entityRefs?: EntityRef[]
    replyToId?: string | null
    clientMessageId?: string
    editedAt?: number | null
    deletedAt?: number | null
    sentAt: number
    /** локальный optimistic-флаг (ещё не ack) */
    pending?: boolean
    /** локальный флаг ошибки отправки (для ретрая) */
    failed?: boolean
}

/** Исходящее сообщение из composer (06-frontend-contract §3.3). */
export interface OutgoingMessage {
    clientMessageId: string
    text: string
    attachments: AttachmentVM[]
    mentionIds: string[]
    replyToId?: string | null
}

/**
 * Ссылка на CRM-сущность внутри сообщения чата (P2.c). Кодируется inline-токеном
 * в `text` (см. chatEntityRefs.ts) и дублируется в поле `entityRefs` на backend.
 */
export type EntityRefType = 'deal' | 'contact' | 'company' | 'order'

export interface EntityRef {
    type: EntityRefType
    id: string
    /** человекочитаемая метка (обязательна — деградация до текста на клиентах без чипов) */
    label: string
}

export interface PresenceVM {
    userId: string
    online: boolean
    lastSeenAt?: number
}

export interface ReadReceiptsVM {
    readBy: MemberVM[]
    readCount: number
    totalMembers: number
    aggregateOnly: boolean
}

export interface ProjectUnreadVM {
    projectId: string
    count: number
}

export interface UnreadCountVM {
    count: number
    byProject?: ProjectUnreadVM[]
}

/** Realtime-кадры (06-frontend-contract §4.2 / backend §3.20). */
export type ChatFrame =
    | { type: 'message'; conversationId: string; message: MessageVM }
    | { type: 'badge'; projectId?: string; unread?: number }
    | { type: 'presence'; conversationId: string; userId: string; state: 'online' | 'offline' }
    | { type: 'typing'; conversationId: string; userId: string }
    | { type: 'read'; conversationId: string; userId: string; lastReadSeq: number }

export type DisabledReason =
    | 'no_permission'
    | 'billing_readonly'
    | 'not_member'
    | 'module_disabled'

/** Универсальное состояние экрана (06-frontend-contract §3.5). */
export type ScreenState =
    | 'loading'
    | 'empty'
    | 'error'
    | 'no-permission'
    | 'not-member'
    | 'disabled-module'
    | 'billing-readonly'
    | 'ready'

/** Коды ошибок контракта (§6, FE-маппинг §3.5). */
export const CHAT_ERROR_CODES = {
    NOT_A_MEMBER: 'CHAT_NOT_A_MEMBER',
    FORBIDDEN_CROSS_ORG: 'CHAT_FORBIDDEN_CROSS_ORG',
    FORBIDDEN_NOT_AUTHOR: 'CHAT_FORBIDDEN_NOT_AUTHOR',
    EDIT_WINDOW_EXPIRED: 'CHAT_EDIT_WINDOW_EXPIRED',
    MODULE_DISABLED: 'CHAT_MODULE_DISABLED',
    RATE_LIMITED: 'CHAT_RATE_LIMITED',
} as const
