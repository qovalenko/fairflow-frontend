import { useState } from 'react'
import dayjs from 'dayjs'
import { Button } from '@fairflow/shared-ui'
import AttachmentChip from './AttachmentChip'
import EntityChip from './EntityChip'
import { parseMessageSegments } from './chatEntityRefs'
import { qa } from './qa'
import type { MessageVM } from './chatTypes'

/**
 * Рендер текста сообщения с inline-ссылками на CRM-сущности (P2.c): парсер бьёт
 * text на сегменты, entity-сегмент → кликабельный чип. Обычный текст сохраняет
 * перенос строк. `onOwn` меняет палитру чипа под тёмный пузырь своих сообщений.
 */
const MessageText = ({ text, onOwn }: { text: string; onOwn: boolean }) => {
    const segments = parseMessageSegments(text)
    return (
        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {segments.map((seg, i) =>
                seg.kind === 'entity' ? (
                    <EntityChip key={i} entity={seg.ref} onOwn={onOwn} />
                ) : (
                    <span key={i}>{seg.text}</span>
                ),
            )}
        </span>
    )
}

/** Реплай-превью: токены сущностей деградируют до метки (чипы в цитате не нужны). */
const previewText = (text: string): string =>
    parseMessageSegments(text)
        .map((s) => (s.kind === 'entity' ? s.ref.label : s.text))
        .join('')

export interface MessageItemProps {
    message: MessageVM
    isOwn: boolean
    /** имя автора (резолв через resolveName на уровне окна) */
    senderName?: string
    /** редактирование/удаление своего (FR-CHAT-13,14,15) */
    canEdit?: boolean
    /** удаление чужого — модерация (chat:moderate, FR-CHAT-49) */
    canModerate?: boolean
    onEdit?: (messageId: string, text: string) => void
    onDelete?: (messageId: string) => void
    onReply?: (message: MessageVM) => void
    onRetry?: (message: MessageVM) => void
    /** цитата reply (для рендера replyTo, в т.ч. tombstone-плейсхолдер) */
    replyPreview?: { text: string; senderName?: string; deleted?: boolean } | null
}

/** Одно сообщение (06-frontend-contract §3.2). tombstone → плейсхолдер (FR-CHAT-16). */
const MessageItem = ({
    message,
    isOwn,
    senderName,
    canEdit,
    canModerate,
    onEdit,
    onDelete,
    onReply,
    onRetry,
    replyPreview,
}: MessageItemProps) => {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(message.text)
    const isDeleted = !!message.deletedAt || message.kind === 'system'

    const submitEdit = () => {
        if (onEdit && draft.trim() && draft !== message.text) onEdit(message.id, draft.trim())
        setEditing(false)
    }

    return (
        <div
            {...qa('chat.message.row', {
                message: message.id || message.clientMessageId,
            })}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isOwn ? 'flex-end' : 'flex-start',
                margin: '6px 12px',
            }}
        >
            {!isOwn && senderName && (
                <span style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{senderName}</span>
            )}
            <div
                style={{
                    maxWidth: '70%',
                    padding: '8px 12px',
                    borderRadius: 12,
                    background: isDeleted ? '#f3f4f6' : isOwn ? '#4f46e5' : '#f1f5f9',
                    color: isDeleted ? '#9ca3af' : isOwn ? '#fff' : '#111827',
                    fontStyle: isDeleted ? 'italic' : 'normal',
                    opacity: message.pending ? 0.6 : 1,
                    border: message.failed ? '1px solid #ef4444' : 'none',
                }}
            >
                {replyPreview && (
                    <div
                        style={{
                            borderLeft: '2px solid currentColor',
                            paddingLeft: 6,
                            marginBottom: 4,
                            fontSize: 12,
                            opacity: 0.8,
                        }}
                    >
                        {replyPreview.senderName ? `${replyPreview.senderName}: ` : ''}
                        {replyPreview.deleted ? 'сообщение удалено' : previewText(replyPreview.text)}
                    </div>
                )}

                {isDeleted ? (
                    <span>сообщение удалено</span>
                ) : editing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={2}
                            style={{ width: '100%', borderRadius: 6, padding: 4, color: '#111827' }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                            <Button onClick={submitEdit}>Сохранить</Button>
                            <Button variant="plain" onClick={() => setEditing(false)}>
                                Отмена
                            </Button>
                        </div>
                    </div>
                ) : (
                    <span
                        {...qa('chat.message.text', {
                            message: message.id || message.clientMessageId,
                        })}
                    >
                        <MessageText text={message.text} onOwn={isOwn} />
                    </span>
                )}

                {!isDeleted && message.attachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {message.attachments.map((a) => (
                            <AttachmentChip key={a.versionId || a.documentId} attachment={a} downloadable />
                        ))}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 10, color: '#9ca3af' }}>
                <span>{dayjs(message.sentAt).format('HH:mm')}</span>
                {message.editedAt && <span>(изменено)</span>}
                {message.pending && <span>отправка…</span>}
                {message.failed && (
                    <button
                        type="button"
                        onClick={() => onRetry?.(message)}
                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                    >
                        повторить
                    </button>
                )}
                {!isDeleted && !message.pending && (
                    <>
                        {onReply && (
                            <button type="button" onClick={() => onReply(message)} style={linkBtn}>
                                ответить
                            </button>
                        )}
                        {isOwn && canEdit && onEdit && (
                            <button type="button" onClick={() => setEditing(true)} style={linkBtn}>
                                изменить
                            </button>
                        )}
                        {((isOwn && canEdit) || canModerate) && onDelete && (
                            <button type="button" onClick={() => onDelete(message.id)} style={linkBtn}>
                                удалить
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

const linkBtn: React.CSSProperties = {
    border: 'none',
    background: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
    padding: 0,
    fontSize: 10,
}

export default MessageItem
