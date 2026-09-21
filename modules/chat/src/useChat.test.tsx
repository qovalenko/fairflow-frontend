import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactNode } from 'react'

const {
    apiListConversations,
    apiGetConversation,
    apiGetMessages,
    apiSendMessage,
    apiGetUnreadCount,
    apiGetPresence,
    apiGetReadReceipts,
    apiMarkRead,
    apiMarkAllRead,
    apiCreateConversation,
    apiArchiveConversation,
    apiUpdateMembers,
    apiEditMessage,
    apiDeleteMessage,
    mockConnect,
    mockClose,
    mockSetSubscribed,
    mockSignalOpen,
    mockSendTyping,
    getLastRealtimeOpts,
    setLastRealtimeOpts,
    usePermission,
    MockChatRealtimeClient,
} = vi.hoisted(() => {
    let lastRealtimeOpts: Record<string, unknown> | null = null
    const mockConnect = vi.fn()
    const mockClose = vi.fn()
    const mockSetSubscribed = vi.fn()
    const mockSignalOpen = vi.fn()
    const mockSendTyping = vi.fn()
    const setLastRealtimeOpts = (v: Record<string, unknown> | null) => {
        lastRealtimeOpts = v
    }
    const getLastRealtimeOpts = () => lastRealtimeOpts

    class MockChatRealtimeClient {
        constructor(private opts: Record<string, unknown>) {
            setLastRealtimeOpts(opts)
        }
        connect() {
            mockConnect()
            ;(this.opts.onStatus as ((s: string) => void) | undefined)?.('ws')
        }
        close() {
            mockClose()
        }
        setSubscribedConversations(ids: string[]) {
            mockSetSubscribed(ids)
        }
        signalOpen(id: string | null) {
            mockSignalOpen(id)
        }
        sendTyping(id: string) {
            mockSendTyping(id)
        }
        getTransport() {
            return 'ws' as const
        }
    }

    return {
        apiListConversations: vi.fn(),
        apiGetConversation: vi.fn(),
        apiGetMessages: vi.fn(),
        apiSendMessage: vi.fn(),
        apiGetUnreadCount: vi.fn(),
        apiGetPresence: vi.fn(),
        apiGetReadReceipts: vi.fn(),
        apiMarkRead: vi.fn(),
        apiMarkAllRead: vi.fn(),
        apiCreateConversation: vi.fn(),
        apiArchiveConversation: vi.fn(),
        apiUpdateMembers: vi.fn(),
        apiEditMessage: vi.fn(),
        apiDeleteMessage: vi.fn(),
        mockConnect,
        mockClose,
        mockSetSubscribed,
        mockSignalOpen,
        mockSendTyping,
        getLastRealtimeOpts,
        setLastRealtimeOpts,
        usePermission: vi.fn(),
        MockChatRealtimeClient,
    }
})

vi.mock('./chatService', () => ({
    apiListConversations: (...a: unknown[]) => apiListConversations(...a),
    apiGetConversation: (...a: unknown[]) => apiGetConversation(...a),
    apiGetMessages: (...a: unknown[]) => apiGetMessages(...a),
    apiSendMessage: (...a: unknown[]) => apiSendMessage(...a),
    apiGetUnreadCount: (...a: unknown[]) => apiGetUnreadCount(...a),
    apiGetPresence: (...a: unknown[]) => apiGetPresence(...a),
    apiGetReadReceipts: (...a: unknown[]) => apiGetReadReceipts(...a),
    apiMarkRead: (...a: unknown[]) => apiMarkRead(...a),
    apiMarkAllRead: (...a: unknown[]) => apiMarkAllRead(...a),
    apiCreateConversation: (...a: unknown[]) => apiCreateConversation(...a),
    apiArchiveConversation: (...a: unknown[]) => apiArchiveConversation(...a),
    apiUpdateMembers: (...a: unknown[]) => apiUpdateMembers(...a),
    apiEditMessage: (...a: unknown[]) => apiEditMessage(...a),
    apiDeleteMessage: (...a: unknown[]) => apiDeleteMessage(...a),
}))

vi.mock('./chatRealtimeClient', () => ({
    ChatRealtimeClient: MockChatRealtimeClient,
}))

vi.mock('@/utils/hooks/useResolvedProjectId', () => ({
    default: () => 'p1',
}))

