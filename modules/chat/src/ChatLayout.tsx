import { useCallback, useEffect, useRef, useState } from 'react'
import { Container } from '@fairflow/shared-ui'
import ConversationList, { type ListScopeFilter } from './ConversationList'
import MessageWindow from './MessageWindow'
import NewConversationDrawer from './NewConversationDrawer'
import StateView from './StateView'
import { useChatGate, useChatRealtime, useConversations, useConversationActions } from './useChat'
import { notifyChatError, notifySuccess } from './chatUi'
import type { MessageVM } from './chatTypes'

export interface ChatLayoutProps {
    currentUserId: string
    activeConversationId?: string
    anchorSeq?: number
    onSelectConversation: (id: string) => void
    /** пользователь покинул активную беседу — сброс выбранной беседы (FR-CHAT-6) */
    onLeaveConversation?: () => void
    /** имя пользователя по id (резолв — host members; в MVP fallback к id) */
    resolveName?: (userId: string) => string
    /** billing-readonly из host (06-frontend-contract §3.6) */
    billingReadonly?: boolean
}

/** Двухпанельный экран чата (список + окно) — 06-frontend-contract §1.3/§3. */
const ChatLayout = ({
    currentUserId,
    activeConversationId,
    anchorSeq,
    onSelectConversation,
    onLeaveConversation,
    resolveName,
    billingReadonly,
}: ChatLayoutProps) => {
    const gate = useChatGate()
    const { create: createConversation } = useConversationActions(gate.projectId)
    const [scopeFilter, setScopeFilter] = useState<ListScopeFilter>('all')
    const [createOpen, setCreateOpen] = useState(false)
    const { conversations } = useConversations({
        projectId: gate.projectId,
        scopeFilter: 'current',
        enabled: gate.enabled,
    })
    const conversationIds = conversations.map((c) => c.id)

    // realtime-приёмники активного окна (регистрируются дочерним MessageWindow)
    const messageSink = useRef<((m: MessageVM) => void) | null>(null)
    const presenceSink = useRef<((userId: string, online: boolean) => void) | null>(null)

    const { transport, sendTyping } = useChatRealtime({
        projectId: gate.projectId,
        enabled: gate.enabled,
        activeConversationId,
        conversationIds,
        onMessage: (msg) => {
            if (msg.conversationId === activeConversationId) messageSink.current?.(msg)
        },
        onPresence: (convId, userId, online) => {
            if (convId === activeConversationId) presenceSink.current?.(userId, online)
        },
    })

    // Баннер «нет связи» показываем только если соединения нет дольше grace-окна
    // (~2с): подавляем мигание во время начального connect/реконнекта.
    const connected = transport === 'ws' || transport === 'sse'
    const [showOffline, setShowOffline] = useState(false)
    useEffect(() => {
        if (connected) {
            setShowOffline(false)
            return
        }
        const t = setTimeout(() => setShowOffline(true), 2000)
        return () => clearTimeout(t)
    }, [connected])

    const registerMessageSink = useCallback((fn: (m: MessageVM) => void) => {
        messageSink.current = fn
    }, [])
    const registerPresenceSink = useCallback((fn: (userId: string, online: boolean) => void) => {
        presenceSink.current = fn
    }, [])

    const openSelfNotes = useCallback(async () => {
        if (!currentUserId) return
        try {
            const conv = await createConversation({
                type: 'dm',
                peerUserId: currentUserId,
            })
            notifySuccess('Заметки себе созданы')
            onSelectConversation(conv.id)
            setCreateOpen(false)
        } catch (err) {
            notifyChatError(err)
        }
    }, [createConversation, currentUserId, onSelectConversation])

    if (!gate.moduleEnabled) return <StateView kind="disabled-module" />
    if (!gate.canRead) return <StateView kind="no-permission" />

    return (
        <Container className="h-full">
            {!connected && showOffline && (
                <div
                    style={{
                        background: '#fef3c7',
                        color: '#92400e',
                        fontSize: 12,
                        padding: '4px 12px',
                        textAlign: 'center',
                    }}
                >
                    Соединение с чатом потеряно, переподключение…
                </div>
            )}
            {transport === 'sse' && (
                <div
                    style={{
                        background: '#eff6ff',
                        color: '#1e40af',
                        fontSize: 12,
                        padding: '4px 12px',
                        textAlign: 'center',
                    }}
                >
                    Резервный режим связи (SSE) — typing-индикаторы отключены
                </div>
            )}
            <div
                style={{
                    display: 'flex',
                    height: 'calc(100vh - 160px)',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: '#fff',
                }}
            >
                <div style={{ width: 320, borderRight: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column' }}>
                    <ConversationList
                        scopeFilter={scopeFilter}
                        onScopeChange={setScopeFilter}
                        projectId={gate.projectId}
                        activeConversationId={activeConversationId}
                        onSelect={onSelectConversation}
                        currentUserId={currentUserId}
                        resolveName={resolveName}
                        canRead={gate.canRead}
                        canWrite={gate.canWrite}
                        billingReadonly={billingReadonly}
                        onCreate={() => setCreateOpen(true)}
                        onSelfNotes={gate.canWrite && !billingReadonly ? openSelfNotes : undefined}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    {activeConversationId ? (
                        <MessageWindow
                            key={activeConversationId}
                            conversationId={activeConversationId}
                            currentUserId={currentUserId}
                            projectId={gate.projectId}
                            anchorSeq={anchorSeq}
                            canWrite={gate.canWrite}
                            canModerate={gate.canModerate}
                            canManage={gate.canManage}
                            billingReadonly={billingReadonly}
                            resolveName={resolveName}
                            onRegisterMessageSink={registerMessageSink}
                            onRegisterPresenceSink={registerPresenceSink}
                            onTyping={() => activeConversationId && sendTyping(activeConversationId)}
                            onLeaveConversation={onLeaveConversation}
                        />
                    ) : (
                        <StateView kind="empty" title="Выберите беседу" description="или начните новый диалог" />
                    )}
                </div>
            </div>

            <NewConversationDrawer
                open={createOpen}
                projectId={gate.projectId}
                currentUserId={currentUserId}
                canManage={gate.canManage}
                onClose={() => setCreateOpen(false)}
                onCreated={(conv) => onSelectConversation(conv.id)}
                onSelfNotes={openSelfNotes}
            />
        </Container>
    )
}

export default ChatLayout
