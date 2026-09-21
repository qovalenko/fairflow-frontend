import dayjs from 'dayjs'
import { Avatar } from '@fairflow/shared-ui'
import UnreadBadge from './UnreadBadge'
import { qa } from './qa'
import type { ConversationVM } from './chatTypes'

export interface ConversationListItemProps {
    conversation: ConversationVM
    active?: boolean
    onSelect: (id: string) => void
    currentUserId?: string
    resolveName?: (userId: string) => string
}

const typeLabel: Record<ConversationVM['type'], string> = {
    dm: 'Личный',
    group: 'Группа',
    project_channel: 'Канал',
}

/** FR-CHAT-030: DM без peer (единственный участник = текущий пользователь). */
export function isSelfDmConversation(
    conversation: Pick<ConversationVM, 'type' | 'members'>,
    currentUserId?: string,
): boolean {
    if (conversation.type !== 'dm') return false
    const members = conversation.members ?? []
    const peer = members.find((m) => m.userId && m.userId !== currentUserId)
    return !peer && members.some((m) => m.userId === currentUserId)
}

export function conversationDisplayTitle(
    conversation: Pick<ConversationVM, 'title' | 'type' | 'members'>,
    currentUserId?: string,
    resolveName?: (userId: string) => string,
): string {
    const { title, type } = conversation
    const peer =
        type === 'dm'
            ? (conversation.members ?? []).find((m) => m.userId && m.userId !== currentUserId)
            : undefined
    const resolvedPeer = peer?.userId ? resolveName?.(peer.userId) : undefined
    const peerName = resolvedPeer && resolvedPeer !== peer?.userId ? resolvedPeer : undefined
    return title || (isSelfDmConversation(conversation, currentUserId) ? 'Заметки себе' : undefined) || peerName || typeLabel[type]
}

const ConversationListItem = ({
    conversation,
    active,
    onSelect,
    currentUserId,
    resolveName,
}: ConversationListItemProps) => {
    const { id, lastMessage, lastMessageAt, unreadCount, avatarUrl, archivedAt } = conversation
    // DM без своего title → имя собеседника; self-DM → «Заметки себе» (FR-CHAT-030).
    const displayTitle = conversationDisplayTitle(conversation, currentUserId, resolveName)
    return (
        <button
            type="button"
            onClick={() => onSelect(id)}
            {...qa('chat.list.row', { conversation: id })}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 12px',
                border: 'none',
                borderBottom: '1px solid #f3f4f6',
                background: active ? '#eef2ff' : 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
            }}
        >
            <Avatar src={avatarUrl} alt={displayTitle} className="h-9 w-9 rounded-full bg-gray-200" />
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span
                        style={{
                            fontWeight: unreadCount > 0 ? 700 : 500,
                            fontSize: 14,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {displayTitle}
                        {archivedAt ? ' (архив)' : ''}
                    </span>
                    {lastMessageAt > 0 && (
                        <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
                            {dayjs(lastMessageAt).format('HH:mm')}
                        </span>
                    )}
                </span>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                    <span
                        style={{
                            fontSize: 12,
                            color: '#6b7280',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                        }}
                    >
                        {lastMessage?.kind === 'system'
                            ? 'системное сообщение'
                            : lastMessage?.text || 'Нет сообщений'}
                    </span>
                    <UnreadBadge count={unreadCount} />
                </span>
            </span>
        </button>
    )
}

export default ConversationListItem
