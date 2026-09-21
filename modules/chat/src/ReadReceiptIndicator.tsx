/** Read-receipt индикатор (06-frontend-contract §3.4, FR-CHAT-21). */
export interface ReadReceiptIndicatorProps {
    variant: 'dm' | 'group'
    read: boolean
    readCount?: number
    totalMembers?: number
    /** канал > порога (NFR-CHAT-12) → только агрегат */
    aggregateOnly?: boolean
    className?: string
}

const ReadReceiptIndicator = ({
    variant,
    read,
    readCount,
    totalMembers,
    aggregateOnly,
    className,
}: ReadReceiptIndicatorProps) => {
    if (variant === 'dm') {
        return (
            <span className={className} style={{ fontSize: 11, color: read ? '#4f46e5' : '#9ca3af' }}>
                {read ? '✓✓ прочитано' : '✓ отправлено'}
            </span>
        )
    }
    if (aggregateOnly) {
        return (
            <span className={className} style={{ fontSize: 11, color: '#9ca3af' }}>
                прочитали {readCount ?? 0}
            </span>
        )
    }
    return (
        <span className={className} style={{ fontSize: 11, color: '#9ca3af' }}>
            прочитали {readCount ?? 0} из {totalMembers ?? 0}
        </span>
    )
}

export default ReadReceiptIndicator
