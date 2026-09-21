import type { MemberVM } from './chatTypes'

/**
 * @mention autocomplete (06-frontend-contract §3.3, FR-CHAT-30).
 * Кандидаты — ТОЛЬКО члены scope беседы (GetConversation.members) — не утечка
 * посторонних. Резолв имени — через memberName (контрол-резолв на typeahead в
 * больших каналах — OQ-6, подтвердить fullstack-dev; в MVP по members).
 */
export interface MentionCandidate {
    userId: string
    name: string
}

export interface MentionAutocompleteProps {
    query: string
    members: MemberVM[]
    resolveName?: (userId: string) => string
    onPick: (candidate: MentionCandidate) => void
}

const MentionAutocomplete = ({ query, members, resolveName, onPick }: MentionAutocompleteProps) => {
    const q = query.trim().toLowerCase()
    const candidates: MentionCandidate[] = members
        .filter((m) => !m.leftAt)
        .map((m) => ({ userId: m.userId, name: resolveName?.(m.userId) ?? m.userId }))
        .filter((c) => !q || c.name.toLowerCase().includes(q) || c.userId.toLowerCase().includes(q))
        .slice(0, 8)

    if (candidates.length === 0) return null

    return (
        <div
            style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                marginBottom: 4,
                minWidth: 220,
                maxHeight: 240,
                overflowY: 'auto',
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                zIndex: 30,
            }}
        >
            {candidates.map((c) => (
                <button
                    key={c.userId}
                    type="button"
                    onClick={() => onPick(c)}
                    style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: 13,
                    }}
                >
                    <strong>@{c.name}</strong>
                </button>
            ))}
        </div>
    )
}

export default MentionAutocomplete