vi.mock('@/utils/hooks/usePermission', () => ({
    default: (resource: string, action: string) => usePermission(resource, action),
}))

vi.mock('@/store/projectStore', () => ({
    useProjectStore: (sel: (s: { currentProject: { enabledModules: string[] } }) => unknown) =>
        sel({ currentProject: { enabledModules: ['chat'] } }),
    getEnabledModules: () => ['chat'],
}))

vi.mock('@/services/ChatService', () => ({
    chatErrorCode: (err: unknown) =>
        (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error
            ?.code,
    isChatModuleDisabledError: (err: unknown) =>
        (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error
            ?.code === 'MODULE_DISABLED',
    newClientMessageId: () => 'new-client-id',
}))

import {
    useChatGate,
    useConversations,
    useConversation,
    useMessages,
    useUnreadCount,
    usePresence,
    useReadReceipts,
    useConversationActions,
    useChatRealtime,
    chatErrorStatus,
} from './useChat'

const wrapper =
    (provider = () => new Map()) =>
    ({ children }: { children: ReactNode }) => (
        <SWRConfig value={{ provider, dedupingInterval: 0 }}>{children}</SWRConfig>
    )

describe('useChatGate', () => {
    beforeEach(() => {
        usePermission.mockImplementation((_r, action) =>
            ['read', 'write', 'manage'].includes(action),
        )
    })

    it('enabled когда модуль включён и есть chat:read', () => {
        const { result } = renderHook(() => useChatGate(), { wrapper: wrapper() })
        expect(result.current.enabled).toBe(true)
        expect(result.current.canWrite).toBe(true)
    })

    it('enabled=false без chat:read', () => {
        usePermission.mockImplementation((_r, action) => action !== 'read')
        const { result } = renderHook(() => useChatGate(), { wrapper: wrapper() })
        expect(result.current.enabled).toBe(false)
    })
})

describe('useConversations', () => {
    beforeEach(() => {
        apiListConversations.mockResolvedValue([
            { id: 'c1', type: 'dm', title: '', scope: { kind: 'project', scopeId: 'p1' }, lastMessageAt: 0, unreadCount: 0 },
        ])
    })

    it('loading → данные списка', async () => {
        const { result } = renderHook(
            () => useConversations({ projectId: 'p1', enabled: true }),
            { wrapper: wrapper() },
        )
        await waitFor(() => expect(result.current.conversations).toHaveLength(1))
        expect(result.current.conversations[0].id).toBe('c1')
    })

    it('moduleDisabled при ошибке MODULE_DISABLED', async () => {
        apiListConversations.mockRejectedValue({
            response: { data: { error: { code: 'MODULE_DISABLED' } } },
        })
        const { result } = renderHook(
            () => useConversations({ projectId: 'p1', enabled: true }),
            { wrapper: wrapper() },
        )
        await waitFor(() => expect(result.current.moduleDisabled).toBe(true))
    })
})

describe('useConversation', () => {
    it('notMember при CHAT_NOT_A_MEMBER', async () => {
        apiGetConversation.mockRejectedValue({
            response: { data: { error: { code: 'CHAT_NOT_A_MEMBER' } } },
        })
        const { result } = renderHook(() => useConversation('c1'), { wrapper: wrapper() })
        await waitFor(() => expect(result.current.notMember).toBe(true))
    })
})

describe('useMessages', () => {
    beforeEach(() => {
        apiGetMessages.mockReset()
        apiSendMessage.mockReset()
        apiEditMessage.mockReset()
        apiDeleteMessage.mockReset()
    })

    const baseMsg = {
        conversationId: 'c1',
        senderId: 'u1',
        senderType: 'user' as const,
        kind: 'text' as const,
        attachments: [] as [],
        mentionIds: [] as [],
        sentAt: 1,
    }

    it('optimistic send заменяется сохранённым сообщением', async () => {
        apiGetMessages.mockResolvedValue([])
        apiSendMessage.mockResolvedValue({
            id: 'm1',
            seq: 1,
            ...baseMsg,
            text: 'Hi',
            clientMessageId: 'new-client-id',
        })
        const { result } = renderHook(() => useMessages('c1'), { wrapper: wrapper() })
        await waitFor(() => expect(result.current.isLoading).toBe(false))
        await act(async () => {
            await result.current.send(
                { text: 'Hi', attachments: [], mentionIds: [] },
                { senderId: 'u1' },
            )
        })
        await waitFor(() =>
            expect(result.current.messages.some((m) => m.id === 'm1' && m.text === 'Hi')).toBe(
                true,
            ),
        )
    })

    it('failed send помечает сообщение failed', async () => {
        apiGetMessages.mockResolvedValue([])
        apiSendMessage.mockRejectedValue(new Error('network'))
        const { result } = renderHook(() => useMessages('c1'), { wrapper: wrapper() })
        await waitFor(() => expect(result.current.isLoading).toBe(false))
        await act(async () => {
            await expect(
                result.current.send(
                    { text: 'Fail', attachments: [], mentionIds: [] },
                    { senderId: 'u1' },
                ),
            ).rejects.toThrow()
        })
        await waitFor(() =>
            expect(result.current.messages.some((m) => m.failed && m.text === 'Fail')).toBe(true),
        )
    })

    it('loadMore подгружает более старые сообщения', async () => {
        const page = Array.from({ length: 50 }, (_, i) => ({
            id: `m${i + 1}`,
            seq: i + 1,
            ...baseMsg,
            text: `msg ${i + 1}`,
        }))
        apiGetMessages.mockResolvedValueOnce(page).mockResolvedValueOnce([
            { id: 'm0', seq: 0, ...baseMsg, text: 'oldest' },
        ])
        const { result } = renderHook(() => useMessages('c1'), { wrapper: wrapper() })
        await waitFor(() => expect(result.current.messages).toHaveLength(50))
        let added = 0
        await act(async () => {
            added = await result.current.loadMore()
        })
        expect(added).toBe(1)
        expect(result.current.messages.some((m) => m.text === 'oldest')).toBe(true)
    })

    it('retry повторяет failed-сообщение', async () => {
        apiGetMessages.mockResolvedValue([])
        apiSendMessage
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValueOnce({
                id: 'm1',
                seq: 1,
                ...baseMsg,
                text: 'Retry me',
                clientMessageId: 'new-client-id',
            })
        const { result } = renderHook(() => useMessages('c1'), { wrapper: wrapper() })
        await waitFor(() => expect(result.current.isLoading).toBe(false))
        await act(async () => {
            try {
                await result.current.send(
                    { text: 'Retry me', attachments: [], mentionIds: [] },
                    { senderId: 'u1' },
                )
            } catch {
                /* expected */
            }
        })
        await waitFor(() =>
            expect(result.current.messages.some((m) => m.failed && m.text === 'Retry me')).toBe(true),
        )
        await act(async () => {
            await result.current.retry(result.current.messages.find((m) => m.failed)!)
        })
        await waitFor(() =>
            expect(result.current.messages.some((m) => m.id === 'm1' && !m.failed)).toBe(true),
        )
    })

    it('edit обновляет текст сообщения', async () => {
        apiGetMessages.mockResolvedValue([
            { id: 'm1', seq: 1, ...baseMsg, text: 'old' },
        ])
        apiEditMessage.mockResolvedValue({
            id: 'm1',
            seq: 1,
            ...baseMsg,
            text: 'new',
            editedAt: 2,
        })
        const { result } = renderHook(() => useMessages('c1'), { wrapper: wrapper() })
        await waitFor(() => expect(result.current.messages[0]?.text).toBe('old'))
        await act(async () => {
            await result.current.edit('m1', 'new')
        })
        await waitFor(() => expect(result.current.messages[0]?.text).toBe('new'))
    })

    it('remove заменяет сообщение tombstone', async () => {
        apiGetMessages.mockResolvedValue([
            { id: 'm1', seq: 1, ...baseMsg, text: 'bye' },
        ])
        apiDeleteMessage.mockResolvedValue({
            id: 'm1',
            seq: 1,
            ...baseMsg,
            text: '',
            deletedAt: 3,
        })
        const { result } = renderHook(() => useMessages('c1'), { wrapper: wrapper() })
        await waitFor(() => expect(result.current.messages).toHaveLength(1))
        await act(async () => {
            await result.current.remove('m1')
        })
        await waitFor(() => expect(result.current.messages[0]?.deletedAt).toBe(3))
    })

    it('applyRealtimeMessage дедуплицирует по clientMessageId', async () => {
        apiGetMessages.mockResolvedValue([])
        apiSendMessage.mockResolvedValue({
            id: 'm-optimistic',
            seq: 1,
            ...baseMsg,
            text: 'Hi',
            clientMessageId: 'new-client-id',
        })
        const { result } = renderHook(() => useMessages('c1'), { wrapper: wrapper() })
        await waitFor(() => expect(result.current.isLoading).toBe(false))
        await act(async () => {
            await result.current.send(
                { text: 'Hi', attachments: [], mentionIds: [] },
                { senderId: 'u1' },
            )
        })
        await waitFor(() =>
            expect(
                result.current.messages.some(
                    (m) => m.id === 'm-optimistic' && m.clientMessageId === 'new-client-id',
                ),
            ).toBe(true),
        )
        act(() => {
            result.current.applyRealtimeMessage({
                id: 'm-server-confirmed',
                seq: 1,
                ...baseMsg,
                text: 'Hi from realtime',
                clientMessageId: 'new-client-id',
            })
        })
        await waitFor(() => expect(result.current.messages).toHaveLength(1))
        expect(result.current.messages[0]?.id).toBe('m-server-confirmed')
        expect(result.current.messages[0]?.text).toBe('Hi from realtime')
        expect(result.current.messages[0]?.clientMessageId).toBe('new-client-id')
    })
})

describe('useUnreadCount', () => {
    beforeEach(() => {
        apiGetUnreadCount.mockResolvedValue({
            count: 5,
            byProject: [{ projectId: 'p1', count: 5 }],
        })
    })

    it('возвращает count и byProject', async () => {
        const { result } = renderHook(() => useUnreadCount({ projectId: 'p1' }), {
            wrapper: wrapper(),
        })
        await waitFor(() => expect(result.current.count).toBe(5))
        expect(result.current.byProject[0]?.projectId).toBe('p1')
    })
})

describe('usePresence', () => {
    it('applyPresence добавляет offline-пользователя', async () => {
        apiGetPresence.mockResolvedValue([{ userId: 'u1', online: true }])
        const { result } = renderHook(() => usePresence('c1'), { wrapper: wrapper() })
        await waitFor(() => expect(result.current.presence).toHaveLength(1))
        act(() => result.current.applyPresence('u2', false))
        await waitFor(() =>
            expect(result.current.presence.some((p) => p.userId === 'u2' && !p.online)).toBe(true),
        )
    })

    it('applyPresence обновляет существующего пользователя online', async () => {
        apiGetPresence.mockResolvedValue([{ userId: 'u1', online: false, lastSeenAt: 1 }])
        const { result } = renderHook(() => usePresence('c1'), { wrapper: wrapper() })
        await waitFor(() => expect(result.current.presence[0]?.online).toBe(false))
        act(() => result.current.applyPresence('u1', true))
        await waitFor(() => expect(result.current.presence[0]?.online).toBe(true))
    })
})

describe('useReadReceipts', () => {
    it('возвращает receipts при uptoSeq', async () => {
        apiGetReadReceipts.mockResolvedValue({
            readBy: [],
            readCount: 0,
            totalMembers: 2,
            aggregateOnly: false,
        })
        const { result } = renderHook(() => useReadReceipts('c1', 10), { wrapper: wrapper() })
        await waitFor(() => expect(result.current?.totalMembers).toBe(2))
    })
})

describe('useConversationActions', () => {
    beforeEach(() => {
        apiCreateConversation.mockResolvedValue({
            id: 'c-new',
            type: 'group',
            title: 'New',
            scope: { kind: 'project', scopeId: 'p1' },
            lastMessageAt: 0,
            unreadCount: 0,
        })
        apiArchiveConversation.mockResolvedValue({
            id: 'c1',
            type: 'group',
            title: 'G',
            scope: { kind: 'project', scopeId: 'p1' },
            lastMessageAt: 0,
            unreadCount: 0,
            archivedAt: 1,
        })
        apiMarkRead.mockResolvedValue({ unreadCount: 0, totalUnread: 0 })
        apiMarkAllRead.mockResolvedValue({ updated: 2 })
        apiUpdateMembers.mockResolvedValue({
            id: 'c1',
            type: 'group',
            title: 'G',
            scope: { kind: 'project', scopeId: 'p1' },
            lastMessageAt: 0,
            unreadCount: 0,
            members: [],
        })
    })

    it('create возвращает новую беседу', async () => {
        const { result } = renderHook(() => useConversationActions('p1'), { wrapper: wrapper() })
        let conv: { id: string } | undefined
        await act(async () => {
            conv = await result.current.create({ type: 'group', title: 'New' })
        })
        expect(conv?.id).toBe('c-new')
    })

    it('archive возвращает archived беседу', async () => {
        const { result } = renderHook(() => useConversationActions('p1'), { wrapper: wrapper() })
        let conv: { archivedAt?: number | null } | undefined
        await act(async () => {
            conv = await result.current.archive('c1')
        })
        expect(conv?.archivedAt).toBe(1)
    })

    it('leave вызывает DELETE members', async () => {
        const { result } = renderHook(() => useConversationActions('p1'), { wrapper: wrapper() })
        await act(async () => {
            await result.current.leave('c1', 'u1')
        })
        expect(apiUpdateMembers).toHaveBeenCalledWith('c1', { remove: ['u1'] }, 'delete')
    })

    it('invite добавляет участников', async () => {
        const { result } = renderHook(() => useConversationActions('p1'), { wrapper: wrapper() })
        await act(async () => {
            await result.current.invite('c1', ['u2'])
        })
        expect(apiUpdateMembers).toHaveBeenCalledWith('c1', { add: ['u2'] })
    })

    it('markAllRead вызывает apiMarkAllRead', async () => {
        const { result } = renderHook(() => useConversationActions('p1'), { wrapper: wrapper() })
        let updated = 0
        await act(async () => {
            const r = await result.current.markAllRead()
            updated = r.updated
        })
        expect(updated).toBe(2)
        expect(apiMarkAllRead).toHaveBeenCalledWith('p1')
    })
})

describe('useChatRealtime', () => {
    beforeEach(() => {
        mockConnect.mockClear()
        mockClose.mockClear()
        mockSetSubscribed.mockClear()
        mockSignalOpen.mockClear()
        mockSendTyping.mockClear()
        setLastRealtimeOpts(null)
    })

    it('подключает клиент и пробрасывает message frame', async () => {
        const onMessage = vi.fn()
        renderHook(
            () =>
                useChatRealtime({
                    enabled: true,
                    projectId: 'p1',
                    activeConversationId: 'c1',
                    conversationIds: ['c1'],
                    onMessage,
                }),
            { wrapper: wrapper() },
        )
        expect(mockConnect).toHaveBeenCalled()
        expect(mockSetSubscribed).toHaveBeenCalledWith(['c1'])

        const onFrame = getLastRealtimeOpts()?.onFrame as (frame: unknown) => void
        act(() => {
            onFrame({
                type: 'message',
                message: {
                    id: 'm1',
                    seq: 1,
                    conversationId: 'c1',
                    senderId: 'u1',
                    senderType: 'user',
                    kind: 'text',
                    text: 'RT',
                    attachments: [],
                    mentionIds: [],
                    sentAt: 1,
                },
            })
        })
        expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ text: 'RT' }))
    })

    it('onPresence вызывается для presence frame', () => {
        const onPresence = vi.fn()
        renderHook(
            () => useChatRealtime({ enabled: true, projectId: 'p1', onPresence }),
            { wrapper: wrapper() },
        )
        const onFrame = getLastRealtimeOpts()?.onFrame as (frame: unknown) => void
        act(() => {
            onFrame({ type: 'presence', conversationId: 'c1', userId: 'u2', state: 'online' })
        })
        expect(onPresence).toHaveBeenCalledWith('c1', 'u2', true)
    })

    it('sendTyping делегирует клиенту', () => {
        const { result } = renderHook(
            () => useChatRealtime({ enabled: true, projectId: 'p1' }),
            { wrapper: wrapper() },
        )
        act(() => result.current.sendTyping('c1'))
        expect(mockSendTyping).toHaveBeenCalledWith('c1')
    })

    it('close клиента при unmount', () => {
        const { unmount } = renderHook(
            () => useChatRealtime({ enabled: true, projectId: 'p1' }),
            { wrapper: wrapper() },
        )
        unmount()
        expect(mockClose).toHaveBeenCalled()
    })
})

describe('chatErrorStatus', () => {
    it('возвращает HTTP status из axios error', () => {
        expect(chatErrorStatus({ response: { status: 403 } })).toBe(403)
    })
})
