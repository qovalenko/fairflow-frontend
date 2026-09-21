import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AttachmentChip from './AttachmentChip'
import type { AttachmentVM } from './chatTypes'

const apiGetAttachmentDownloadUrl = vi.fn()
const notifyChatError = vi.fn()

vi.mock('./chatService', () => ({
    apiGetAttachmentDownloadUrl: (...a: unknown[]) => apiGetAttachmentDownloadUrl(...a),
}))
vi.mock('./chatUi', () => ({
    notifyChatError: (e: unknown) => notifyChatError(e),
}))

const att: AttachmentVM = {
    documentId: 'd1',
    versionId: 'v1',
    fileName: 'report.pdf',
    mime: 'application/pdf',
    size: 2048,
}

describe('AttachmentChip', () => {
    beforeEach(() => {
        apiGetAttachmentDownloadUrl.mockReset()
        notifyChatError.mockClear()
        vi.spyOn(window, 'open').mockImplementation(() => null)
    })

    it('показывает имя и размер файла', () => {
        render(<AttachmentChip attachment={att} />)
        expect(screen.getByText('report.pdf')).toBeInTheDocument()
        expect(screen.getByText('2 KB')).toBeInTheDocument()
    })

    it('onRemove удаляет из черновика', () => {
        const onRemove = vi.fn()
        render(<AttachmentChip attachment={att} onRemove={onRemove} />)
        fireEvent.click(screen.getByLabelText('Удалить вложение'))
        expect(onRemove).toHaveBeenCalledTimes(1)
    })

    it('downloadable: запрашивает presigned URL и открывает окно', async () => {
        apiGetAttachmentDownloadUrl.mockResolvedValue({ url: 'https://cdn/x' })
        render(<AttachmentChip attachment={att} downloadable />)
        fireEvent.click(screen.getByTitle('report.pdf'))
        await waitFor(() =>
            expect(apiGetAttachmentDownloadUrl).toHaveBeenCalledWith('v1'),
        )
        expect(window.open).toHaveBeenCalledWith('https://cdn/x', '_blank', 'noopener')
    })

    it('downloadable: ошибка → notifyChatError', async () => {
        apiGetAttachmentDownloadUrl.mockRejectedValue(new Error('fail'))
        render(<AttachmentChip attachment={att} downloadable />)
        fireEvent.click(screen.getByTitle('report.pdf'))
        await waitFor(() => expect(notifyChatError).toHaveBeenCalled())
    })
})
