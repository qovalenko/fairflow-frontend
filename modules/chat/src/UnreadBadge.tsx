/** Unread-бейдж (06-frontend-contract §3.4). count>0 → indigo-пилюля. */
export interface UnreadBadgeProps {
    count: number
    className?: string
}

const UnreadBadge = ({ count, className }: UnreadBadgeProps) => {
    if (!count || count <= 0) return null
    return (
        <span
            className={className}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 18,
                height: 18,
                padding: '0 5px',
                borderRadius: 9,
                backgroundColor: '#4f46e5',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                lineHeight: '18px',
            }}
        >
            {count > 99 ? '99+' : count}
        </span>
    )
}

export default UnreadBadge
