import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { SWRConfig } from 'swr'

const apiGetTemplate = vi.fn()
const apiListDocumentVariables = vi.fn()
const apiCreateTemplate = vi.fn()
const apiUpdateTemplate = vi.fn()
const apiPublishTemplate = vi.fn()
const apiDownloadTemplate = vi.fn()
const apiGetOrderTypes = vi.fn()
const toastPush = vi.fn()
const navigateMock = vi.fn()

let permissions = new Set<string>()

vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))
vi.mock('@/services/DocumentsService', () => ({
    apiGetTemplate: (...a: unknown[]) => apiGetTemplate(...a),
    apiListDocumentVariables: (...a: unknown[]) => apiListDocumentVariables(...a),
    apiCreateTemplate: (...a: unknown[]) => apiCreateTemplate(...a),
    apiUpdateTemplate: (...a: unknown[]) => apiUpdateTemplate(...a),
    apiPublishTemplate: (...a: unknown[]) => apiPublishTemplate(...a),
    apiDownloadTemplate: (...a: unknown[]) => apiDownloadTemplate(...a),
    CONTEXT_LABELS: { deal: 'Сделка', order: 'Продажа', contact: 'Контакт', company: 'Компания', none: '—' },
}))
vi.mock('@/services/CrmService', () => ({
    apiGetOrderTypes: (...a: unknown[]) => apiGetOrderTypes(...a),
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p-form' }))
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

import TemplateForm from './TemplateForm'

const renderForm = (route: string) =>
    render(
        <SWRConfig value={{ provider: () => new Map() }}>
            <MemoryRouter initialEntries={[route]}>
                <Routes>
                    <Route path="/documents/templates/new" element={<TemplateForm />} />
                    <Route path="/documents/templates/:id/edit" element={<TemplateForm />} />
                </Routes>
            </MemoryRouter>
        </SWRConfig>,
    )

describe('TemplateForm', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        permissions = new Set(['documents:manage'])
        apiGetOrderTypes.mockResolvedValue([{ id: 'ot1', name: 'Договор' }])
        apiListDocumentVariables.mockResolvedValue({
            items: [
                { key: 'clientName', label: 'Клиент', group: 'Основное', required: true, source: 'deal' },
            ],
        })
        apiCreateTemplate.mockResolvedValue({ id: 'new-t1' })
        apiUpdateTemplate.mockResolvedValue({ id: 't1' })
        apiPublishTemplate.mockResolvedValue(undefined)
        apiGetTemplate.mockResolvedValue({
            id: 't1',
            name: 'Существующий шаблон',
            contextType: 'deal',
            orderTypeId: null,
            status: 'draft',
            currentRevision: null,
            draftRevision: 1,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            createdBy: 'admin',
            createdAt: 1,
            updatedAt: 1,
            projectId: 'p-form',
            revision: {
                version: 1,
                declaredVariables: [],
                fileHash: 'x',
                engine: 'docx',
                publishedAt: null,
                createdBy: 'admin',
                createdAt: 1,
            },
        })
    })

    it('без documents:manage — NoPermissionState', () => {
        permissions = new Set()
        renderForm('/documents/templates/new')
        expect(
            screen.getByText('Нет права documents:manage для управления шаблонами.'),
        ).toBeInTheDocument()
    })

    it('режим создания: валидация названия и файла', async () => {
        const user = userEvent.setup()
        renderForm('/documents/templates/new')
        expect(screen.getByText('Новый шаблон')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Создать' }))
        expect(await screen.findByText('Введите название шаблона')).toBeInTheDocument()
        await user.type(screen.getByPlaceholderText('Введите название'), 'Новый')
        await user.click(screen.getByRole('button', { name: 'Создать' }))
        expect(toastPush).toHaveBeenCalledWith('Загрузите DOCX-файл шаблона')
        expect(apiCreateTemplate).not.toHaveBeenCalled()
    })

    it('режим создания: успешное сохранение', async () => {
        const user = userEvent.setup()
        renderForm('/documents/templates/new')
        await user.type(screen.getByPlaceholderText('Введите название'), 'Новый договор')
        const input = screen.getByLabelText('Загрузить DOCX-файл шаблона') as HTMLInputElement
        const file = new File(['docx'], 'template.docx', {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
        fireEvent.change(input, { target: { files: [file] } })
        await user.click(screen.getByRole('button', { name: 'Создать' }))
        await waitFor(() => expect(apiCreateTemplate).toHaveBeenCalled())
        expect(navigateMock).toHaveBeenCalledWith('/documents/templates')
    })

    it('режим редактирования: подставляет имя шаблона', async () => {
        renderForm('/documents/templates/t1/edit')
        expect(await screen.findByDisplayValue('Существующий шаблон')).toBeInTheDocument()
        expect(screen.getByText('Редактирование шаблона')).toBeInTheDocument()
    })

    it('404 в edit — «Шаблон не найден»', async () => {
        apiGetTemplate.mockRejectedValue(
            Object.assign(new Error('missing'), { response: { status: 404, data: {} } }),
        )
        renderForm('/documents/templates/missing/edit')
        expect(await screen.findByText('Шаблон не найден')).toBeInTheDocument()
    })

    it('каталог переменных отображается', async () => {
        renderForm('/documents/templates/new')
        expect(await screen.findByText('{{clientName}}')).toBeInTheDocument()
        expect(screen.getByText('Клиент')).toBeInTheDocument()
    })

    it('загрузка каталога переменных показывает индикатор', async () => {
        let resolve!: (value: unknown) => void
        apiListDocumentVariables.mockImplementation(
            () =>
                new Promise((r) => {
                    resolve = r
                }),
        )
        renderForm('/documents/templates/new')
        expect(await screen.findByText('Загрузка каталога…')).toBeInTheDocument()
        resolve({ items: [] })
        expect(
            await screen.findByText(/Для выбранного контекста нет доступных переменных/),
        ).toBeInTheDocument()
    })

    it('ошибка загрузки шаблона в edit — ErrorState', async () => {
        apiGetTemplate.mockRejectedValue(new Error('server error'))
        renderForm('/documents/templates/t1/edit')
        expect(await screen.findByText('Не удалось загрузить шаблон')).toBeInTheDocument()
    })
})
