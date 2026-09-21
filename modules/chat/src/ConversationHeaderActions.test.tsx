import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ConversationHeaderActions from './ConversationHeaderActions'
import type { MemberVM } from './chatTypes'

const leave = vi.fn()

vi.mock('./useChat', () => ({
    useConversationActions: () => ({ leave }),
}))
vi.mock('./InviteMemberDrawer', () => ({
    default: ({ open }: { open: boolean }) => (open ? <div>DRAWER: invite</div> : null),
}))
vi.mock('./chatUi', () => ({
    notifyChatError: vi.fn(),
    notifySuccess: vi.fn(),
}))

const members: MemberVM[] = [
    { userId: 'u1', role: 'owner' },
    { userId: 'u2', role: 'member' },
]

describe('ConversationHeaderActions', () => {
    beforeEach(() => {
        leave.mockResolvedValue({})
    })

    it('DM: не показывает кнопок (состав фиксирован)', () => {
        const { container } = render(
            <ConversationHeaderActions
                conversationId="c1"
                conversationType="dm"
                currentUserId="u1"
                members={members}
                canManage
                onMembersChanged={vi.fn()}
                onLeft={vi.fn()}
            />,
        )
        expect(container.firstChild).toBeNull()
    })

    it('group owner+manage: «Пригласить» открывает drawer', () => {
        render(
            <ConversationHeaderActions
                conversationId="c1"
                conversationType="group"
                conversationTitle="Команда"
                projectId="p1"
                currentUserId="u1"
                members={members}
                myRole="owner"
                canManage
                onMembersChanged={vi.fn()}
                onLeft={vi.fn()}
            />,
        )
        fireEvent.click(screen.getByText('Пригласить'))
        expect(screen.getByText('DRAWER: invite')).toBeInTheDocument()
    })

    it('«Покинуть»: подтверждение и вызов leave', async () => {
        const onLeft = vi.fn()
        render(
            <ConversationHeaderActions
                conversationId="c1"
                conversationType="group"
                conversationTitle="Команда"
                projectId="p1"
                currentUserId="u1"
                members={members}
                myRole="member"
                onMembersChanged={vi.fn()}
                onLeft={onLeft}
            />,
        )
        fireEvent.click(screen.getByText('Покинуть'))
        expect(screen.getByText('Покинуть беседу?')).toBeInTheDocument()
        fireEvent.click(screen.getAllByText('Покинуть')[1])
        await waitFor(() => expect(leave).toHaveBeenCalledWith('c1', 'u1'))
        expect(onLeft).toHaveBeenCalled()
    })

    it('member без manage: нет «Пригласить», но есть «Покинуть»', () => {
        render(
            <ConversationHeaderActions
                conversationId="c1"
                conversationType="group"
                currentUserId="u2"
                members={members}
                myRole="member"
                onMembersChanged={vi.fn()}
                onLeft={vi.fn()}
            />,
        )
        expect(screen.queryByText('Пригласить')).not.toBeInTheDocument()
        expect(screen.getByText('Покинуть')).toBeInTheDocument()
    })
})
