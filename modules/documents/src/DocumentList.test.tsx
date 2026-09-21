import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { DocumentGroup } from '@/services/DocumentsService'

const apiListDocuments = vi.fn()
const apiDeleteDocument = vi.fn()
const apiUploadDocument = vi.fn()
const apiDownloadVersion = vi.fn()
const toastPush = vi.fn()
const navigateMock = vi.fn()

let permissions = new Set<string>()
let visibilityLevel: string | undefined = 'own_and_department'
const pidRef = vi.hoisted(() => ({ value: 'p-docs' }))

vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))
vi.mock('@/services/DocumentsService', () => ({
    apiListDocuments: (...a: unknown[]) => apiListDocuments(...a),
    apiDeleteDocument: (...a: unknown[]) => apiDeleteDocument(...a),
    apiUploadDocument: (...a: unknown[]) => apiUploadDocument(...a),
    apiDownloadVersion: (...a: unknown[]) => apiDownloadVersion(...a),
    contextRecordRoute: () => '/deals/d1',
    CONTEXT_LABELS: { deal: 'Сделка', order: 'Продажа', contact: 'Контакт', company: 'Компания', none: '—' },
    GENERATED_VIA_BADGE: { manual: 'Вручную', regenerate: 'Переген.', automation: 'Авто', upload: 'Загрузка' },
    mimeShort: () => 'PDF',
}))
vi.mock('@/components/shared/documents/GenerateDialog', () => ({
    default: ({ isOpen }: { isOpen?: boolean }) =>
        isOpen ? <div>Диалог генерации открыт</div> : null,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => pidRef.value }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        permissions.has(`${subject}:${action}`),
}))
vi.mock('@/utils/hooks/usePermissionStatus', () => ({
    useVisibilityScope: () =>
        visibilityLevel ? { level: visibilityLevel } : undefined,
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigateMock,
    }
})

import DocumentList from './DocumentList'

const doc = (over: Partial<DocumentGroup> = {}): DocumentGroup => ({
    groupId: 'g1',
    projectId: 'p-docs',
    contextType: 'deal',
    contextRecordId: 'd1',
    templateId: 't1',
    name: 'Договор поставки',
    ownerId: 'user-1',
    currentVersion: 2,
    generatedVia: 'manual',
    driftStale: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...over,
})

const renderList = (ui: ReactElement = <DocumentList />) =>
    render(
        <SWRConfig value={{ provider: () => new Map() }}>
            <MemoryRouter initialEntries={['/documents']}>{ui}</MemoryRouter>
        </SWRConfig>,
    )

