import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { SWRConfig } from 'swr'
import type { DocumentDetailResponse, DocumentGroup } from '@/services/DocumentsService'

const apiGetDocument = vi.fn()
const apiCheckDrift = vi.fn()
const apiDownloadVersion = vi.fn()
const apiDeleteDocument = vi.fn()
const toastPush = vi.fn()
const navigateMock = vi.fn()

let permissions = new Set<string>()
const pidRef = vi.hoisted(() => ({ value: 'p-detail' }))

vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))
vi.mock('@/services/DocumentsService', () => ({
    apiGetDocument: (...a: unknown[]) => apiGetDocument(...a),
    apiCheckDrift: (...a: unknown[]) => apiCheckDrift(...a),
    apiDownloadVersion: (...a: unknown[]) => apiDownloadVersion(...a),
    apiDeleteDocument: (...a: unknown[]) => apiDeleteDocument(...a),
    contextRecordRoute: () => '/deals/d1',
    CONTEXT_LABELS: { deal: 'Сделка', order: 'Продажа', contact: 'Контакт', company: 'Компания', none: '—' },
    GENERATED_VIA_LABELS: { manual: 'Вручную', regenerate: 'Переген.', automation: 'Авто', upload: 'Загрузка' },
    mimeShort: () => 'PDF',
    formatBytes: (b: number) => `${b} B`,
}))
vi.mock('@/components/shared/documents/GenerateDialog', () => ({
    default: ({ isOpen }: { isOpen?: boolean }) =>
        isOpen ? <div>Диалог перегенерации</div> : null,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => pidRef.value }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        permissions.has(`${subject}:${action}`),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigateMock,
    }
})

import DocumentDetails from './DocumentDetails'

const group = (over: Partial<DocumentGroup> = {}): DocumentGroup => ({
    groupId: 'g1',
    projectId: 'p-detail',
    contextType: 'deal',
    contextRecordId: 'd1',
    templateId: 't1',
    name: 'Акт выполненных работ',
    ownerId: 'user-1',
    currentVersion: 1,
    generatedVia: 'manual',
    driftStale: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
})

const detail = (over: Partial<DocumentDetailResponse> = {}): DocumentDetailResponse => ({
    group: group(),
    versions: [
        {
            versionId: 'v1',
            version: 1,
            mimeType: 'application/pdf',
            sizeBytes: 2048,
            fileHash: 'abc',
            templateId: 't1',
            templateRevision: 3,
            emptyRequiredVars: [],
            generatedBy: 'user-1',
            generatedVia: 'manual',
            createdAt: 1_700_000_000_000,
        },
    ],
    drift: {
        hasDrift: false,
        changedKeys: [],
        sourceAvailable: true,
    },
    ...over,
})

const renderDetails = (route = '/documents/g1') =>
    render(
        <SWRConfig value={{ provider: () => new Map() }}>
            <MemoryRouter initialEntries={[route]}>
                <Routes>
                    <Route path="/documents/:id" element={<DocumentDetails />} />
                </Routes>
            </MemoryRouter>
        </SWRConfig>,
    )

