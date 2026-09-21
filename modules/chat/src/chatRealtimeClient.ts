/**
 * chatRealtimeClient — realtime-клиент чата (06-frontend-contract §4.2, backend §3.20/§7).
 *
 * Транспорт: WS `/ws/chat` основной; при недоступности (firewall/proxy)
 * деградация на SSE `/api/v1/chat/stream` (только чтение; отправка через REST,
 * typing/heartbeat отключаются — FR-CHAT-40). Фанаут на gateway через Redis Pub/Sub —
 * клиент о репликах не знает; reconnect с backoff, при reconnect → ревалидация SWR.
 *
 * Кадры: message/badge/presence/typing/read (ChatFrame). Применение кадров —
 * на стороне хуков (useChatRealtime), клиент только доставляет/парсит/реконнектит.
 */
import { chatSocketUrl, chatStreamUrl, realtimeToken } from './chatService'
import type { ChatFrame } from './chatTypes'
import { normMessage } from './chatService'

export type Transport = 'connecting' | 'ws' | 'sse' | 'disconnected'

type FrameHandler = (frame: ChatFrame) => void
type StatusHandler = (transport: Transport) => void

export interface ChatRealtimeOptions {
    projectId?: string
    /** Conversation ids to subscribe for realtime frames (FR-CHAT-22). */
    conversationIds?: string[]
    /** разрешить WS (false → сразу SSE; для прокси-сред/standalone). */
    preferWs?: boolean
    onFrame: FrameHandler
    onStatus?: StatusHandler
    /** ревалидация SWR после reconnect (догон пропущенного). */
    onReconnect?: () => void
}

const MAX_BACKOFF_MS = 30_000
const BASE_BACKOFF_MS = 1_000
const WS_OPEN_TIMEOUT_MS = 4_000
const HEARTBEAT_MS = 20_000
/** Сколько раз даём WS пере-подняться, прежде чем уйти на SSE насовсем. */
const WS_RECONNECT_BUDGET = 2

/** Парсит сырой кадр (snake_case message внутри) в типизированный ChatFrame. */
function parseFrame(type: string, raw: unknown): ChatFrame | null {
    const data = (raw ?? {}) as Record<string, unknown>
    const conversationId =
        (data.conversationId as string) ?? (data.conversation_id as string) ?? ''
    switch (type) {
        case 'message':
            if (!data.message) return null
            return {
                type: 'message',
                conversationId,
                message: normMessage(data.message as never),
            }
        case 'badge':
            return {
                type: 'badge',
                projectId: (data.projectId as string) ?? (data.project_id as string),
                unread: (data.unread as number) ?? (data.count as number),
            }
        case 'presence':
            return {
                type: 'presence',
                conversationId,
                userId: (data.userId as string) ?? (data.user_id as string) ?? '',
                state: (data.state as 'online' | 'offline') ?? 'offline',
            }
        case 'typing':
            return {
                type: 'typing',
                conversationId,
                userId: (data.userId as string) ?? (data.user_id as string) ?? '',
            }
        case 'read':
            return {
                type: 'read',
                conversationId,
                userId: (data.userId as string) ?? (data.user_id as string) ?? '',
                lastReadSeq:
                    (data.lastReadSeq as number) ?? (data.last_read_seq as number) ?? 0,
            }
        default:
            return null
    }
}

export class ChatRealtimeClient {
    private opts: ChatRealtimeOptions
    private ws: WebSocket | null = null
    private sse: EventSource | null = null
    private transport: Transport = 'disconnected'
    private attempts = 0
    private heartbeat: ReturnType<typeof setInterval> | null = null
    private wsOpenTimer: ReturnType<typeof setTimeout> | null = null
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null
    private closedByUser = false
    private hadConnection = false
    /** Защита от дублирующих connect() при ре-рендерах: уже идёт подключение/подключены. */
    private started = false
    /** Сколько раз WS падал после успешного апгрейда — для ухода на SSE. */
    private wsDrops = 0
    /** WS навсегда выключен (повторно падал) — больше его не пробуем. */
    private wsDisabled = false

