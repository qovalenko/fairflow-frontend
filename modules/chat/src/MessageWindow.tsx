import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@fairflow/shared-ui'
import MessageItem from './MessageItem'
import MessageComposer from './MessageComposer'
import PresenceIndicator from './PresenceIndicator'
import ConversationHeaderActions from './ConversationHeaderActions'
import StateView from './StateView'
import { conversationDisplayTitle } from './ConversationListItem'
import { notifyChatError, notifySuccess } from './chatUi'
import {
    useConversation,
    useMessages,
    usePresence,
    useConversationActions,
} from './useChat'
import type { MessageVM, DisabledReason } from './chatTypes'

export interface MessageWindowProps {
    conversationId: string
    currentUserId: string
    /** резолвнутый projectId (как в NewConversationDrawer) — для пикера членов проекта */
    projectId?: string
    anchorSeq?: number
    /** наблюдатель (FR-CHAT-48) ИЛИ billing-readonly → нет composer */
    readOnly?: boolean
    canWrite: boolean
    canModerate?: boolean
    canManage?: boolean
    billingReadonly?: boolean
    resolveName?: (userId: string) => string
    /** регистрация applyRealtimeMessage/presence для родителя (realtime fanout) */
    onRegisterMessageSink?: (apply: (m: MessageVM) => void) => void
    onRegisterPresenceSink?: (apply: (userId: string, online: boolean) => void) => void
    onTyping?: () => void
    /** пользователь покинул беседу — родитель сбрасывает активную беседу (FR-CHAT-6) */
    onLeaveConversation?: () => void
}

