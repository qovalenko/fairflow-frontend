import { useState } from 'react'
import { apiGetAttachmentDownloadUrl } from './chatService'
import { notifyChatError } from './chatUi'
import type { AttachmentVM } from './chatTypes'

/** Чип вложения (FR-CHAT-16,17). Download — presigned-URL через documents (scope-проверка на be). */
export interface AttachmentChipProps {
    attachment: AttachmentVM
    /** при создании сообщения — кнопка удаления из черновика */
    onRemove?: () => void
    /** read-only (история) — клик скачивает */
    downloadable?: boolean
}

function humanSize(size: number): string {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

const AttachmentChip = ({ attachment, onRemove, downloadable }: AttachmentChipProps) => {
    const [loading, setLoading] = useState(false)

    const handleDownload = async () => {
        if (!downloadable || !attachment.versionId) return
        setLoading(true)
        try {
            const { url } = await apiGetAttachmentDownloadUrl(attachment.versionId)
            window.open(url, '_blank', 'noopener')
        } catch (e) {
            notifyChatError(e)
        } finally {
            setLoading(false)
        }
    }

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
                fontSize: 12,
                cursor: downloadable ? 'pointer' : 'default',
                opacity: loading ? 0.6 : 1,
            }}
            onClick={downloadable ? handleDownload : undefined}
            title={attachment.fileName}
        >
            <span>📎</span>
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {attachment.fileName}
            </span>
            <span style={{ color: '#9ca3af' }}>{humanSize(attachment.size)}</span>
            {onRemove && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        onRemove()
                    }}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }}
                    aria-label="Удалить вложение"
                >
                    ×
                </button>
            )}
        </span>
    )
}

export default AttachmentChip