    constructor(opts: ChatRealtimeOptions) {
        this.opts = opts
    }

    /** Текущий транспорт (для UI-индикатора деградации). */
    getTransport(): Transport {
        return this.transport
    }

    connect(): void {
        // дедуп: не плодим сокеты, если уже подключаемся/подключены
        if (this.started) return
        this.started = true
        this.closedByUser = false
        this.setTransport('connecting')
        if (this.opts.preferWs === false || this.wsDisabled) {
            this.connectSse()
        } else {
            this.connectWs()
        }
    }

    /** Отправка typing (FR-CHAT-24 — v1.x; no-op на SSE). */
    sendTyping(conversationId: string): void {
        if (this.transport === 'ws' && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'typing', conversationId }))
        }
    }

    /** Sync server-side subscription set with visible conversations. */
    setSubscribedConversations(ids: string[]): void {
        const next = new Set(ids.filter(Boolean))
        const prev = this.subscribedConversationIds
        // ре-рендеры дают новый массив с теми же id — не шлём кадры повторно
        if (next.size === prev.size && [...next].every((id) => prev.has(id))) return
        this.subscribedConversationIds = next
        this.flushSubscriptions()
    }

    private subscribedConversationIds = new Set<string>()
    /** Последняя открытая беседа — чтобы close уходил с её реальным id (сервер игнорирует пустой). */
    private lastOpenConversationId: string | null = null

    private flushSubscriptions(): void {
        if (this.transport !== 'ws' || this.ws?.readyState !== WebSocket.OPEN) return
        for (const conversationId of this.subscribedConversationIds) {
            this.ws.send(JSON.stringify({ type: 'subscribe', conversationId }))
        }
    }

    /** open-state сигнал (подавление уведомлений FR-CHAT-33). */
    signalOpen(conversationId: string | null): void {
        const prev = this.lastOpenConversationId
        this.lastOpenConversationId = conversationId
        if (this.transport !== 'ws' || this.ws?.readyState !== WebSocket.OPEN) return
        if (prev && prev !== conversationId) {
            this.ws.send(JSON.stringify({ type: 'close', conversationId: prev }))
        }
        if (conversationId) {
            this.ws.send(JSON.stringify({ type: 'open', conversationId }))
        }
    }

    close(): void {
        this.closedByUser = true
        this.started = false
        this.clearTimers()
        this.teardownWs()
        this.teardownSse()
        this.setTransport('disconnected')
    }

    // ─── WS ───────────────────────────────────────────────────────────────────

    private connectWs(): void {
        try {
            const ws = new WebSocket(chatSocketUrl({ projectId: this.opts.projectId }))
            this.ws = ws
            this.wsOpenTimer = setTimeout(() => {
                // WS не открылся за таймаут → деградация на SSE (proxy/firewall)
                if (ws.readyState !== WebSocket.OPEN) {
                    this.teardownWs()
                    this.connectSse()
                }
            }, WS_OPEN_TIMEOUT_MS)

            ws.onopen = () => {
                this.clearWsOpenTimer()
                const token = realtimeToken()
                if (token) {
                    ws.send(JSON.stringify({ type: 'auth', token }))
                }
                this.onConnected('ws')
                this.startHeartbeat()
                this.flushSubscriptions()
                // после reconnect восстанавливаем open-state активной беседы
                if (this.lastOpenConversationId) {
                    ws.send(JSON.stringify({ type: 'open', conversationId: this.lastOpenConversationId }))
                }
            }
            ws.onmessage = (ev) => {
                try {
                    const payload = JSON.parse(ev.data) as { type: string; [k: string]: unknown }
                    const frame = parseFrame(payload.type, payload)
                    if (frame) this.opts.onFrame(frame)
                } catch {
                    /* ignore malformed frame */
                }
            }
            ws.onerror = () => {
                /* onclose follows */
            }
            ws.onclose = () => {
                this.stopHeartbeat()
                this.teardownWs()
                if (this.closedByUser) return
                if (!this.hadConnection) {
                    // WS так и не поднялся → деградация на SSE
                    this.connectSse()
                    return
                }
                // WS падал уже после успешного апгрейда
                this.wsDrops += 1
                if (this.wsDrops >= WS_RECONNECT_BUDGET) {
                    // нестабильный WS (idle-timeout прокси и т.п.) → уходим на SSE насовсем
                    this.wsDisabled = true
                    this.connectSse()
                } else {
                    this.scheduleReconnect(() => this.connectWs())
                }
            }
        } catch {
            this.connectSse()
        }
    }

    private teardownWs(): void {
        this.clearWsOpenTimer()
        this.stopHeartbeat()
        if (this.ws) {
            this.ws.onopen = this.ws.onmessage = this.ws.onerror = this.ws.onclose = null
            try {
                this.ws.close()
            } catch {
                /* noop */
            }
            this.ws = null
        }
    }

    // ─── SSE fallback ──────────────────────────────────────────────────────────

    private connectSse(): void {
        try {
            const es = new EventSource(chatStreamUrl({ projectId: this.opts.projectId }), {
                withCredentials: true,
            })
            this.sse = es
            es.onopen = () => this.onConnected('sse')
            const handle = (type: string) => (ev: MessageEvent) => {
                try {
                    const frame = parseFrame(type, JSON.parse(ev.data))
                    if (frame) this.opts.onFrame(frame)
                } catch {
                    /* ignore */
                }
            }
            es.addEventListener('message', handle('message'))
            es.addEventListener('badge', handle('badge'))
            es.addEventListener('presence', handle('presence'))
            es.addEventListener('read', handle('read'))
            es.onerror = () => {
                this.teardownSse()
                if (this.closedByUser) return
                this.scheduleReconnect(() => this.connectSse())
            }
        } catch {
            this.scheduleReconnect(() => this.connectSse())
        }
    }

    private teardownSse(): void {
        if (this.sse) {
            this.sse.onopen = this.sse.onerror = null
            try {
                this.sse.close()
            } catch {
                /* noop */
            }
            this.sse = null
        }
    }

    // ─── Общее ──────────────────────────────────────────────────────────────────

    private onConnected(transport: Transport): void {
        const reconnected = this.hadConnection
        this.hadConnection = true
        this.attempts = 0
        this.setTransport(transport)
        if (reconnected) this.opts.onReconnect?.()
    }

    private setTransport(t: Transport): void {
        if (this.transport !== t) {
            this.transport = t
            this.opts.onStatus?.(t)
        }
    }

    private scheduleReconnect(fn: () => void): void {
        // пока ждём пере-подключение — это 'connecting' (мы не сдались),
        // а не 'disconnected'. Баннер «потеряно» не мигает между попытками.
        this.setTransport('connecting')
        const delay = Math.min(BASE_BACKOFF_MS * 2 ** this.attempts, MAX_BACKOFF_MS)
        this.attempts += 1
        this.reconnectTimer = setTimeout(fn, delay)
    }

    private startHeartbeat(): void {
        this.stopHeartbeat()
        this.heartbeat = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                // соединение пережило интервал → считаем его стабильным,
                // сбрасываем счётчик падений (даём WS полный бюджет снова)
                this.wsDrops = 0
                this.ws.send(JSON.stringify({ type: 'heartbeat' }))
                // open-state на сервере с TTL — продлеваем, пока беседа открыта
                if (this.lastOpenConversationId) {
                    this.ws.send(
                        JSON.stringify({ type: 'open', conversationId: this.lastOpenConversationId }),
                    )
                }
            }
        }, HEARTBEAT_MS)
    }

    private stopHeartbeat(): void {
        if (this.heartbeat) {
            clearInterval(this.heartbeat)
            this.heartbeat = null
        }
    }

    private clearWsOpenTimer(): void {
        if (this.wsOpenTimer) {
            clearTimeout(this.wsOpenTimer)
            this.wsOpenTimer = null
        }
    }

    private clearTimers(): void {
        this.clearWsOpenTimer()
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer)
            this.reconnectTimer = null
        }
    }
}
