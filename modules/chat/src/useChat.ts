/**
 * SWR-хуки чата (06-frontend-contract §4.1) + realtime-интеграция (§4.2).
 *
 * Все SWR-ключи включают projectId (изоляция; инвалидируются при смене проекта —
 * паттерн useNotifications/useResolvedProjectId). Гейтинг — UX, истина на be (BR-SHELL-4).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import type { AxiosError } from 'axios'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { useProjectStore, getEnabledModules } from '@/store/projectStore'
// chatErrorCode / newClientMessageId — общие утилиты из host-клиента чата
// (services/ChatService), чтобы не дублировать реализацию (задача #25).
import {
    chatErrorCode,
    isChatModuleDisabledError,
    newClientMessageId,
} from '@/services/ChatService'
import {
    apiListConversations,
    apiGetConversation,
    apiGetMessages,
    apiGetUnreadCount,
    apiGetPresence,
    apiGetReadReceipts,
    apiSendMessage,
    apiEditMessage,
    apiDeleteMessage,
    apiMarkRead,
    apiMarkAllRead,
    apiCreateConversation,
    apiArchiveConversation,
    apiUpdateMembers,
} from './chatService'
import { ChatRealtimeClient } from './chatRealtimeClient'
import type {
    ConversationVM,
    MessageVM,
    MemberVM,
    OutgoingMessage,
    PresenceVM,
    ReadReceiptsVM,
    UnreadCountVM,
    ChatFrame,
} from './chatTypes'

const MODULE_ID = 'chat'

/** Размер страницы истории (keyset). Порция < лимита ⇒ достигнут край истории. */
const MESSAGES_PAGE_LIMIT = 50

// chatErrorCode — реэкспорт общей утилиты host-клиента (дедуп, задача #25).
export { chatErrorCode }

export function chatErrorStatus(err: unknown): number | undefined {
    const ax = err as AxiosError | undefined
    return ax?.response?.status
}

/** UX-гейт модуля: enablement (Contextual UI) + право chat:read. */
export function useChatGate() {
    const projectId = useResolvedProjectId()
    const currentProject = useProjectStore((s) => s.currentProject)
    const enabledModules = useMemo(() => getEnabledModules(currentProject), [currentProject])
    const moduleEnabled = enabledModules.includes(MODULE_ID)
    const canRead = usePermission('chat', 'read')
    const canWrite = usePermission('chat', 'write')
    const canManage = usePermission('chat', 'manage')
    const canModerate = usePermission('chat', 'moderate')
    return {
        projectId,
        moduleEnabled,
        canRead,
        canWrite,
        canManage,
        canModerate,
        enabled: moduleEnabled && canRead,
    }
}

// newClientMessageId импортируется из host-клиента чата (дедуп, задача #25).

// ─── Список бесед (FR-CHAT-1) ─────────────────────────────────────────────────

