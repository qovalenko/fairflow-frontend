/** Presence-индикатор (06-frontend-contract §3.4, FR-CHAT-23/250). */
export interface PresenceIndicatorProps {
    state: 'online' | 'offline'
    lastSeenAt?: number
    className?: string
}

function formatLastSeen(lastSeenAt: number): string {
    const diffMs = Date.now() - lastSeenAt
    if (diffMs < 60_000) return 'был в сети меньше минуты назад'
    const mins = Math.floor(diffMs / 60_000)
    if (mins < 60) return `был в сети ${mins} мин. назад`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `был в сети ${hours} ч. назад`
    const days = Math.floor(hours / 24)
    return `был в сети ${days} дн. назад`
}

const PresenceIndicator = ({ state, lastSeenAt, className }: PresenceIndicatorProps) => {
    const online = state === 'online'
    const label = online
        ? 'В сети'
        : lastSeenAt
          ? formatLastSeen(lastSeenAt)
          : 'Не в сети'
    return (
        <span
            className={className}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
            <span
                title={label}
                style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: online ? '#22c55e' : '#9ca3af',
                }}
            />
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{label}</span>
        </span>
    )
}

export default PresenceIndicator
