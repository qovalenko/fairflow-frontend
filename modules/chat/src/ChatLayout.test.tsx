import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { ConversationVM } from './chatTypes'

const useChatGate = vi.fn()
const useConversations = vi.fn()
const useChatRealtime = vi.fn()
const useConversationActions = vi.fn()
const create = vi.fn()

vi.mock('./useChat', () => ({
    useChatGate: (...a: unknown[]) => useChatGate(...a),
    useConversations: (...a: unknown[]) => useConversations(...a),
    useChatRealtime: (...a: unknown[]) => useChatRealtime(...a),
    useConversationActions: (...a: unknown[]) => useConversationActions(...a),
}))
vi.mock('./MessageWindow', () => ({
    default: ({ conversationId }: { conversationId: string }) => (
        <div>ОКНО: {conversationId}</div>
    ),
}))
vi.mock('./NewConversationDrawer', () => ({
    default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
        open ? (
            <div>
                DRAWER
                <button type="button" onClick={onClose}>
                    закрыть
                </button>
            </div>
        ) : null,
}))
vi.mock('./chatUi', () => ({
    notifyChatError: vi.fn(),
    notifySuccess: vi.fn(),
}))

import ChatLayout from './ChatLayout'

const conv = (id: string): ConversationVM => ({
    id,
    type: 'dm',
    title: '',
    scope: { kind: 'project', scopeId: 'p1' },
    lastMessageAt: 0,
    unreadCount: 0,
    members: [{ userId: 'u2', role: 'member' }],
})

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('ChatLayout', () => {
    beforeEach(() => {
        useChatRealtime.mockReturnValue({ transport: 'ws', sendTyping: vi.fn() })
        useConversationActions.mockReturnValue({ create })
        create.mockResolvedValue({ id: 'self-dm', type: 'dm', title: '', scope: { kind: 'project', scopeId: 'p1' }, lastMessageAt: 0, unreadCount: 0 })
        useConversations.mockReturnValue({ conversations: [conv('c1')] })
        useChatGate.mockReturnValue({
            projectId: 'p1',
            moduleEnabled: true,
            canRead: true,
            canWrite: true,
            canManage: true,
            canModerate: false,
            enabled: true,
        })
    })

    it('moduleDisabled → «Модуль выключен»', () => {
        useChatGate.mockReturnValue({
            projectId: 'p1',
            moduleEnabled: false,
            canRead: true,
            canWrite: false,
            enabled: false,
        })
        render(
            <ChatLayout currentUserId="u1" onSelectConversation={vi.fn()} resolveName={(id) => id} />,
        )
        expect(screen.getByText('Модуль выключен')).toBeInTheDocument()
    })

    it('!canRead → «Нет доступа»', () => {
        useChatGate.mockReturnValue({
            projectId: 'p1',
            moduleEnabled: true,
            canRead: false,
            canWrite: false,
            enabled: false,
        })
        render(
            <ChatLayout currentUserId="u1" onSelectConversation={vi.fn()} resolveName={(id) => id} />,
        )
        expect(screen.getByText('Нет доступа')).toBeInTheDocument()
    })

    it('без activeConversationId → «Выберите беседу»', async () => {
        render(
            <ChatLayout currentUserId="u1" onSelectConversation={vi.fn()} resolveName={(id) => id} />,
        )
        expect(screen.getByText('Выберите беседу')).toBeInTheDocument()
        expect(screen.getByText('+ Новый')).toBeInTheDocument()
    })

    it('activeConversationId → MessageWindow', () => {
        render(
            <ChatLayout
                currentUserId="u1"
                activeConversationId="c1"
                onSelectConversation={vi.fn()}
                resolveName={(id) => id}
            />,
        )
        expect(screen.getByText('ОКНО: c1')).toBeInTheDocument()
    })

    it('«+ Новый» открывает drawer создания', () => {
        render(
            <ChatLayout currentUserId="u1" onSelectConversation={vi.fn()} resolveName={(id) => id} />,
        )
        fireEvent.click(screen.getByText('+ Новый'))
        expect(screen.getByText('DRAWER')).toBeInTheDocument()
    })

    it('SSE transport → баннер резервного режима', () => {
        useChatRealtime.mockReturnValue({ transport: 'sse', sendTyping: vi.fn() })
        render(
            <ChatLayout currentUserId="u1" onSelectConversation={vi.fn()} resolveName={(id) => id} />,
        )
        expect(screen.getByText(/Резервный режим связи \(SSE\)/)).toBeInTheDocument()
    })

    it('«Себе» создаёт self-DM и выбирает беседу', async () => {
        const onSelect = vi.fn()
        render(
            <ChatLayout currentUserId="u1" onSelectConversation={onSelect} resolveName={(id) => id} />,
        )
        fireEvent.click(screen.getByText('Себе'))
        await waitFor(() =>
            expect(create).toHaveBeenCalledWith({ type: 'dm', peerUserId: 'u1' }),
        )
        expect(onSelect).toHaveBeenCalledWith('self-dm')
    })
})
