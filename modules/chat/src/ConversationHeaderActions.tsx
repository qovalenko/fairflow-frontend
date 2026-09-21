import { useState } from 'react'
import { Button } from '@fairflow/shared-ui'
import InviteMemberDrawer from './InviteMemberDrawer'
import { notifyChatError, notifySuccess } from './chatUi'
import { useConversationActions } from './useChat'
import type { ConversationType, MemberRole, MemberVM } from './chatTypes'

export interface ConversationHeaderActionsProps {
    conversationId: string
    conversationType: ConversationType
    conversationTitle?: string
    projectId?: string
    currentUserId: string
    members: MemberVM[]
    /** роль текущего пользователя в беседе */
    myRole?: MemberRole
    /** право chat:manage (управление составом) */
    canManage?: boolean
    resolveName?: (userId: string) => string
    /** состав беседы изменился (нужно перечитать участников/счётчик) */
    onMembersChanged: () => void
    /** пользователь покинул беседу — сброс выбранной беседы + обновление списка */
    onLeft: () => void
}

/**
 * Экшены заголовка беседы: «Пригласить участника» и «Покинуть беседу» (FR-CHAT-6).
 * Вынесено из MessageWindow отдельным компонентом, чтобы правки окна ограничить
 * заголовком (параллельная работа над зоной скролла).
 *
 * Права (docs/tz/contracts/chat.md §3.4 UpdateMembers): приглашать может только
 * owner/admin беседы с правом chat:manage (домен-гейт `me.role in {owner,admin}` +
 * gateway `@RequirePermission('chat','manage')`). Для DM состав неизменяем — обе
 * кнопки скрыты. Покинуть — доступно любому активному участнику группы/канала.
 */
const ConversationHeaderActions = ({
    conversationId,
    conversationType,
    conversationTitle,
    projectId,
    currentUserId,
    members,
    myRole,
    canManage,
    resolveName,
    onMembersChanged,
    onLeft,
}: ConversationHeaderActionsProps) => {
    const { leave } = useConversationActions(projectId)
    const [inviteOpen, setInviteOpen] = useState(false)
    const [confirmLeave, setConfirmLeave] = useState(false)
    const [leaving, setLeaving] = useState(false)

    // DM — состав фиксирован (2 участника, FR-CHAT-2): ни приглашения, ни выхода.
    if (conversationType === 'dm') return null

    const activeMemberIds = members.filter((m) => !m.leftAt).map((m) => m.userId)
    const isActiveMember = activeMemberIds.includes(currentUserId)
    const isOwnerOrAdmin = myRole === 'owner' || myRole === 'admin'
    // Приглашать может owner/admin с правом chat:manage (иначе домен вернёт PERMISSION_DENIED).
    const canInvite = !!canManage && isOwnerOrAdmin
    // Self-leave принят на BE: gateway DELETE /members без chat:manage, домен
    // chat.service.updateMembers пускает self-remove (remove == [self]) любому активному
    // участнику группы/канала (DM обрабатывается выше — return null). Последний активный
    // owner получит FAILED_PRECONDITION «Передайте владение перед выходом» (тост из BE).
    const canLeave = isActiveMember

    const handleLeave = async () => {
        setLeaving(true)
        try {
            await leave(conversationId, currentUserId)
            notifySuccess('Вы покинули беседу')
            setConfirmLeave(false)
            onLeft()
        } catch (e) {
            notifyChatError(e)
        } finally {
            setLeaving(false)
        }
    }

    return (
        <>
            {canInvite && (
                <Button
                    variant="plain"
                    onClick={() => setInviteOpen(true)}
                    style={{ fontSize: 13, padding: '4px 10px' }}
                >
                    Пригласить
                </Button>
            )}
            {canLeave && (
                <Button
                    variant="plain"
                    onClick={() => setConfirmLeave(true)}
                    style={{ fontSize: 13, padding: '4px 10px' }}
                >
                    Покинуть
                </Button>
            )}

            {inviteOpen && (
                <InviteMemberDrawer
                    open={inviteOpen}
                    conversationId={conversationId}
                    projectId={projectId}
                    currentUserId={currentUserId}
                    memberIds={activeMemberIds}
                    resolveName={resolveName}
                    onClose={() => setInviteOpen(false)}
                    onInvited={onMembersChanged}
                />
            )}

            {confirmLeave && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 60,
                    }}
                    onClick={() => !leaving && setConfirmLeave(false)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: 360,
                            background: '#fff',
                            borderRadius: 12,
                            padding: 20,
                            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                        }}
                    >
                        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                            Покинуть беседу?
                        </h3>
                        <p style={{ fontSize: 14, color: '#4b5563', marginBottom: 20 }}>
                            Вы перестанете получать сообщения в «{conversationTitle || 'Беседа'}».
                            Вернуться сможете только по приглашению участника.
                        </p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <Button variant="plain" onClick={() => setConfirmLeave(false)} disabled={leaving}>
                                Отмена
                            </Button>
                            <Button variant="solid" onClick={handleLeave} disabled={leaving}>
                                {leaving ? 'Выход…' : 'Покинуть'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

export default ConversationHeaderActions