/** Окно сообщений (06-frontend-contract §3.2). keyset-пагинация вверх, MarkRead-on-view. */
const MessageWindow = ({
    conversationId,
    currentUserId,
    projectId,
    readOnly,
    canWrite,
    canModerate,
    canManage,
    billingReadonly,
    resolveName,
    onRegisterMessageSink,
    onRegisterPresenceSink,
    onTyping,
    onLeaveConversation,
}: MessageWindowProps) => {
    const {
        conversation,
        members,
        isLoading: convLoading,
        error: convError,
        notMember,
        refresh: refreshConversation,
    } = useConversation(conversationId)
    const {
        messages,
        isLoading,
        loadingMore,
        hasMore,
        error,
        loadMore,
        send,
        retry,
        edit,
        remove,
        applyRealtimeMessage,
    } = useMessages(conversationId)
    const { presence, applyPresence } = usePresence(conversationId)
    const { markRead } = useConversationActions(conversation?.scope.scopeId)

    const [replyTo, setReplyTo] = useState<MessageVM | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const lastMarkedSeq = useRef(0)
    // снимок геометрии перед prepend истории — для восстановления позиции после рендера
    const restoreRef = useRef<{ height: number; top: number } | null>(null)
    const prevLenRef = useRef(0)
    // fallback-кнопка, когда история есть, но лента короче контейнера (скролла нет)
    const [showTopFallback, setShowTopFallback] = useState(false)

    // регистрация realtime-приёмников у родителя
    useEffect(() => {
        onRegisterMessageSink?.(applyRealtimeMessage)
        onRegisterPresenceSink?.(applyPresence)
    }, [applyRealtimeMessage, applyPresence, onRegisterMessageSink, onRegisterPresenceSink])

    // Подгрузка истории вверх: запоминаем геометрию → грузим → в layout-effect
    // корректируем scrollTop, чтобы вьюпорт не прыгнул. Если ничего не добавили — снимок сбрасываем.
    const handleLoadMore = useCallback(async () => {
        const el = scrollRef.current
        if (!el || loadingMore || !hasMore) return
        restoreRef.current = { height: el.scrollHeight, top: el.scrollTop }
        const added = await loadMore()
        if (!added) restoreRef.current = null
    }, [loadMore, loadingMore, hasMore])

    // Автоподгрузка при приближении к верху ленты (порог 150px). Scroll-handler
    // не срабатывает без скроллбара ⇒ на короткой ленте цикла нет (см. fallback ниже).
    const handleScroll = useCallback(() => {
        const el = scrollRef.current
        if (!el) return
        if (el.scrollTop <= 150 && hasMore && !loadingMore) void handleLoadMore()
    }, [hasMore, loadingMore, handleLoadMore])

    // Управление позицией скролла после изменения списка:
    //  - prepend истории (restoreRef установлен) → сохраняем визуальную позицию;
    //  - новое сообщение в хвосте (рост длины) → прижимаем к низу (как раньше);
    //  - пересчёт fallback: история есть, но скролла нет.
    useLayoutEffect(() => {
        const el = scrollRef.current
        if (!el) return
        const restore = restoreRef.current
        if (restore) {
            el.scrollTop = el.scrollHeight - restore.height + restore.top
            restoreRef.current = null
        } else if (messages.length > prevLenRef.current) {
            el.scrollTop = el.scrollHeight
        }
        prevLenRef.current = messages.length
        setShowTopFallback(hasMore && el.scrollHeight <= el.clientHeight + 1)
    }, [messages, hasMore])

    // MarkRead до последнего видимого seq (FR-CHAT-18)
    useEffect(() => {
        const realMsgs = messages.filter((m) => !m.pending && m.seq < Number.MAX_SAFE_INTEGER)
        if (realMsgs.length === 0) return
        const maxSeq = realMsgs[realMsgs.length - 1].seq
        if (maxSeq > lastMarkedSeq.current) {
            lastMarkedSeq.current = maxSeq
            void markRead(conversationId, maxSeq).catch(() => {})
        }
    }, [messages, conversationId, markRead])

    const senderNames = useMemo(() => resolveName, [resolveName])

    const handleSend = async (draft: Parameters<typeof send>[0]) => {
        try {
            await send(draft, { senderId: currentUserId })
            setReplyTo(null)
        } catch (e) {
            notifyChatError(e)
        }
    }

    const handleEdit = async (id: string, text: string) => {
        try {
            await edit(id, text)
        } catch (e) {
            notifyChatError(e)
        }
    }

    const handleDelete = async (id: string) => {
        try {
            await remove(id)
            notifySuccess('Сообщение удалено')
        } catch (e) {
            notifyChatError(e)
        }
    }

    if (notMember) return <StateView kind="not-member" />
    if (convError) return <StateView kind="error" />
    if (convLoading && !conversation) return <StateView kind="loading" />

    const isReadOnly = readOnly || billingReadonly || !canWrite
    const disabledReason: DisabledReason | undefined = !canWrite
        ? 'no_permission'
        : billingReadonly
          ? 'billing_readonly'
          : readOnly
            ? 'not_member'
            : undefined

    const findReplyPreview = (m: MessageVM) => {
        if (!m.replyToId) return null
        const target = messages.find((x) => x.id === m.replyToId)
        if (!target) return { text: '…', deleted: false }
        return {
            text: target.text,
            senderName: senderNames?.(target.senderId),
            deleted: !!target.deletedAt || target.kind === 'system',
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 16px',
                    borderBottom: '1px solid #f3f4f6',
                }}
            >
                <strong style={{ fontSize: 15 }}>
                    {conversation
                        ? conversationDisplayTitle(
                              { ...conversation, members },
                              currentUserId,
                              resolveName,
                          )
                        : 'Беседа'}
                </strong>
                {(() => {
                    const peer =
                        conversation?.type === 'dm'
                            ? presence.find(
                                  (p) => p.userId !== currentUserId && members.some((m) => m.userId === p.userId),
                              )
                            : presence.find((p) => p.online && p.userId !== currentUserId)
                    if (!peer) return null
                    return (
                        <PresenceIndicator
                            state={peer.online ? 'online' : 'offline'}
                            lastSeenAt={peer.lastSeenAt}
                        />
                    )
                })()}
                <span style={{ fontSize: 12, color: '#9ca3af' }}>
                    {members.filter((m) => !m.leftAt).length} участн.
                </span>
                {conversation && (
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <ConversationHeaderActions
                            conversationId={conversationId}
                            conversationType={conversation.type}
                            conversationTitle={conversation.title}
                            projectId={projectId}
                            currentUserId={currentUserId}
                            members={members}
                            myRole={conversation.myRole}
                            canManage={canManage}
                            resolveName={resolveName}
                            onMembersChanged={() => void refreshConversation()}
                            onLeft={() => onLeaveConversation?.()}
                        />
                    </div>
                )}
            </div>

            <div
                ref={scrollRef}
                onScroll={handleScroll}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '8px 0',
                    // Лента прижата к низу: при коротком списке сообщения у нижнего края
                    // (как в мессенджере), при переполнении — обычный скролл. marginTop:auto
                    // на первом элементе забирает свободное место сверху.
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                {messages.length > 0 && (
                    // Верхний якорь (marginTop:auto прижимает контент к низу на короткой ленте):
                    // индикатор автоподгрузки истории + fallback-кнопка, когда скролла нет.
                    <div style={{ textAlign: 'center', padding: 8, marginTop: 'auto', minHeight: 20 }}>
                        {loadingMore ? (
                            <span style={{ fontSize: 12, color: '#9ca3af' }}>Загрузка истории…</span>
                        ) : showTopFallback ? (
                            <Button variant="plain" onClick={() => void handleLoadMore()}>
                                Загрузить ещё
                            </Button>
                        ) : null}
                    </div>
                )}
                {isLoading && messages.length === 0 ? (
                    <StateView kind="loading" />
                ) : error && messages.length === 0 ? (
                    <StateView kind="error" />
                ) : messages.length === 0 ? (
                    <StateView kind="empty" title="Начните беседу" />
                ) : (
                    messages.map((m) => (
                        <MessageItem
                            key={m.clientMessageId || m.id}
                            message={m}
                            isOwn={m.senderId === currentUserId}
                            senderName={senderNames?.(m.senderId)}
                            canEdit={canWrite && m.senderId === currentUserId}
                            canModerate={canModerate}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onReply={canWrite ? setReplyTo : undefined}
                            onRetry={(msg) => void retry(msg)}
                            replyPreview={findReplyPreview(m)}
                        />
                    ))
                )}
            </div>

            {isReadOnly ? (
                <div
                    style={{
                        padding: '12px 16px',
                        borderTop: '1px solid #f3f4f6',
                        color: '#9ca3af',
                        fontSize: 13,
                        textAlign: 'center',
                    }}
                >
                    {billingReadonly
                        ? 'Режим только для чтения (биллинг)'
                        : readOnly
                          ? 'Только просмотр'
                          : 'Нет права на отправку'}
                </div>
            ) : (
                <MessageComposer
                    conversationId={conversationId}
                    scope={conversation?.scope ?? { kind: 'project', scopeId: '' }}
                    members={members}
                    resolveName={resolveName}
                    replyTo={replyTo}
                    onCancelReply={() => setReplyTo(null)}
                    disabledReason={disabledReason}
                    onSend={handleSend}
                    onTyping={onTyping}
                />
            )}
        </div>
    )
}

export default MessageWindow
