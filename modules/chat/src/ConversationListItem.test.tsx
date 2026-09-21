import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConversationListItem, {
    conversationDisplayTitle,
    isSelfDmConversation,
} from './ConversationListItem'
import type { ConversationVM } from './chatTypes'

const conv = (over: Partial<ConversationVM> = {}): ConversationVM => ({
    id: 'c1',
    type: 'dm',
    title: '',
    scope: { kind: 'project', scopeId: 'p1' },
    lastMessageAt: Date.now(),
    unreadCount: 0,
    members: [{ userId: 'u2', role: 'member' }],
    lastMessage: { id: 'm1', text: 'Привет', senderId: 'u2', sentAt: Date.now(), kind: 'text' },
    ...over,
})

describe('conversationDisplayTitle / isSelfDmConversation', () => {
    it('self-DM → «Заметки себе»', () => {
        const c = conv({
            members: [{ userId: 'u1', role: 'owner' }],
        })
        expect(isSelfDmConversation(c, 'u1')).toBe(true)
        expect(conversationDisplayTitle(c, 'u1')).toBe('Заметки себе')
    })

    it('DM с peer → resolveName или тип', () => {
        const c = conv({ members: [{ userId: 'u2', role: 'member' }] })
        expect(conversationDisplayTitle(c, 'u1', (id) => (id === 'u2' ? 'Пётр' : id))).toBe('Пётр')
    })

    it('group с title', () => {
        expect(conversationDisplayTitle({ type: 'group', title: 'Команда', members: [] })).toBe('Команда')
    })
})

describe('ConversationListItem', () => {
    it('клик вызывает onSelect с id беседы', () => {
        const onSelect = vi.fn()
        render(
            <ConversationListItem
                conversation={conv({ unreadCount: 3 })}
                onSelect={onSelect}
                currentUserId="u1"
                resolveName={(id) => (id === 'u2' ? 'Пётр' : id)}
            />,
        )
        expect(screen.getByText('Пётр')).toBeInTheDocument()
        expect(screen.getByText('Привет')).toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button'))
        expect(onSelect).toHaveBeenCalledWith('c1')
    })

    it('active подсветка и архив в заголовке', () => {
        render(
            <ConversationListItem
                conversation={conv({ title: 'Канал', type: 'project_channel', archivedAt: 1 })}
                active
                onSelect={vi.fn()}
            />,
        )
        expect(screen.getByText(/Канал \(архив\)/)).toBeInTheDocument()
    })

    it('system lastMessage → «системное сообщение»', () => {
        render(
            <ConversationListItem
                conversation={conv({
                    lastMessage: { id: 's1', text: '', senderId: 'sys', sentAt: 0, kind: 'system' },
                })}
                onSelect={vi.fn()}
            />,
        )
        expect(screen.getByText('системное сообщение')).toBeInTheDocument()
    })
})