describe('DocumentDetails', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        permissions = new Set([
            'documents:read',
            'documents.generate:execute',
            'documents:delete',
        ])
        pidRef.value = 'p-detail'
        apiGetDocument.mockResolvedValue(detail())
        apiCheckDrift.mockResolvedValue(detail().drift)
        apiDownloadVersion.mockResolvedValue({ url: 'https://example.com/file.pdf' })
        apiDeleteDocument.mockResolvedValue(undefined)
        window.open = vi.fn()
    })

    it('без documents:read показывает NoPermissionState', () => {
        permissions = new Set()
        renderDetails()
        expect(screen.getByText('Нет права documents:read.')).toBeInTheDocument()
    })

    it('404 показывает «Документ не найден»', async () => {
        apiGetDocument.mockRejectedValue(
            Object.assign(new Error('not found'), { response: { status: 404, data: {} } }),
        )
        renderDetails()
        expect(await screen.findByText('Документ не найден')).toBeInTheDocument()
    })

    it('прочая ошибка — ErrorState с «Повторить»', async () => {
        apiGetDocument.mockRejectedValue(new Error('boom'))
        renderDetails()
        expect(await screen.findByText('Не удалось загрузить документ')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('загружает карточку с названием и кнопкой скачивания', async () => {
        renderDetails()
        expect(await screen.findByText('Акт выполненных работ')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Скачать' })).toBeInTheDocument()
        expect(screen.getByText('Информация')).toBeInTheDocument()
    })

    it('drift-баннер при hasDrift=true', async () => {
        apiCheckDrift.mockResolvedValue({
            hasDrift: true,
            changedKeys: ['clientName'],
            changedValues: [{ key: 'clientName', oldValue: 'ООО А', newValue: 'ООО Б' }],
            sourceAvailable: true,
        })
        renderDetails()
        expect(
            await screen.findByText('Реквизиты изменились с момента генерации'),
        ).toBeInTheDocument()
        expect(screen.getByText(/clientName/)).toBeInTheDocument()
    })

    it('баннер пустых обязательных полей', async () => {
        apiGetDocument.mockResolvedValue(
            detail({
                versions: [
                    {
                        ...detail().versions[0],
                        emptyRequiredVars: ['clientInn'],
                    },
                ],
            }),
        )
        renderDetails()
        expect(await screen.findByText('Не заполнены обязательные поля')).toBeInTheDocument()
        expect(screen.getByText(/clientInn/)).toBeInTheDocument()
    })

    it('PDF preview: iframe с presigned URL', async () => {
        renderDetails()
        await screen.findByText('Акт выполненных работ')
        await waitFor(() =>
            expect(apiDownloadVersion).toHaveBeenCalledWith('v1', { projectId: 'p-detail' }),
        )
        expect(
            await screen.findByTitle('Предпросмотр Акт выполненных работ'),
        ).toHaveAttribute('src', 'https://example.com/file.pdf')
    })

    it('удаление: confirm и navigate на список', async () => {
        renderDetails()
        await screen.findByText('Акт выполненных работ')
        fireEvent.click(screen.getByRole('button', { name: 'Удалить' }))
        fireEvent.click(screen.getAllByRole('button', { name: 'Удалить' }).at(-1)!)
        await waitFor(() =>
            expect(apiDeleteDocument).toHaveBeenCalledWith('g1', { projectId: 'p-detail' }),
        )
        expect(navigateMock).toHaveBeenCalledWith('/documents')
    })

    it('первичная загрузка: карточка появляется после ответа API', async () => {
        let resolve!: (value: DocumentDetailResponse) => void
        apiGetDocument.mockImplementation(
            () =>
                new Promise((r) => {
                    resolve = r
                }),
        )
        renderDetails()
        expect(screen.queryByText('Акт выполненных работ')).not.toBeInTheDocument()
        resolve(detail())
        expect(await screen.findByText('Акт выполненных работ')).toBeInTheDocument()
    })

    it('ошибка скачивания показывает toast', async () => {
        apiDownloadVersion.mockRejectedValue(new Error('network'))
        renderDetails()
        await screen.findByText('Акт выполненных работ')
        fireEvent.click(screen.getByRole('button', { name: 'Скачать' }))
        await waitFor(() =>
            expect(toastPush).toHaveBeenCalledWith('Не удалось скачать документ'),
        )
    })

    it('не-PDF: предлагает скачать файл для просмотра', async () => {
        apiGetDocument.mockResolvedValue(
            detail({
                versions: [
                    {
                        ...detail().versions[0],
                        mimeType:
                            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    },
                ],
            }),
        )
        renderDetails()
        expect(await screen.findByText('Скачайте для просмотра')).toBeInTheDocument()
    })

    it('ошибка предпросмотра PDF показывает сообщение', async () => {
        apiDownloadVersion.mockRejectedValue(new Error('preview fail'))
        renderDetails()
        expect(
            await screen.findByText('Не удалось загрузить предпросмотр'),
        ).toBeInTheDocument()
    })

    it('кнопка «Перегенерировать» открывает диалог', async () => {
        renderDetails()
        await screen.findByText('Акт выполненных работ')
        fireEvent.click(screen.getByRole('button', { name: 'Перегенерировать' }))
        expect(screen.getByText('Диалог перегенерации')).toBeInTheDocument()
    })
})
