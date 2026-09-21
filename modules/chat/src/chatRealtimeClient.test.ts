import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./chatService', () => ({
    chatSocketUrl: () => 'ws://test/chat',
    chatStreamUrl: () => 'http://test/stream',
    realtimeToken: () => 'rt-token',
    normMessage: (m: Record<string, unknown>) => ({
        id: m.id,
        seq: m.seq,
        conversationId: m.conversation_id ?? m.conversationId,
        senderId: m.sender_id ?? m.senderId,
        senderType: 'user',
        kind: 'text',
        text: m.text,
        attachments: [],
        mentionIds: [],
        sentAt: m.sent_at ?? m.sentAt ?? 0,
    }),
}))

import { ChatRealtimeClient } from './chatRealtimeClient'

type WsHandler = (ev?: { data?: string }) => void

class MockWebSocket {
    static OPEN = 1
    static CONNECTING = 0
    static instances: MockWebSocket[] = []
    readyState = MockWebSocket.CONNECTING
    onopen: WsHandler | null = null
    onmessage: WsHandler | null = null
    onclose: WsHandler | null = null
    onerror: WsHandler | null = null
    sent: string[] = []
    /** Если false — onopen не вызывается автоматически (для теста WS timeout). */
    autoOpen = true

    constructor(public url: string) {
        MockWebSocket.instances.push(this)
        if (this.autoOpen) {
            queueMicrotask(() => {
                this.readyState = MockWebSocket.OPEN
                this.onopen?.()
            })
        }
    }

    send(data: string) {
        this.sent.push(data)
    }

    close() {
        this.readyState = 3
        this.onclose?.()
    }

    simulateDrop() {
        this.readyState = 3
        this.onclose?.()
    }
}

