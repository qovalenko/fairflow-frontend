import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'

const apiListProjectMembers = vi.fn()
const create = vi.fn()

vi.mock('./chatService', () => ({
    apiListProjectMembers: (...a: unknown[]) => apiListProjectMembers(...a),
}))
vi.mock('./useChat', () => ({
    useConversationActions: () => ({ create }),
}))
vi.mock('./chatUi', () => ({
    notifyChatError: vi.fn(),
    notifySuccess: vi.fn(),
}))

import NewConversationDrawer from './NewConversationDrawer'

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('NewConversationDrawer', () => {
    beforeEach(() => {
        apiListProjectMembers.mockResolvedValue([
            { id: 'u1', name: 'Я' },
            { id: 'u2', name: 'Пётр Петров' },
        ])
        create.mockResolvedValue({ id: 'new-c1', type: 'dm', title: '', scope: { kind: 'project', scopeId: 'p1' }, lastMessageAt: 0, unreadCount: 0 })
    })

    it('open=false → ничего не рисует', () => {
        const { container } = render(
            <NewConversationDrawer open={false} onClose={vi.fn()} onCreated={vi.fn()} />,
        )
        expect(container.firstChild).toBeNull()
    })

    it('DM: выбор собеседника и создание', async () => {
        const onCreated = vi.fn()
        const onClose = vi.fn()
        render(
            <NewConversationDrawer
                open
                projectId="p1"
                currentUserId="u1"
                onClose={onClose}
                onCreated={onCreated}
            />,
        )
        await screen.findByText('Пётр Петров')
        fireEvent.click(screen.getByLabelText(/Пётр Петров/))
        fireEvent.click(screen.getByText('Создать'))
        await waitFor(() =>
            expect(create).toHaveBeenCalledWith({
                type: 'dm',
                peerUserId: 'u2',
                title: undefined,
                memberUserIds: undefined,
            }),
        )
        expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-c1' }))
        expect(onClose).toHaveBeenCalled()
    })

    it('поиск фильтрует участников', async () => {
        render(
            <NewConversationDrawer
                open
                projectId="p1"
                currentUserId="u1"
                onClose={vi.fn()}
                onCreated={vi.fn()}
            />,
        )
        await screen.findByText('Пётр Петров')
        fireEvent.change(screen.getByPlaceholderText('Поиск по имени…'), {
            target: { value: 'zzz' },
        })
        expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
    })

    it('без projectId → «Недоступно в личном пространстве»', async () => {
        render(
            <NewConversationDrawer open currentUserId="u1" onClose={vi.fn()} onCreated={vi.fn()} />,
        )
        expect(await screen.findByText('Недоступно в личном пространстве')).toBeInTheDocument()
    })

    it('canManage: тип «Канал проекта» доступен', async () => {
        render(
            <NewConversationDrawer
                open
                projectId="p1"
                currentUserId="u1"
                canManage
                onClose={vi.fn()}
                onCreated={vi.fn()}
            />,
        )
        expect(await screen.findByText('Канал проекта')).toBeInTheDocument()
    })

    it('«Заметки себе» вызывает onSelfNotes', async () => {
        const onSelfNotes = vi.fn()
        render(
            <NewConversationDrawer
                open
                projectId="p1"
                currentUserId="u1"
                onSelfNotes={onSelfNotes}
                onClose={vi.fn()}
                onCreated={vi.fn()}
            />,
        )
        fireEvent.click(await screen.findByText('Заметки себе'))
        expect(onSelfNotes).toHaveBeenCalled()
    })
})
