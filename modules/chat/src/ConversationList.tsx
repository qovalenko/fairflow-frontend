import { useMemo, useState } from 'react'
import { Button, Segment } from '@fairflow/shared-ui'
import ConversationListItem from './ConversationListItem'
import StateView from './StateView'
import { useConversations } from './useChat'
import { qa } from './qa'
import type { ConversationVM } from './chatTypes'

export type ListScopeFilter = 'dm_group' | 'project_channel' | 'all'

export interface ConversationListProps {
    scopeFilter: ListScopeFilter
    projectId?: string
    activeConversationId?: string
    onSelect: (conversationId: string) => void
    /** для DM-заголовка: текущий пользователь + резолв userId→имя */
    currentUserId?: string
    resolveName?: (userId: string) => string
    onScopeChange?: (next: ListScopeFilter) => void
    includeArchived?: boolean
    /** UX-гейты от родителя */
    canRead: boolean
    canWrite: boolean
    billingReadonly?: boolean
    /** CTA «Новый диалог» */
    onCreate?: () => void
    /** FR-CHAT-030: создать DM с самим собой */
    onSelfNotes?: () => void
}

const SEGMENTS = [
    { value: 'all', label: 'Все' },
    { value: 'dm_group', label: 'DM / группы' },
    { value: 'project_channel', label: 'Каналы' },
]

function matchesScope(c: ConversationVM, f: ListScopeFilter): boolean {
    if (f === 'all') return true
    if (f === 'project_channel') return c.type === 'project_channel'
    return c.type === 'dm' || c.type === 'group'
}

/** Список бесед (06-frontend-contract §3.1, FR-CHAT-1). */
const ConversationList = ({
    scopeFilter,
    projectId,
    activeConversationId,
    onSelect,
    currentUserId,
    resolveName,
    onScopeChange,
    includeArchived,
    canRead,
    canWrite,
    billingReadonly,
    onCreate,
    onSelfNotes,
}: ConversationListProps) => {
    const [localScope, setLocalScope] = useState<ListScopeFilter>(scopeFilter)
    const effScope = onScopeChange ? scopeFilter : localScope
    const setScope = (v: string) => {
        const next = v as ListScopeFilter
        if (onScopeChange) onScopeChange(next)
        else setLocalScope(next)
    }

    const { conversations, isLoading, error, moduleDisabled, refresh } = useConversations({
        projectId,
        includeArchived,
        enabled: canRead,
    })

    const filtered = useMemo(
        () => conversations.filter((c) => matchesScope(c, effScope)),
        [conversations, effScope],
    )

    if (!canRead) return <StateView kind="no-permission" />
    if (moduleDisabled) return <StateView kind="disabled-module" />

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Segment value={effScope} items={SEGMENTS} onChange={setScope} />
                    {canWrite && !billingReadonly && onCreate && (
                        <div style={{ display: 'flex', gap: 4 }}>
                            {onSelfNotes && (
                                <Button variant="plain" onClick={onSelfNotes} {...qa('chat.list.selfNotes')}>
                                    Себе
                                </Button>
                            )}
                            <Button onClick={onCreate} {...qa('chat.list.create')}>
                                + Новый
                            </Button>
                        </div>
                    )}
                </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {isLoading ? (
                    <StateView kind="loading" />
                ) : error ? (
                    <StateView kind="error" onRetry={refresh} />
                ) : filtered.length === 0 ? (
                    <StateView
                        kind="empty"
                        title="Нет бесед"
                        cta={
                            canWrite && !billingReadonly && onCreate ? (
                                <Button onClick={onCreate} {...qa('chat.list.createEmpty')}>
                                    Новый диалог
                                </Button>
                            ) : undefined
                        }
                    />
                ) : (
                    filtered.map((c) => (
                        <ConversationListItem
                            key={c.id}
                            conversation={c}
                            active={c.id === activeConversationId}
                            onSelect={onSelect}
                            currentUserId={currentUserId}
                            resolveName={resolveName}
                        />
                    ))
                )}
            </div>
        </div>
    )
}

export default ConversationList