export function useConversations(opts: {
    projectId?: string
    scopeFilter?: 'current' | 'all'
    includeArchived?: boolean
    enabled?: boolean
}) {
    const { projectId, scopeFilter = 'current', includeArchived = false, enabled = true } = opts
    const key = enabled
        ? (['chat/conversations', projectId, scopeFilter, includeArchived] as const)
        : null
    const { data, error, isLoading, mutate } = useSWR<ConversationVM[]>(
        key,
        () => apiListConversations({ projectId, scopeFilter, includeArchived }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    return {
        conversations: data ?? [],
        isLoading,
        error,
        moduleDisabled: isChatModuleDisabledError(error),
        refresh: () => mutate(),
    }
}

// ─── Одна беседа + состав (FR-CHAT-1) ─────────────────────────────────────────

export function useConversation(conversationId?: string, enabled = true) {
    const projectId = useResolvedProjectId()
    const key =
        enabled && conversationId
            ? (['chat/conversation', projectId, conversationId] as const)
            : null
    const { data, error, isLoading, mutate } = useSWR<ConversationVM & { members: MemberVM[] }>(
        key,
        () => apiGetConversation(conversationId as string, projectId),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    return {
        conversation: data ?? null,
        members: data?.members ?? [],
        isLoading,
        error,
        notMember: chatErrorCode(error) === 'CHAT_NOT_A_MEMBER',
        refresh: () => mutate(),
    }
}

// ─── История сообщений (FR-CHAT-12, keyset вверх) + optimistic send (FR-CHAT-41)

export function useMessages(conversationId?: string, enabled = true) {
    const projectId = useResolvedProjectId()
    const key =
        enabled && conversationId
            ? (['chat/messages', projectId, conversationId] as const)
            : null
    // hasMore: пока первая порция полна (== лимит) — предполагаем, что история есть.
    // Уточняется на каждой загрузке: порция < лимита ⇒ край истории.
    const [hasMore, setHasMore] = useState(true)
    const { data, error, isLoading, mutate } = useSWR<MessageVM[]>(
        key,
        () =>
            apiGetMessages({
                conversationId: conversationId as string,
                limit: MESSAGES_PAGE_LIMIT,
                projectId,
            }).then((msgs) => [...msgs].sort(bySeqAsc)),
        {
            revalidateOnFocus: false,
            shouldRetryOnError: false,
            onSuccess: (d) => setHasMore(d.length >= MESSAGES_PAGE_LIMIT),
        },
    )
    const messages = data ?? []
    const [loadingMore, setLoadingMore] = useState(false)

    /** Подгрузка предыдущей страницы (keyset по seq, не skip/limit). Возвращает кол-во добавленных. */
    const loadMore = useCallback(async () => {
        if (!conversationId || messages.length === 0) return 0
        const minSeq = Math.min(...messages.map((m) => m.seq))
        setLoadingMore(true)
        try {
            const older = await apiGetMessages({
                conversationId,
                beforeSeq: minSeq,
                limit: MESSAGES_PAGE_LIMIT,
                projectId,
            })
            if (older.length) {
                await mutate((cur) => mergeMessages(cur ?? [], older), { revalidate: false })
            }
            if (older.length < MESSAGES_PAGE_LIMIT) setHasMore(false)
            return older.length
        } finally {
            setLoadingMore(false)
        }
    }, [conversationId, messages, mutate, projectId])

    /** Оптимистичная отправка с дедупом по clientMessageId (§4.3). */
    const send = useCallback(
        async (
            draft: Omit<OutgoingMessage, 'clientMessageId'> & { clientMessageId?: string },
            meta: { senderId: string },
        ) => {
            if (!conversationId) return
            const clientMessageId = draft.clientMessageId ?? newClientMessageId()
            const optimistic: MessageVM = {
                id: `optimistic_${clientMessageId}`,
                seq: Number.MAX_SAFE_INTEGER,
                conversationId,
                senderId: meta.senderId,
                senderType: 'user',
                kind: 'text',
                text: draft.text,
                attachments: draft.attachments,
                mentionIds: draft.mentionIds,
                replyToId: draft.replyToId ?? null,
                clientMessageId,
                sentAt: Date.now(),
                pending: true,
            }
            await mutate((cur) => [...(cur ?? []), optimistic], { revalidate: false })
            try {
                const saved = await apiSendMessage(conversationId, { ...draft, clientMessageId })
                await mutate((cur) => replaceOptimistic(cur ?? [], clientMessageId, saved), {
                    revalidate: false,
                })
                return saved
            } catch (e) {
                await mutate(
                    (cur) =>
                        (cur ?? []).map((m) =>
                            m.clientMessageId === clientMessageId
                                ? { ...m, pending: false, failed: true }
                                : m,
                        ),
                    { revalidate: false },
                )
                throw e
            }
        },
        [conversationId, mutate],
    )

    /** Повтор отправки failed-сообщения тем же clientMessageId (no-op-дедуп на be). */
    const retry = useCallback(
        async (failed: MessageVM) => {
            if (!conversationId || !failed.clientMessageId) return
            await mutate(
                (cur) =>
                    (cur ?? []).map((m) =>
                        m.clientMessageId === failed.clientMessageId
                            ? { ...m, failed: false, pending: true }
                            : m,
                    ),
                { revalidate: false },
            )
            try {
                const saved = await apiSendMessage(conversationId, {
                    clientMessageId: failed.clientMessageId,
                    text: failed.text,
                    attachments: failed.attachments,
                    mentionIds: failed.mentionIds,
                    replyToId: failed.replyToId ?? null,
                })
                await mutate(
                    (cur) => replaceOptimistic(cur ?? [], failed.clientMessageId as string, saved),
                    { revalidate: false },
                )
            } catch {
                await mutate(
                    (cur) =>
                        (cur ?? []).map((m) =>
                            m.clientMessageId === failed.clientMessageId
                                ? { ...m, pending: false, failed: true }
                                : m,
                        ),
                    { revalidate: false },
                )
            }
        },
        [conversationId, mutate],
    )

    const edit = useCallback(
        async (messageId: string, text: string) => {
            const saved = await apiEditMessage(messageId, text)
            await mutate(
                (cur) => (cur ?? []).map((m) => (m.id === messageId ? saved : m)),
                { revalidate: false },
            )
            return saved
        },
        [mutate],
    )

    const remove = useCallback(
        async (messageId: string) => {
            const tombstone = await apiDeleteMessage(messageId)
            await mutate(
                (cur) => (cur ?? []).map((m) => (m.id === messageId ? tombstone : m)),
                { revalidate: false },
            )
            return tombstone
        },
        [mutate],
    )

    /** Применение realtime message-кадра (дедуп по clientMessageId/id). */
    const applyRealtimeMessage = useCallback(
        (msg: MessageVM) => {
            void mutate((cur) => mergeRealtime(cur ?? [], msg), { revalidate: false })
        },
        [mutate],
    )

    return {
        messages,
        isLoading,
        loadingMore,
        hasMore,
        error,
        notMember: chatErrorCode(error) === 'CHAT_NOT_A_MEMBER',
        loadMore,
        send,
        retry,
        edit,
        remove,
        applyRealtimeMessage,
        refresh: () => mutate(),
    }
}

// ─── Счётчик непрочитанного (FR-CHAT-20,47) ──────────────────────────────────

export function useUnreadCount(opts: {
    projectId?: string
    scopeFilter?: 'current' | 'all'
    enabled?: boolean
}) {
    const { projectId, scopeFilter, enabled = true } = opts
    const key = enabled ? (['chat/unread', projectId, scopeFilter] as const) : null
    const { data, error, isLoading, mutate } = useSWR<UnreadCountVM>(
        key,
        () => apiGetUnreadCount({ projectId, scopeFilter }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    return {
        count: data?.count ?? 0,
        byProject: data?.byProject ?? [],
        isLoading,
        error,
        refresh: () => mutate(),
    }
}

// ─── Presence (FR-CHAT-23, lazy) ──────────────────────────────────────────────

export function usePresence(conversationId?: string, enabled = true) {
    const key =
        enabled && conversationId ? (['chat/presence', conversationId] as const) : null
    const { data, mutate } = useSWR<PresenceVM[]>(
        key,
        () => apiGetPresence(conversationId as string),
        { revalidateOnFocus: false, shouldRetryOnError: false, refreshInterval: 30_000 },
    )
    const applyPresence = useCallback(
        (userId: string, online: boolean) => {
            void mutate(
                (cur) => {
                    const list = cur ?? []
                    const idx = list.findIndex((p) => p.userId === userId)
                    const lastSeenAt = online ? undefined : Date.now()
                    if (idx >= 0) {
                        const next = [...list]
                        next[idx] = { ...next[idx], online, ...(online ? {} : { lastSeenAt }) }
                        return next
                    }
                    return [...list, { userId, online, ...(lastSeenAt ? { lastSeenAt } : {}) }]
                },
                { revalidate: false },
            )
        },
        [mutate],
    )
    return { presence: data ?? [], applyPresence }
}

// ─── Read-receipts (FR-CHAT-21) ───────────────────────────────────────────────

export function useReadReceipts(conversationId?: string, uptoSeq?: number, enabled = true) {
    const key =
        enabled && conversationId && uptoSeq != null
            ? (['chat/receipts', conversationId, uptoSeq] as const)
            : null
    const { data } = useSWR<ReadReceiptsVM>(
        key,
        () => apiGetReadReceipts(conversationId as string, uptoSeq as number),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    return data ?? null
}

// ─── Мутации беседы (создание / архив / read-all) ─────────────────────────────

export function useConversationActions(projectId?: string) {
    const { mutate } = useSWRConfig()
    const invalidateLists = useCallback(() => {
        void mutate((k) => Array.isArray(k) && k[0] === 'chat/conversations')
        void mutate((k) => Array.isArray(k) && k[0] === 'chat/unread')
    }, [mutate])

    const create = useCallback(
        async (body: Parameters<typeof apiCreateConversation>[0]) => {
            const conv = await apiCreateConversation({ ...body, projectId: body.projectId ?? projectId })
            invalidateLists()
            return conv
        },
        [invalidateLists, projectId],
    )
    const archive = useCallback(
        async (id: string) => {
            const conv = await apiArchiveConversation(id)
            invalidateLists()
            return conv
        },
        [invalidateLists],
    )
    const markRead = useCallback(
        async (id: string, uptoSeq: number) => {
            const r = await apiMarkRead(id, uptoSeq)
            invalidateLists()
            return r
        },
        [invalidateLists],
    )
    const markAllRead = useCallback(async () => {
        const r = await apiMarkAllRead(projectId)
        invalidateLists()
        return r
    }, [invalidateLists, projectId])

    /**
     * Пригласить участников (FR-CHAT-6, UpdateMembers add). Инвалидируем списки бесед +
     * карточку самой беседы (её members/счётчик), чтобы состав/«N участн.» обновились.
     */
    const invite = useCallback(
        async (id: string, userIds: string[]) => {
            const conv = await apiUpdateMembers(id, { add: userIds })
            invalidateLists()
            void mutate((k) => Array.isArray(k) && k[0] === 'chat/conversation' && k[2] === id)
            return conv
        },
        [invalidateLists, mutate],
    )

    /**
     * Покинуть беседу (FR-CHAT-6, UpdateMembers remove self). После выхода self больше
     * не член — беседа выпадает из списка, поэтому инвалидируем списки.
     */
    const leave = useCallback(
        async (id: string, userId: string) => {
            // DELETE-роут: ровно {remove:[self]} — так gateway распознаёт self-leave и
            // не требует chat:manage. Никаких add/roleChanges (иначе PERMISSION_DENIED).
            const conv = await apiUpdateMembers(id, { remove: [userId] }, 'delete')
            invalidateLists()
            return conv
        },
        [invalidateLists],
    )

    return { create, archive, markRead, markAllRead, invite, leave }
}

// ─── Realtime-подписка (06-frontend-contract §4.2) ────────────────────────────

export function useChatRealtime(opts: {
    projectId?: string
    enabled: boolean
    activeConversationId?: string
    conversationIds?: string[]
    onMessage?: (msg: MessageVM) => void
    onPresence?: (conversationId: string, userId: string, online: boolean) => void
}) {
    const { projectId, enabled, activeConversationId, conversationIds, onMessage, onPresence } = opts
    const { mutate } = useSWRConfig()
    const clientRef = useRef<ChatRealtimeClient | null>(null)
    const [transport, setTransport] = useState<'connecting' | 'ws' | 'sse' | 'disconnected'>(
        'connecting',
    )
    const cbRef = useRef({ onMessage, onPresence })
    cbRef.current = { onMessage, onPresence }

    useEffect(() => {
        if (!enabled) return
        const client = new ChatRealtimeClient({
            projectId,
            onStatus: setTransport,
            onReconnect: () => {
                // догон пропущенного — ревалидация всех chat-ключей
                void mutate((k) => Array.isArray(k) && String(k[0]).startsWith('chat/'))
            },
            onFrame: (frame: ChatFrame) => {
                switch (frame.type) {
                    case 'message':
                        cbRef.current.onMessage?.(frame.message)
                        void mutate((k) => Array.isArray(k) && k[0] === 'chat/conversations')
                        void mutate((k) => Array.isArray(k) && k[0] === 'chat/unread')
                        break
                    case 'badge':
                        void mutate((k) => Array.isArray(k) && k[0] === 'chat/unread')
                        break
                    case 'presence':
                        cbRef.current.onPresence?.(
                            frame.conversationId,
                            frame.userId,
                            frame.state === 'online',
                        )
                        break
                    case 'read':
                        void mutate(
                            (k) =>
                                Array.isArray(k) &&
                                k[0] === 'chat/receipts' &&
                                k[1] === frame.conversationId,
                        )
                        break
                    case 'typing':
                        // v1.x — эфемерно, не материализуем в MVP
                        break
                }
            },
        })
        clientRef.current = client
        client.connect()
        return () => {
            client.close()
            clientRef.current = null
        }
    }, [enabled, projectId, mutate])

    useEffect(() => {
        if (!enabled) return
        const ids = new Set(conversationIds ?? [])
        if (activeConversationId) ids.add(activeConversationId)
        clientRef.current?.setSubscribedConversations([...ids])
    }, [enabled, conversationIds, activeConversationId])

    // open-state сигнал при смене активной беседы (FR-CHAT-33)
    useEffect(() => {
        clientRef.current?.signalOpen(activeConversationId ?? null)
    }, [activeConversationId])

    const sendTyping = useCallback((conversationId: string) => {
        clientRef.current?.sendTyping(conversationId)
    }, [])

    return { transport, sendTyping }
}

// ─── Внутренние merge-утилиты ─────────────────────────────────────────────────

function bySeqAsc(a: MessageVM, b: MessageVM): number {
    return a.seq - b.seq
}

function mergeMessages(existing: MessageVM[], older: MessageVM[]): MessageVM[] {
    const ids = new Set(existing.map((m) => m.id))
    const add = older.filter((m) => !ids.has(m.id))
    return [...add, ...existing].sort(bySeqAsc)
}

function replaceOptimistic(
    list: MessageVM[],
    clientMessageId: string,
    saved: MessageVM,
): MessageVM[] {
    let replaced = false
    const next = list.map((m) => {
        if (m.clientMessageId === clientMessageId) {
            replaced = true
            return saved
        }
        return m
    })
    if (!replaced && !next.some((m) => m.id === saved.id)) next.push(saved)
    return next.sort(bySeqAsc)
}

function mergeRealtime(list: MessageVM[], msg: MessageVM): MessageVM[] {
    // дедуп: по clientMessageId (наш optimistic) либо по id (чужое сообщение)
    if (msg.clientMessageId && list.some((m) => m.clientMessageId === msg.clientMessageId)) {
        return list.map((m) => (m.clientMessageId === msg.clientMessageId ? msg : m)).sort(bySeqAsc)
    }
    if (list.some((m) => m.id === msg.id)) {
        return list.map((m) => (m.id === msg.id ? msg : m)).sort(bySeqAsc)
    }
    return [...list, msg].sort(bySeqAsc)
}
