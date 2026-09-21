import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Button, Input, Select } from '@fairflow/shared-ui'
import { notifyChatError, notifySuccess } from './chatUi'
import { apiListProjectMembers } from './chatService'
import { useConversationActions } from './useChat'
import { qa } from './qa'
import type { ConversationVM } from './chatTypes'

export interface NewConversationDrawerProps {
    open: boolean
    projectId?: string
    /** текущий пользователь — исключается из списка собеседников */
    currentUserId?: string
    canManage?: boolean
    onClose: () => void
    onCreated: (conv: ConversationVM) => void
    /** быстрый вход «заметки себе» (FR-CHAT-030) */
    onSelfNotes?: () => void
}

/** Создание DM/группы/канала (FR-CHAT-2,3,4,5). */
const NewConversationDrawer = ({
    open,
    projectId,
    currentUserId,
    canManage,
    onClose,
    onCreated,
    onSelfNotes,
}: NewConversationDrawerProps) => {
    const { create } = useConversationActions(projectId)
    const [type, setType] = useState<'dm' | 'group' | 'project_channel'>('dm')
    const [peerUserId, setPeerUserId] = useState('')
    const [title, setTitle] = useState('')
    const [memberUserIds, setMemberUserIds] = useState<string[]>([])
    const [search, setSearch] = useState('')
    const [busy, setBusy] = useState(false)

    // Участники проекта (control /projects/:id/members) — для пикера собеседников
    // вместо ручного ввода userId. Грузим только когда drawer открыт.
    const { data: members, isLoading: membersLoading } = useSWR(
        open && projectId ? (['chat/new-conv/members', projectId] as const) : null,
        () => apiListProjectMembers(projectId),
        { revalidateOnFocus: false },
    )

    // Кандидаты в собеседники: все участники проекта кроме текущего пользователя,
    // отфильтрованные по строке поиска (по имени).
    const candidates = useMemo(() => {
        const q = search.trim().toLowerCase()
        return (members ?? [])
            .filter((m) => m.id && m.id !== currentUserId)
            .filter((m) => (q ? (m.name || m.id).toLowerCase().includes(q) : true))
    }, [members, currentUserId, search])

    if (!open) return null

    const toggleMember = (id: string) => {
        setMemberUserIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
        )
    }

    const canSubmit =
        type === 'dm'
            ? !!peerUserId
            : type === 'group'
              ? memberUserIds.length > 0 && title.trim().length > 0
              : title.trim().length > 0

    const submit = async () => {
        setBusy(true)
        try {
            const conv = await create({
                type,
                peerUserId: type === 'dm' ? peerUserId : undefined,
                title: type !== 'dm' ? title.trim() : undefined,
                memberUserIds: type === 'group' ? memberUserIds : undefined,
            })
            notifySuccess('Беседа создана')
            onCreated(conv)
            onClose()
        } catch (e) {
            notifyChatError(e)
        } finally {
            setBusy(false)
        }
    }

    // Список участников проекта с состояниями загрузки/пустоты — общий рендер
    // для DM (single-select по radio) и group (multi-select по checkbox).
    const renderPicker = (mode: 'dm' | 'group') => {
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
        if ((members ?? []).filter((m) => m.id !== currentUserId).length === 0) {
            return (
                <div style={{ fontSize: 13, color: '#6b7280', padding: '8px 0' }}>
                    В проекте нет других участников
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
                    {...qa('chat.create.memberSearch')}
                />
                <div
                    style={{
                        maxHeight: 280,
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
                            const selected =
                                mode === 'dm'
                                    ? peerUserId === m.id
                                    : memberUserIds.includes(m.id)
                            return (
                                <label
                                    key={m.id}
                                    {...qa('chat.create.peer', { user: m.id })}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        background: selected ? '#eff6ff' : 'transparent',
                                        borderBottom: '1px solid #f3f4f6',
                                    }}
                                >
                                    <input
                                        type={mode === 'dm' ? 'radio' : 'checkbox'}
                                        name={mode === 'dm' ? 'dm-peer' : undefined}
                                        checked={selected}
                                        onChange={() =>
                                            mode === 'dm'
                                                ? setPeerUserId(m.id)
                                                : toggleMember(m.id)
                                        }
                                    />
                                    <span style={{ fontSize: 14 }}>{m.name || m.id}</span>
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
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                {...qa('chat.create.drawer')}
                style={{ width: 360, height: '100%', background: '#fff', padding: 20, overflowY: 'auto' }}
            >
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Новый диалог</h3>
                {currentUserId && (
                    <Button
                        variant="plain"
                        style={{ marginBottom: 12, width: '100%' }}
                        {...qa('chat.create.selfNotes')}
                        onClick={() => {
                            if (onSelfNotes) {
                                onSelfNotes()
                                return
                            }
                            setBusy(true)
                            create({
                                type: 'dm',
                                peerUserId: currentUserId,
                            })
                                .then((conv) => {
                                    notifySuccess('Заметки себе созданы')
                                    onCreated(conv)
                                    onClose()
                                })
                                .catch(notifyChatError)
                                .finally(() => setBusy(false))
                        }}
                        disabled={busy}
                    >
                        Заметки себе
                    </Button>
                )}
                <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Тип</label>
                <Select
                    value={type}
                    onChange={(e) => {
                        setType(e.target.value as typeof type)
                        // сбрасываем выбор при смене типа, чтобы не утекали id между режимами
                        setPeerUserId('')
                        setMemberUserIds([])
                        setSearch('')
                    }}
                    {...qa('chat.create.type')}
                >
                    <option value="dm">Личный (DM)</option>
                    <option value="group">Группа</option>
                    {canManage && <option value="project_channel">Канал проекта</option>}
                </Select>

                {type === 'dm' && (
                    <div style={{ marginTop: 12 }}>
                        <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
                            Собеседник
                        </label>
                        {renderPicker('dm')}
                    </div>
                )}
                {type !== 'dm' && (
                    <div style={{ marginTop: 12 }}>
                        <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>Название</label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} {...qa('chat.create.title')} />
                    </div>
                )}
                {type === 'group' && (
                    <div style={{ marginTop: 12 }}>
                        <label style={{ fontSize: 13, display: 'block', marginBottom: 4 }}>
                            Участники
                            {memberUserIds.length > 0 && (
                                <span style={{ color: '#6b7280' }}> · выбрано {memberUserIds.length}</span>
                            )}
                        </label>
                        {renderPicker('group')}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                    <Button onClick={submit} disabled={busy || !canSubmit} {...qa('chat.create.submit')}>
                        {busy ? 'Создание…' : 'Создать'}
                    </Button>
                    <Button variant="plain" onClick={onClose} {...qa('chat.create.cancel')}>
                        Отмена
                    </Button>
                </div>
            </div>
        </div>
    )
}

export default NewConversationDrawer