describe('DocumentList', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        permissions = new Set([
            'documents:read',
            'documents.generate:execute',
            'documents:delete',
        ])
        visibilityLevel = 'own_and_department'
        pidRef.value = 'p-docs'
        apiListDocuments.mockResolvedValue({ list: [], total: 0 })
        apiDeleteDocument.mockResolvedValue(undefined)
        apiUploadDocument.mockResolvedValue(undefined)
    })

    it('без documents:read показывает NoPermissionState', () => {
        permissions = new Set()
        renderList()
        expect(screen.getByText('Нет права documents:read.')).toBeInTheDocument()
        expect(apiListDocuments).not.toHaveBeenCalled()
    })

    it('пустой список предлагает загрузку и генерацию', async () => {
        renderList()
        expect(await screen.findByText('Нет документов.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Загрузить документ' })).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: 'Сгенерировать' }).length).toBeGreaterThan(0)
    })

    it('ошибка загрузки показывает сообщение и «Повторить»', async () => {
        apiListDocuments.mockRejectedValue(new Error('boom'))
        renderList()
        expect(await screen.findByText('Не удалось загрузить документы')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('рендерит строки таблицы с данными', async () => {
        apiListDocuments.mockResolvedValue({ list: [doc()], total: 1 })
        renderList()
        expect(await screen.findByText('Договор поставки')).toBeInTheDocument()
        expect(screen.getByText('user-1')).toBeInTheDocument()
    })

    it('поиск уходит в apiListDocuments и пустой ответ даёт «Ничего не найдено»', async () => {
        const user = userEvent.setup()
        apiListDocuments.mockResolvedValue({ list: [], total: 0 })
        renderList()
        await screen.findByText('Нет документов.')
        await user.type(screen.getByPlaceholderText('Поиск документов...'), 'акт')
        await waitFor(() => expect(apiListDocuments).toHaveBeenCalled())
        const lastCall = apiListDocuments.mock.calls.at(-1)?.[0]
        expect(lastCall).toMatchObject({ search: 'акт', projectId: 'p-docs' })
        expect(await screen.findByText('Ничего не найдено.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Сбросить фильтры' })).toBeInTheDocument()
    })

    it('вкладка «Сгенерированные» передаёт sourceKind=generated', async () => {
        const user = userEvent.setup()
        apiListDocuments.mockResolvedValue({ list: [doc()], total: 1 })
        renderList()
        await screen.findByText('Договор поставки')
        await user.click(screen.getByRole('tab', { name: 'Сгенерированные' }))
        await waitFor(() => {
            expect(
                apiListDocuments.mock.calls.some((c) => c[0]?.sourceKind === 'generated'),
            ).toBe(true)
        })
    })

    it('удаление: диалог подтверждения и вызов apiDeleteDocument', async () => {
        apiListDocuments.mockResolvedValue({ list: [doc()], total: 1 })
        apiDeleteDocument.mockResolvedValue(undefined)
        renderList()
        await screen.findByText('Договор поставки')
        fireEvent.click(document.querySelector('[data-qa-id="documents.list.delete"]')!)
        expect(screen.getByText('Удалить документ?')).toBeInTheDocument()
        fireEvent.click(screen.getAllByRole('button', { name: 'Удалить' }).at(-1)!)
        await waitFor(() => expect(apiDeleteDocument).toHaveBeenCalledWith('g1', { projectId: 'p-docs' }))
        expect(toastPush).toHaveBeenCalledWith('Документ удалён')
    })

    it('кнопка «Сгенерировать» открывает GenerateDialog', async () => {
        const user = userEvent.setup()
        apiListDocuments.mockResolvedValue({ list: [doc()], total: 1 })
        renderList()
        await screen.findByText('Договор поставки')
        await user.click(screen.getByRole('button', { name: 'Сгенерировать' }))
        expect(screen.getByText('Диалог генерации открыт')).toBeInTheDocument()
    })

    it('ссылка «Документы отдела» видна при visibility own_and_department+', async () => {
        apiListDocuments.mockResolvedValue({ list: [doc()], total: 1 })
        renderList()
        await screen.findByText('Договор поставки')
        expect(screen.getByText('Документы отдела →')).toBeInTheDocument()
    })

    it('ссылка «Документы отдела» скрыта при visibility only_own', async () => {
        visibilityLevel = 'only_own'
        apiListDocuments.mockResolvedValue({ list: [doc()], total: 1 })
        renderList()
        await screen.findByText('Договор поставки')
        expect(screen.queryByText('Документы отдела →')).not.toBeInTheDocument()
    })

    it('первичная загрузка: контент списка появляется после ответа API', async () => {
        let resolve!: (value: { list: DocumentGroup[]; total: number }) => void
        apiListDocuments.mockImplementation(
            () =>
                new Promise((r) => {
                    resolve = r
                }),
        )
        renderList()
        expect(screen.getByRole('heading', { name: 'Документы' })).toBeInTheDocument()
        expect(screen.queryByText('Нет документов.')).not.toBeInTheDocument()
        resolve({ list: [], total: 0 })
        expect(await screen.findByText('Нет документов.')).toBeInTheDocument()
    })

    it('фильтры даты и drift уходят в apiListDocuments', async () => {
        const user = userEvent.setup()
        apiListDocuments.mockResolvedValue({ list: [], total: 0 })
        renderList()
        await screen.findByText('Нет документов.')
        fireEvent.change(screen.getByLabelText('Дата от'), { target: { value: '2024-01-01' } })
        fireEvent.change(screen.getByLabelText('Дата до'), { target: { value: '2024-01-31' } })
        await user.click(screen.getByLabelText('Есть drift'))
        await waitFor(() => {
            expect(
                apiListDocuments.mock.calls.some(
                    (c) => c[0]?.hasDrift === true && c[0]?.from && c[0]?.to,
                ),
            ).toBe(true)
        })
    })

    it('вкладка «Загруженные» передаёт sourceKind=uploaded', async () => {
        const user = userEvent.setup()
        apiListDocuments.mockResolvedValue({ list: [doc()], total: 1 })
        renderList()
        await screen.findByText('Договор поставки')
        await waitFor(() => expect(apiListDocuments).toHaveBeenCalled())
        expect(apiListDocuments.mock.calls.at(-1)?.[0]?.sourceKind).toBeUndefined()

        await user.click(screen.getByRole('tab', { name: 'Загруженные' }))
        await waitFor(() => {
            expect(apiListDocuments.mock.calls.at(-1)?.[0]?.sourceKind).toBe('uploaded')
        })
    })

    it('загрузка файла через input показывает toast об успехе', async () => {
        const user = userEvent.setup()
        apiListDocuments.mockResolvedValue({ list: [], total: 0 })
        apiUploadDocument.mockResolvedValue(undefined)
        renderList()
        await screen.findByText('Нет документов.')
        const file = new File(['content'], 'scan.pdf', { type: 'application/pdf' })
        await user.upload(screen.getByLabelText('Загрузить документ'), file)
        await waitFor(() => expect(apiUploadDocument).toHaveBeenCalled())
        expect(toastPush).toHaveBeenCalledWith('Документ загружён')
    })

    it('скачивание из списка без versionId ведёт в карточку документа', async () => {
        apiListDocuments.mockResolvedValue({ list: [doc()], total: 1 })
        renderList()
        await screen.findByText('Договор поставки')
        fireEvent.click(screen.getByTitle('Скачать (в карточке документа)'))
        expect(navigateMock).toHaveBeenCalledWith('/documents/g1')
    })
})
