import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { TemplateSummary } from '@/services/DocumentsService'

const apiListTemplates = vi.fn()
const apiPublishTemplate = vi.fn()
const apiArchiveTemplate = vi.fn()
const apiDeleteTemplate = vi.fn()
const apiDownloadTemplate = vi.fn()
const toastPush = vi.fn()

let permissions = new Set<string>()
const pidRef = vi.hoisted(() => ({ value: 'p-tpl' }))

vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))
vi.mock('@/services/DocumentsService', () => ({
    apiListTemplates: (...a: unknown[]) => apiListTemplates(...a),
    apiPublishTemplate: (...a: unknown[]) => apiPublishTemplate(...a),
    apiArchiveTemplate: (...a: unknown[]) => apiArchiveTemplate(...a),
    apiDeleteTemplate: (...a: unknown[]) => apiDeleteTemplate(...a),
    apiDownloadTemplate: (...a: unknown[]) => apiDownloadTemplate(...a),
    CONTEXT_LABELS: { deal: 'Сделка', order: 'Продажа', contact: 'Контакт', company: 'Компания', none: '—' },
}))
vi.mock('@/components/shared/documents/DocumentsHowTo', () => ({
    default: () => <div>Как настроить шаблоны</div>,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => pidRef.value }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        permissions.has(`${subject}:${action}`),
}))

import Templates from './Templates'

const tpl = (over: Partial<TemplateSummary> = {}): TemplateSummary => ({
    id: 't1',
    name: 'Договор поставки',
    contextType: 'deal',
    status: 'draft',
    currentRevision: null,
    draftRevision: 2,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    createdBy: 'admin',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    documentsCreated: 5,
    ...over,
})

const renderTemplates = (ui: ReactElement = <Templates />) =>
    render(
        <SWRConfig value={{ provider: () => new Map() }}>
            <MemoryRouter initialEntries={['/documents/templates']}>{ui}</MemoryRouter>
        </SWRConfig>,
    )

describe('Templates', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        permissions = new Set(['documents:read', 'documents:manage'])
        pidRef.value = 'p-tpl'
        apiListTemplates.mockResolvedValue({ items: [] })
        apiPublishTemplate.mockResolvedValue(undefined)
        apiArchiveTemplate.mockResolvedValue(undefined)
        apiDeleteTemplate.mockResolvedValue(undefined)
        apiDownloadTemplate.mockResolvedValue({ url: 'https://example.com/t.docx' })
        window.open = vi.fn()
    })

    it('без documents:read — NoPermissionState', () => {
        permissions = new Set()
        renderTemplates()
        expect(screen.getByText('Нет права documents:read.')).toBeInTheDocument()
    })

    it('пустой список с manage — CTA «Создать шаблон»', async () => {
        renderTemplates()
        expect(await screen.findByText('Как настроить шаблоны')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Создать шаблон' })).toBeInTheDocument()
    })

    it('пустой список без manage — без кнопки создания', async () => {
        permissions = new Set(['documents:read'])
        renderTemplates()
        await screen.findByText('Как настроить шаблоны')
        expect(screen.queryByRole('button', { name: 'Создать шаблон' })).not.toBeInTheDocument()
    })

    it('ошибка загрузки — ErrorState', async () => {
        apiListTemplates.mockRejectedValue(new Error('fail'))
        renderTemplates()
        expect(await screen.findByText('Не удалось загрузить шаблоны')).toBeInTheDocument()
    })

    it('карточка шаблона: publish для черновика', async () => {
        const user = userEvent.setup()
        apiListTemplates.mockResolvedValue({ items: [tpl()] })
        renderTemplates()
        await screen.findByText('Договор поставки')
        await user.click(screen.getByRole('button', { name: 'Опубликовать' }))
        await waitFor(() =>
            expect(apiPublishTemplate).toHaveBeenCalledWith('t1', { projectId: 'p-tpl' }),
        )
        expect(toastPush).toHaveBeenCalledWith('Шаблон опубликован')
    })

    it('архивирование опубликованного шаблона', async () => {
        const user = userEvent.setup()
        apiListTemplates.mockResolvedValue({
            items: [tpl({ status: 'published', currentRevision: 1, draftRevision: null })],
        })
        renderTemplates()
        await screen.findByText('Договор поставки')
        await user.click(screen.getByRole('button', { name: 'Архивировать' }))
        await waitFor(() =>
            expect(apiArchiveTemplate).toHaveBeenCalledWith('t1', { projectId: 'p-tpl' }),
        )
    })

    it('удаление: confirm и apiDeleteTemplate', async () => {
        apiListTemplates.mockResolvedValue({ items: [tpl()] })
        renderTemplates()
        await screen.findByText('Договор поставки')
        fireEvent.click(screen.getByRole('button', { name: 'Удалить' }))
        expect(screen.getByText('Удалить шаблон?')).toBeInTheDocument()
        fireEvent.click(screen.getAllByRole('button', { name: 'Удалить' }).at(-1)!)
        await waitFor(() =>
            expect(apiDeleteTemplate).toHaveBeenCalledWith('t1', { projectId: 'p-tpl' }),
        )
    })

    it('первичная загрузка: список появляется после ответа API', async () => {
        let resolve!: (value: { items: TemplateSummary[] }) => void
        apiListTemplates.mockImplementation(
            () =>
                new Promise((r) => {
                    resolve = r
                }),
        )
        renderTemplates()
        expect(screen.queryByText('Как настроить шаблоны')).not.toBeInTheDocument()
        resolve({ items: [] })
        expect(await screen.findByText('Как настроить шаблоны')).toBeInTheDocument()
    })

    it('скачивание шаблона открывает presigned URL', async () => {
        apiListTemplates.mockResolvedValue({ items: [tpl()] })
        renderTemplates()
        await screen.findByText('Договор поставки')
        fireEvent.click(screen.getByRole('button', { name: 'Скачать' }))
        await waitFor(() =>
            expect(apiDownloadTemplate).toHaveBeenCalledWith('t1', { projectId: 'p-tpl' }),
        )
        expect(window.open).toHaveBeenCalledWith(
            'https://example.com/t.docx',
            '_blank',
            'noopener',
        )
    })
})
