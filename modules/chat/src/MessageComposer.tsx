import { useRef, useState } from 'react'
import { Button } from '@fairflow/shared-ui'
import AttachmentChip from './AttachmentChip'
import MentionAutocomplete, { type MentionCandidate } from './MentionAutocomplete'
import EntityPicker from './EntityPicker'
import { apiUploadAttachment } from './chatService'
import { serializeEntityRef } from './chatEntityRefs'
import { notifyChatError } from './chatUi'
import { qa } from './qa'
import type {
    AttachmentVM,
    EntityRef,
    MemberVM,
    MessageVM,
    OutgoingMessage,
    Scope,
    DisabledReason,
} from './chatTypes'

const MAX_TEXT = 8 * 1024 // NFR-CHAT-14

export interface MessageComposerProps {
    conversationId: string
    scope: Scope
    members: MemberVM[]
    resolveName?: (userId: string) => string
    replyTo?: MessageVM | null
    onCancelReply?: () => void
    disabled?: boolean
    disabledReason?: DisabledReason
    onSend: (draft: Omit<OutgoingMessage, 'clientMessageId'>) => void | Promise<void>
    onTyping?: () => void
}

const disabledText: Record<DisabledReason, string> = {
    no_permission: 'Нет права на отправку сообщений',
    billing_readonly: 'Режим только для чтения (биллинг)',
    not_member: 'Вы не участник беседы',
    module_disabled: 'Модуль «Чат» выключен',
}

/** Композер: текст + вложения + @mentions + reply (06-frontend-contract §3.3). */
const MessageComposer = ({
    conversationId,
    members,
    resolveName,
    replyTo,
    onCancelReply,
    disabled,
    disabledReason,
    onSend,
    onTyping,
}: MessageComposerProps) => {
    const [text, setText] = useState('')
    const [attachments, setAttachments] = useState<AttachmentVM[]>([])
    const [mentionIds, setMentionIds] = useState<string[]>([])
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [entityPickerOpen, setEntityPickerOpen] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [sending, setSending] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)

    if (disabled) {
        return (
            <div
                style={{
                    padding: '12px 16px',
                    borderTop: '1px solid #f3f4f6',
                    color: '#9ca3af',
                    fontSize: 13,
                    textAlign: 'center',
                }}
            >
                {disabledReason ? disabledText[disabledReason] : 'Отправка недоступна'}
            </div>
        )
    }

    const handleTextChange = (value: string) => {
        setText(value.slice(0, MAX_TEXT))
        onTyping?.()
        // отслеживаем активный @-токен в хвосте
        const m = /(?:^|\s)@(\S*)$/.exec(value)
        setMentionQuery(m ? m[1] : null)
    }

    const pickMention = (c: MentionCandidate) => {
        setText((prev) => prev.replace(/(?:^|\s)@(\S*)$/, (full) => full.replace(/@(\S*)$/, `@${c.name} `)))
        setMentionIds((prev) => (prev.includes(c.userId) ? prev : [...prev, c.userId]))
        setMentionQuery(null)
    }

    // Вставка CRM-сущности inline-токеном в конец текста (chatEntityRefs).
    // Токен — часть text: переживает редактирование и уходит на backend как обычный
    // текст (отдельного поля в контракте нет). Деградирует до читаемой метки.
    const insertEntity = (ref: EntityRef) => {
        const token = serializeEntityRef(ref)
        setText((prev) => {
            const sep = prev.length === 0 || /\s$/.test(prev) ? '' : ' '
            return (prev + sep + token + ' ').slice(0, MAX_TEXT)
        })
        setEntityPickerOpen(false)
        setMentionQuery(null)
    }

    const handleFiles = async (files: FileList | null) => {
        if (!files || files.length === 0) return
        setUploading(true)
        try {
            for (const file of Array.from(files)) {
                const att = await apiUploadAttachment(conversationId, file)
                setAttachments((prev) => [...prev, att])
            }
        } catch (e) {
            notifyChatError(e)
        } finally {
            setUploading(false)
            if (fileRef.current) fileRef.current.value = ''
        }
    }

    const canSend = !sending && !uploading && (text.trim().length > 0 || attachments.length > 0)

    const submit = async () => {
        if (!canSend) return
        setSending(true)
        try {
            await onSend({
                text: text.trim(),
                attachments,
                mentionIds,
                replyToId: replyTo?.id ?? null,
            })
            setText('')
            setAttachments([])
            setMentionIds([])
            setMentionQuery(null)
            setEntityPickerOpen(false)
            onCancelReply?.()
        } finally {
            setSending(false)
        }
    }

    return (
        <div style={{ borderTop: '1px solid #f3f4f6', padding: 10, position: 'relative' }}>
            {replyTo && (
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '4px 8px',
                        marginBottom: 6,
                        borderLeft: '2px solid #4f46e5',
                        background: '#f5f3ff',
                        fontSize: 12,
                    }}
                >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Ответ: {replyTo.deletedAt ? 'сообщение удалено' : replyTo.text}
                    </span>
                    <button
                        type="button"
                        onClick={onCancelReply}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
                    >
                        ×
                    </button>
                </div>
            )}

            {attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                    {attachments.map((a, i) => (
                        <AttachmentChip
                            key={a.versionId || `${a.documentId}_${i}`}
                            attachment={a}
                            onRemove={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                        />
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', position: 'relative' }}>
                {mentionQuery != null && (
                    <MentionAutocomplete
                        query={mentionQuery}
                        members={members}
                        resolveName={resolveName}
                        onPick={pickMention}
                    />
                )}
                {entityPickerOpen && (
                    <EntityPicker
                        onPick={insertEntity}
                        onClose={() => setEntityPickerOpen(false)}
                    />
                )}
                <textarea
                    value={text}
                    onChange={(e) => handleTextChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            void submit()
                        }
                    }}
                    placeholder="Сообщение…  (@ — упоминание, Enter — отправить)"
                    rows={2}
                    {...qa('chat.composer.input')}
                    style={{
                        flex: 1,
                        resize: 'none',
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        padding: 8,
                        fontSize: 14,
                    }}
                />
                <input
                    ref={fileRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => handleFiles(e.target.files)}
                />
                <Button variant="plain" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    📎
                </Button>
                <Button
                    variant="plain"
                    onClick={() => setEntityPickerOpen((v) => !v)}
                    title="Прикрепить CRM-сущность"
                    {...qa('chat.composer.entityLink')}
                >
                    🔗
                </Button>
                <Button onClick={submit} disabled={!canSend} {...qa('chat.composer.send')}>
                    {sending ? '…' : 'Отправить'}
                </Button>
            </div>
        </div>
    )
}

export default MessageComposer
