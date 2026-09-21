import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Button, Input } from '@fairflow/shared-ui'
import { notifyChatError, notifySuccess } from './chatUi'
import { apiListProjectMembers } from './chatService'
import { useConversationActions } from './useChat'

export interface InviteMemberDrawerProps {
    open: boolean
    conversationId: string
    projectId?: string
    /** текущий пользователь — не предлагаем «пригласить себя» */
    currentUserId?: string
    /** активные (не покинувшие) участники беседы — исключаются из кандидатов */
    memberIds: string[]
    resolveName?: (userId: string) => string
    onClose: () => void
    /** беседа обновлена (состав/счётчик) — родитель рефетчит участников */
    onInvited: () => void
}

/**
 * Приглашение участников проекта в существующую группу/канал (FR-CHAT-6, UpdateMembers add).
 * Пикер членов проекта (control /projects/:id/members) с поиском и мультивыбором —
 * тот же паттерн, что в NewConversationDrawer. Уже состоящие в беседе исключаются.
 */
const InviteMemberDrawer = ({
    open,
    conversationId,
    projectId,
    currentUserId,
    memberIds,
    resolveName,
    onClose,
    onInvited,
}: InviteMemberDrawerProps) => {
    const { invite } = useConversationActions(projectId)
    const [selected, setSelected] = useState<string[]>([])
    const [search, setSearch] = useState('')
    const [busy, setBusy] = useState(false)

    // Члены проекта грузим только при открытом drawer (как в NewConversationDrawer).
    const { data: members, isLoading: membersLoading } = useSWR(
        open && projectId ? (['chat/invite/members', projectId, conversationId] as const) : null,
        () => apiListProjectMembers(projectId),
        { revalidateOnFocus: false },
    )

    const memberSet = useMemo(() => new Set(memberIds), [memberIds])

    // Кандидаты = члены проекта, ещё не состоящие в беседе и не текущий пользователь,
    // отфильтрованные по строке поиска.
    const candidates = useMemo(() => {
        const q = search.trim().toLowerCase()
        return (members ?? [])
            .filter((m) => m.id && m.id !== currentUserId && !memberSet.has(m.id))
            .filter((m) => (q ? (m.name || m.id).toLowerCase().includes(q) : true))
    }, [members, currentUserId, memberSet, search])

    if (!open) return null

    const toggle = (id: string) => {
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    }

    const close = () => {
        setSelected([])
        setSearch('')
        onClose()
    }

    const submit = async () => {
        if (selected.length === 0) return
        setBusy(true)
        try {
            await invite(conversationId, selected)
            notifySuccess(
                selected.length === 1 ? 'Участник добавлен' : `Добавлено участников: ${selected.length}`,
            )
            onInvited()
            close()
        } catch (e) {
            notifyChatError(e)
        } finally {
            setBusy(false)
        }
    }

    const renderPicker = () => {
        if (membersLoading) {
            return (
                <div style={{ fontSize: 13, color: '#6b7280', padding: '8px 0' }}>
                    Загрузка участников…
                </div>
            )
        }
        if (!projectId) {
            return (
                <div style={{ fontSize: 13, color: '#6b7280', padding: '8px 0' }}>
                    Недоступно в личном пространстве
                </div>
            )
        }
        const anyCandidate = (members ?? []).some(
            (m) => m.id && m.id !== currentUserId && !memberSet.has(m.id),
        )
        if (!anyCandidate) {
            return (
                <div style={{ fontSize: 13, color: '#6b7280', padding: '8px 0' }}>
                    Все участники проекта уже в беседе
                </div>
            )
        }
        return (
            <>
                <Input
                    placeholder="Поиск по имени…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ marginBottom: 8 }}
                />
                <div
                    style={{
                        maxHeight: 320,
                        overflowY: 'auto',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                    }}
                >
                    {candidates.length === 0 ? (
                        <div style={{ fontSize: 13, color: '#6b7280', padding: 12 }}>
                            Ничего не найдено
                        </div>
                    ) : (
                        candidates.map((m) => {
                            const isSelected = selected.includes(m.id)
                            return (
                                <label
                                    key={m.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        background: isSelected ? '#eff6ff' : 'transparent',
                                        borderBottom: '1px solid #f3f4f6',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggle(m.id)}
                                    />
                                    <span style={{ fontSize: 14 }}>
                                        {resolveName?.(m.id) || m.name || m.id}
                                    </span>
                                </label>
                            )
                        })
                    )}
                </div>
            </>
        )
    }

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.3)',
                display: 'flex',
                justifyContent: 'flex-end',
                zIndex: 50,
            }}
            onClick={close}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{ width: 360, height: '100%', background: '#fff', padding: 20, overflowY: 'auto' }}
            >
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                    Пригласить участника
                    {selected.length > 0 && (
                        <span style={{ color: '#6b7280', fontWeight: 400 }}>
                            {' · выбрано '}
                            {selected.length}
                        </span>
                    )}
                </h3>
                {renderPicker()}
                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                    <Button onClick={submit} disabled={busy || selected.length === 0}>
                        {busy ? 'Добавление…' : 'Пригласить'}
                    </Button>
                    <Button variant="plain" onClick={close}>
                        Отмена
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default InviteMemberDrawer