describe('ChatRealtimeClient', () => {
    beforeEach(() => {
        MockWebSocket.instances = []
        vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.useRealTimers()
    })

    it('connect WS → auth + subscribe + onFrame message', async () => {
        const onFrame = vi.fn()
        const onStatus = vi.fn()
        const client = new ChatRealtimeClient({
            projectId: 'p1',
            conversationIds: ['c1'],
            onFrame,
            onStatus,
        })
        client.connect()
        await Promise.resolve()
        client.setSubscribedConversations(['c1'])

        const ws = MockWebSocket.instances[0]
        expect(ws.sent.some((s) => s.includes('"type":"auth"'))).toBe(true)
        expect(ws.sent.some((s) => s.includes('"type":"subscribe"'))).toBe(true)

        ws.onmessage?.({
            data: JSON.stringify({
                type: 'message',
                conversationId: 'c1',
                message: { id: 'm1', seq: 1, conversation_id: 'c1', sender_id: 'u1', text: 'Hi' },
            }),
        })
        expect(onFrame).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'message', message: expect.objectContaining({ text: 'Hi' }) }),
        )
    })

    it('sendTyping шлёт typing только на открытом WS', async () => {
        const client = new ChatRealtimeClient({ onFrame: vi.fn(), onStatus: vi.fn() })
        client.connect()
        await Promise.resolve()
        client.sendTyping('c1')
        const ws = MockWebSocket.instances[0]
        expect(ws.sent.some((s) => s.includes('"type":"typing"'))).toBe(true)
    })

    it('preferWs=false → EventSource fallback', () => {
        const listeners: Record<string, (ev: MessageEvent) => void> = {}
        class MockEventSource {
            onopen: (() => void) | null = null
            onerror: (() => void) | null = null
            constructor(public url: string) {
                queueMicrotask(() => this.onopen?.())
            }
            addEventListener(type: string, fn: (ev: MessageEvent) => void) {
                listeners[type] = fn
            }
            close() {}
        }
        vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource)

        const onFrame = vi.fn()
        const client = new ChatRealtimeClient({ preferWs: false, onFrame, onStatus: vi.fn() })
        client.connect()

        listeners.badge?.({ data: JSON.stringify({ unread: 3, project_id: 'p1' }) } as MessageEvent)
        expect(onFrame).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'badge', unread: 3, projectId: 'p1' }),
        )
    })

    it('close переводит transport в disconnected', () => {
        const onStatus = vi.fn()
        const client = new ChatRealtimeClient({ onFrame: vi.fn(), onStatus })
        client.connect()
        client.close()
        expect(onStatus).toHaveBeenCalledWith('disconnected')
    })

    it('WS не поднялся → SSE fallback при close', async () => {
        class NoOpenWs {
            static OPEN = 1
            static CONNECTING = 0
            static instances: NoOpenWs[] = []
            readyState = NoOpenWs.CONNECTING
            onopen: WsHandler | null = null
            onmessage: WsHandler | null = null
            onclose: WsHandler | null = null
            onerror: WsHandler | null = null
            sent: string[] = []
            constructor(public url: string) {
                NoOpenWs.instances.push(this)
            }
            send(data: string) {
                this.sent.push(data)
            }
            close() {
                this.readyState = 3
                this.onclose?.()
            }
            simulateDrop() {
                this.readyState = 3
                this.onclose?.()
            }
        }
        vi.stubGlobal('WebSocket', NoOpenWs as unknown as typeof WebSocket)

        class MockEventSource {
            onopen: (() => void) | null = null
            onerror: (() => void) | null = null
            constructor(public url: string) {
                queueMicrotask(() => this.onopen?.())
            }
            addEventListener() {}
            close() {}
        }
        vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource)

        const onStatus = vi.fn()
        const client = new ChatRealtimeClient({ onFrame: vi.fn(), onStatus })
        client.connect()
        await Promise.resolve()
        NoOpenWs.instances[0].simulateDrop()
        await Promise.resolve()
        expect(onStatus).toHaveBeenCalledWith('sse')
    })

    it('signalOpen шлёт close предыдущей и open новой беседы', async () => {
        const client = new ChatRealtimeClient({ onFrame: vi.fn(), onStatus: vi.fn() })
        client.connect()
        await Promise.resolve()
        const ws = MockWebSocket.instances[0]
        client.signalOpen('c1')
        client.signalOpen('c2')
        expect(ws.sent.some((s) => s.includes('"type":"open"') && s.includes('c1'))).toBe(true)
        expect(ws.sent.some((s) => s.includes('"type":"close"') && s.includes('c1'))).toBe(true)
        expect(ws.sent.some((s) => s.includes('"type":"open"') && s.includes('c2'))).toBe(true)
    })

    it('setSubscribedConversations не дублирует subscribe при том же наборе', async () => {
        const client = new ChatRealtimeClient({ onFrame: vi.fn(), onStatus: vi.fn() })
        client.connect()
        await Promise.resolve()
        client.setSubscribedConversations(['c1'])
        client.setSubscribedConversations(['c1'])
        const ws = MockWebSocket.instances[0]
        const subs = ws.sent.filter((s) => s.includes('"type":"subscribe"'))
        expect(subs).toHaveLength(1)
    })

    it('WS drop после connect → reconnect, затем SSE после бюджета', async () => {
        vi.useFakeTimers()
        class MockEventSource {
            onopen: (() => void) | null = null
            onerror: (() => void) | null = null
            constructor(public url: string) {
                queueMicrotask(() => this.onopen?.())
            }
            addEventListener() {}
            close() {}
        }
        vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource)

        const onStatus = vi.fn()
        const client = new ChatRealtimeClient({ onFrame: vi.fn(), onStatus })
        client.connect()
        await Promise.resolve()
        MockWebSocket.instances[0].simulateDrop()
        vi.advanceTimersByTime(1000)
        await Promise.resolve()
        MockWebSocket.instances[1].simulateDrop()
        await Promise.resolve()
        expect(onStatus).toHaveBeenCalledWith('sse')
    })

    it('parseFrame: presence и read кадры', async () => {
        const onFrame = vi.fn()
        const client = new ChatRealtimeClient({ onFrame, onStatus: vi.fn() })
        client.connect()
        await Promise.resolve()
        const ws = MockWebSocket.instances[0]
        ws.onmessage?.({
            data: JSON.stringify({
                type: 'presence',
                conversation_id: 'c1',
                user_id: 'u2',
                state: 'online',
            }),
        })
        ws.onmessage?.({
            data: JSON.stringify({
                type: 'read',
                conversation_id: 'c1',
                user_id: 'u1',
                last_read_seq: 5,
            }),
        })
        expect(onFrame).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'presence', userId: 'u2', state: 'online' }),
        )
        expect(onFrame).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'read', lastReadSeq: 5 }),
        )
    })

    it('onReconnect после повторного connect', async () => {
        vi.useFakeTimers()
        const onReconnect = vi.fn()
        const client = new ChatRealtimeClient({ onFrame: vi.fn(), onStatus: vi.fn(), onReconnect })
        client.connect()
        await Promise.resolve()
        MockWebSocket.instances[0].simulateDrop()
        vi.advanceTimersByTime(1000)
        await Promise.resolve()
        expect(onReconnect).toHaveBeenCalled()
    })

    it('connect() второй раз — no-op (не плодит сокеты)', async () => {
        const client = new ChatRealtimeClient({ onFrame: vi.fn(), onStatus: vi.fn() })
        client.connect()
        client.connect()
        await Promise.resolve()
        expect(MockWebSocket.instances).toHaveLength(1)
    })

    it('heartbeat шлёт heartbeat и продлевает open-state', async () => {
        vi.useFakeTimers()
        const client = new ChatRealtimeClient({ onFrame: vi.fn(), onStatus: vi.fn() })
        client.connect()
        await Promise.resolve()
        client.signalOpen('c1')
        const ws = MockWebSocket.instances[0]
        ws.sent.length = 0
        vi.advanceTimersByTime(20_000)
        expect(ws.sent.some((s) => s.includes('"type":"heartbeat"'))).toBe(true)
        expect(ws.sent.some((s) => s.includes('"type":"open"') && s.includes('c1'))).toBe(true)
    })
})
