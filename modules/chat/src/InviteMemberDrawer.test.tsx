import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'

const apiListProjectMembers = vi.fn()
const invite = vi.fn()

vi.mock('./chatService', () => ({
    apiListProjectMembers: (...a: unknown[]) => apiListProjectMembers(...a),
}))
vi.mock('./useChat', () => ({
    useConversationActions: () => ({ invite }),
}))
vi.mock('./chatUi', () => ({
    notifyChatError: vi.fn(),
    notifySuccess: vi.fn(),
}))

import InviteMemberDrawer from './InviteMemberDrawer'

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('InviteMemberDrawer', () => {
    beforeEach(() => {
        apiListProjectMembers.mockResolvedValue([
            { id: 'u1', name: 'Я' },
            { id: 'u2', name: 'Пётр' },
            { id: 'u3', name: 'Анна' },
        ])
        invite.mockResolvedValue({})
    })

    it('исключает текущих участников из списка', async () => {
        render(
            <InviteMemberDrawer
                open
                conversationId="c1"
                projectId="p1"
                currentUserId="u1"
                memberIds={['u1', 'u2']}
                onClose={vi.fn()}
                onInvited={vi.fn()}
            />,
        )
        await screen.findByText('Анна')
        expect(screen.queryByText('Пётр')).not.toBeInTheDocument()
    })

    it('приглашение выбранных участников', async () => {
        const onInvited = vi.fn()
        const onClose = vi.fn()
        render(
            <InviteMemberDrawer
                open
                conversationId="c1"
                projectId="p1"
                currentUserId="u1"
                memberIds={['u1']}
                onClose={onClose}
                onInvited={onInvited}
            />,
        )
        await screen.findByText('Пётр')
        fireEvent.click(screen.getByLabelText(/Пётр/))
        fireEvent.click(screen.getByText('Пригласить'))
        await waitFor(() => expect(invite).toHaveBeenCalledWith('c1', ['u2']))
        expect(onInvited).toHaveBeenCalled()
        expect(onClose).toHaveBeenCalled()
    })

    it('все уже в беседе → подсказка', async () => {
        render(
            <InviteMemberDrawer
                open
                conversationId="c1"
                projectId="p1"
                currentUserId="u1"
                memberIds={['u1', 'u2', 'u3']}
                onClose={vi.fn()}
                onInvited={vi.fn()}
            />,
        )
        expect(await screen.findByText('Все участники проекта уже в беседе')).toBeInTheDocument()
    })
})
