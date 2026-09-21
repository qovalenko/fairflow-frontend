import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { ConversationVM, MessageVM, MemberVM } from './chatTypes'

const useConversation = vi.fn()
const useMessages = vi.fn()
const usePresence = vi.fn()
const useConversationActions = vi.fn()
const markRead = vi.fn()

vi.mock('./useChat', () => ({
    useConversation: (...a: unknown[]) => useConversation(...a),
    useMessages: (...a: unknown[]) => useMessages(...a),
    usePresence: (...a: unknown[]) => usePresence(...a),
    useConversationActions: (...a: unknown[]) => useConversationActions(...a),
}))
vi.mock('./chatUi', () => ({
    notifyChatError: vi.fn(),
    notifySuccess: vi.fn(),
}))

import MessageWindow from './MessageWindow'

const conv = (): ConversationVM & { members: MemberVM[] } => ({
    id: 'c1',
    type: 'group',
    title: 'Команда',
    scope: { kind: 'project', scopeId: 'p1' },
    lastMessageAt: 0,
    unreadCount: 0,
    myRole: 'owner',
    members: [
        { userId: 'u1', role: 'owner' },
        { userId: 'u2', role: 'member' },
    ],
})

const msg = (over: Partial<MessageVM> = {}): MessageVM => ({
    id: 'm1',
    seq: 10,
    conversationId: 'c1',
    senderId: 'u2',
    senderType: 'user',
    kind: 'text',
    text: 'Сообщение в чате',
    attachments: [],
    mentionIds: [],
    sentAt: Date.now(),
    ...over,
})

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('MessageWindow', () => {
    beforeEach(() => {
        markRead.mockResolvedValue({})
        useConversationActions.mockReturnValue({ markRead })
        usePresence.mockReturnValue({ presence: [{ userId: 'u2', online: true }], applyPresence: vi.fn() })
    })

    it('notMember → экран «нет доступа к беседе»', () => {
        useConversation.mockReturnValue({
            conversation: null,
            members: [],
            isLoading: false,
            error: undefined,
            notMember: true,
            refresh: vi.fn(),
        })
        useMessages.mockReturnValue({
            messages: [],
            isLoading: false,
            loadingMore: false,
            hasMore: false,
            error: undefined,
            loadMore: vi.fn(),
            send: vi.fn(),
            retry: vi.fn(),
            edit: vi.fn(),
            remove: vi.fn(),
            applyRealtimeMessage: vi.fn(),
        })
        render(
            <MessageWindow conversationId="c1" currentUserId="u1" canWrite projectId="p1" />,
        )
        expect(screen.getByText('Нет доступа к беседе')).toBeInTheDocument()
    })

    it('loading без conversation → скелетон', () => {
        useConversation.mockReturnValue({
            conversation: null,
            members: [],
            isLoading: true,
            error: undefined,
            notMember: false,
            refresh: vi.fn(),
        })
        useMessages.mockReturnValue({
            messages: [],
            isLoading: true,
            loadingMore: false,
            hasMore: false,
            error: undefined,
            loadMore: vi.fn(),
            send: vi.fn(),
            retry: vi.fn(),
            edit: vi.fn(),
            remove: vi.fn(),
            applyRealtimeMessage: vi.fn(),
        })
        const { container } = render(
            <MessageWindow conversationId="c1" currentUserId="u1" canWrite projectId="p1" />,
        )
        expect(container.querySelectorAll('[style*="linear-gradient"]').length).toBeGreaterThan(0)
    })

    it('пустая лента → «Начните беседу»', () => {
        useConversation.mockReturnValue({
            conversation: conv(),
            members: conv().members,
            isLoading: false,
            error: undefined,
            notMember: false,
            refresh: vi.fn(),
        })
        useMessages.mockReturnValue({
            messages: [],
            isLoading: false,
            loadingMore: false,
            hasMore: false,
            error: undefined,
            loadMore: vi.fn(),
            send: vi.fn(),
            retry: vi.fn(),
            edit: vi.fn(),
            remove: vi.fn(),
            applyRealtimeMessage: vi.fn(),
        })
        render(
            <MessageWindow
                conversationId="c1"
                currentUserId="u1"
                canWrite
                projectId="p1"
                resolveName={(id) => (id === 'u2' ? 'Пётр' : 'Я')}
            />,
        )
        expect(screen.getByText('Команда')).toBeInTheDocument()
        expect(screen.getByText('Начните беседу')).toBeInTheDocument()
    })

    it('рендер сообщений и отправка через composer', async () => {
        const send = vi.fn().mockResolvedValue(msg())
        useConversation.mockReturnValue({
            conversation: conv(),
            members: conv().members,
            isLoading: false,
            error: undefined,
            notMember: false,
            refresh: vi.fn(),
        })
        useMessages.mockReturnValue({
            messages: [msg()],
            isLoading: false,
            loadingMore: false,
            hasMore: false,
            error: undefined,
            loadMore: vi.fn(),
            send,
            retry: vi.fn(),
            edit: vi.fn(),
            remove: vi.fn(),
            applyRealtimeMessage: vi.fn(),
        })
        render(
            <MessageWindow
                conversationId="c1"
                currentUserId="u1"
                canWrite
                projectId="p1"
                resolveName={(id) => (id === 'u2' ? 'Пётр' : id)}
            />,
        )
        expect(screen.getByText('Сообщение в чате')).toBeInTheDocument()
        expect(screen.getByText('Пётр')).toBeInTheDocument()
        fireEvent.change(screen.getByPlaceholderText(/Сообщение/), { target: { value: 'Ответ' } })
        fireEvent.click(screen.getByText('Отправить'))
        await waitFor(() => expect(send).toHaveBeenCalled())
        await waitFor(() => expect(markRead).toHaveBeenCalledWith('c1', 10))
    })

    it('billingReadonly: composer скрыт', () => {
        useConversation.mockReturnValue({
            conversation: conv(),
            members: conv().members,
            isLoading: false,
            error: undefined,
            notMember: false,
            refresh: vi.fn(),
        })
        useMessages.mockReturnValue({
            messages: [msg()],
            isLoading: false,
            loadingMore: false,
            hasMore: false,
            error: undefined,
            loadMore: vi.fn(),
            send: vi.fn(),
            retry: vi.fn(),
            edit: vi.fn(),
            remove: vi.fn(),
            applyRealtimeMessage: vi.fn(),
        })
        render(
            <MessageWindow
                conversationId="c1"
                currentUserId="u1"
                canWrite
                billingReadonly
                projectId="p1"
            />,
        )
        expect(screen.getByText(/Режим только для чтения \(биллинг\)/)).toBeInTheDocument()
        expect(screen.queryByPlaceholderText(/Сообщение/)).not.toBeInTheDocument()
    })

    it('!canWrite: «Нет права на отправку»', () => {
        useConversation.mockReturnValue({
            conversation: conv(),
            members: conv().members,
            isLoading: false,
            error: undefined,
            notMember: false,
            refresh: vi.fn(),
        })
        useMessages.mockReturnValue({
            messages: [],
            isLoading: false,
            loadingMore: false,
            hasMore: false,
            error: undefined,
            loadMore: vi.fn(),
            send: vi.fn(),
            retry: vi.fn(),
            edit: vi.fn(),
            remove: vi.fn(),
            applyRealtimeMessage: vi.fn(),
        })
        render(<MessageWindow conversationId="c1" currentUserId="u1" canWrite={false} projectId="p1" />)
        expect(screen.getByText('Нет права на отправку')).toBeInTheDocument()
    })

    it('convError → экран ошибки', () => {
        useConversation.mockReturnValue({
            conversation: null,
            members: [],
            isLoading: false,
            error: new Error('load failed'),
            notMember: false,
            refresh: vi.fn(),
        })
        useMessages.mockReturnValue({
            messages: [],
            isLoading: false,
            loadingMore: false,
            hasMore: false,
            error: undefined,
            loadMore: vi.fn(),
            send: vi.fn(),
            retry: vi.fn(),
            edit: vi.fn(),
            remove: vi.fn(),
            applyRealtimeMessage: vi.fn(),
        })
        render(<MessageWindow conversationId="c1" currentUserId="u1" canWrite projectId="p1" />)
        expect(screen.getByText('Ошибка')).toBeInTheDocument()
    })

    it('error ленты без сообщений → экран ошибки', () => {
        useConversation.mockReturnValue({
            conversation: conv(),
            members: conv().members,
            isLoading: false,
            error: undefined,
            notMember: false,
            refresh: vi.fn(),
        })
        useMessages.mockReturnValue({
            messages: [],
            isLoading: false,
            loadingMore: false,
            hasMore: false,
            error: new Error('messages fail'),
            loadMore: vi.fn(),
            send: vi.fn(),
            retry: vi.fn(),
            edit: vi.fn(),
            remove: vi.fn(),
            applyRealtimeMessage: vi.fn(),
        })
        render(<MessageWindow conversationId="c1" currentUserId="u1" canWrite projectId="p1" />)
        expect(screen.getByText('Ошибка')).toBeInTheDocument()
    })
})
