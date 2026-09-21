import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { SWRConfig } from 'swr'
import OrderTypeForm from './OrderTypeForm'
import {
    apiGetOrderType,
    apiCreateOrderType,
    apiUpdateOrderType,
    apiGetMembers,
} from '@/services/CrmService'
import { apiListConnections } from '@/services/AutomationService'
import { apiListTemplates } from '@/services/DocumentsService'

vi.mock('@/services/CrmService', () => ({
    apiGetOrderType: vi.fn(),
    apiCreateOrderType: vi.fn(),
    apiUpdateOrderType: vi.fn(),
    apiGetMembers: vi.fn(),
}))
vi.mock('@/services/AutomationService', () => ({
    apiListConnections: vi.fn(),
}))
vi.mock('@/services/DocumentsService', () => ({
    apiListTemplates: vi.fn(),
}))
vi.mock('./orderUtils', async () => {
    const actual = await vi.importActual<typeof import('./orderUtils')>('./orderUtils')
    return { ...actual, notifySuccess: vi.fn() }
})

const canRef = vi.hoisted(() => ({
    fn: (_domain: string, _action: string): boolean => true,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (domain: string, action: string) => canRef.fn(domain, action),
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))

const navigateMock = vi.fn()
vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router')
    return { ...actual, useNavigate: () => navigateMock }
})

const getTypeMock = vi.mocked(apiGetOrderType)
const createTypeMock = vi.mocked(apiCreateOrderType)
const updateTypeMock = vi.mocked(apiUpdateOrderType)
const membersMock = vi.mocked(apiGetMembers)
const connectionsMock = vi.mocked(apiListConnections)
const listTemplatesMock = vi.mocked(apiListTemplates)

const typeDetail = (id: string) => ({
    id,
    name: 'Договор',
    currentVersion: 2,
    revision: {
        version: 2,
        fields: [{ key: 'note', label: 'Примечание', type: 'TEXT', required: false }],
        stages: [{ id: 's1', name: 'Подготовка', order: 0, requiredFieldKeys: [] }],
        documentTemplates: [],
        finalActionSpec: { type: 'none', config: {} },
        retryPolicy: { maxAttempts: 3, baseIntervalSec: 60 },
    },
})

const renderForm = (path: string) =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/orders/types/:id/edit" element={<OrderTypeForm />} />
                    <Route path="/orders/types/new" element={<OrderTypeForm />} />
                </Routes>
            </MemoryRouter>
        </SWRConfig>,
    )

describe('OrderTypeForm — состояния экрана', () => {
    beforeEach(() => {
        canRef.fn = () => true
        navigateMock.mockReset()
        getTypeMock.mockReset()
        createTypeMock.mockReset()
        updateTypeMock.mockReset()
        membersMock.mockResolvedValue([] as never)
        connectionsMock.mockResolvedValue({ list: [], total: 0 } as never)
        listTemplatesMock.mockResolvedValue({ items: [] } as never)
        createTypeMock.mockResolvedValue({} as never)
        updateTypeMock.mockResolvedValue({} as never)
    })

    it('редактирование — индикатор загрузки, пока тип не пришёл', () => {
        getTypeMock.mockImplementation(() => new Promise(() => {}))
        renderForm('/orders/types/t-load/edit')
        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        expect(screen.queryByText('Редактирование типа продажи')).not.toBeInTheDocument()
    })

    it('ошибка загрузки типа — сообщение и «К списку типов»', async () => {
        getTypeMock.mockRejectedValue(new Error('not found'))
        renderForm('/orders/types/t-err/edit')
        expect(await screen.findByText('Не удалось загрузить тип продажи')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'К списку типов' })).toBeInTheDocument()
    })

    it('без orders:manage — баннер «только просмотр», кнопки «Сохранить» нет', async () => {
        canRef.fn = (domain, action) =>
            !(domain === 'orders' && action === 'manage')
        getTypeMock.mockResolvedValue(typeDetail('t-read') as never)
        renderForm('/orders/types/t-read/edit')
        expect(
            await screen.findByText(/Просмотр без права управления типами продаж/),
        ).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument()
    })

    it('без documents:read — предупреждение, сохранённые шаблоны не затираются', async () => {
        const user = userEvent.setup()
        canRef.fn = (domain, action) =>
            !(domain === 'documents' && action === 'read')
        getTypeMock.mockResolvedValue({
            ...typeDetail('t-nodocs'),
            revision: {
                ...typeDetail('t-nodocs').revision,
                documentTemplates: [{ id: 'tpl-saved' }],
            },
        } as never)

        renderForm('/orders/types/t-nodocs/edit')
        expect(
            await screen.findByText(/Нет доступа к шаблонам документов/),
        ).toBeInTheDocument()
        expect(screen.getByText(/Уже настроенные шаблоны \(1\)/)).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Сохранить' }))
        await waitFor(() => expect(updateTypeMock).toHaveBeenCalled())
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/orders/types'))
        expect(
            (updateTypeMock.mock.calls[0][1] as { documentTemplates: { id: string }[] })
                .documentTemplates,
        ).toEqual([{ id: 'tpl-saved' }])
    })
})

describe('OrderTypeForm — создание и финальные действия', () => {
    beforeEach(() => {
        canRef.fn = () => true
        navigateMock.mockReset()
        getTypeMock.mockReset()
        createTypeMock.mockReset()
        membersMock.mockResolvedValue([{ id: 'u1', name: 'Анна' }] as never)
        connectionsMock.mockResolvedValue({
            list: [{ id: 'conn-1', name: 'CRM webhook', enabled: true }],
            total: 1,
        } as never)
        listTemplatesMock.mockResolvedValue({ items: [] } as never)
        createTypeMock.mockResolvedValue({} as never)
    })

    it('новый тип — название и этап уходят в apiCreateOrderType', async () => {
        const user = userEvent.setup()
        renderForm('/orders/types/new/edit')

        expect(await screen.findByText('Новый тип продажи')).toBeInTheDocument()
        await user.type(screen.getByPlaceholderText('Введите название'), 'Подписка')
        await user.click(screen.getByRole('button', { name: 'Добавить этап' }))
        await user.type(screen.getByPlaceholderText('Название этапа'), 'Старт')
        await user.click(screen.getByRole('button', { name: 'Создать' }))

        await waitFor(() => expect(createTypeMock).toHaveBeenCalled())
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/orders/types'))
        expect(createTypeMock.mock.calls[0][0]).toMatchObject({
            name: 'Подписка',
            stages: [{ name: 'Старт' }],
        })
    })

    it('финальное действие Email — получатель уходит в payload', async () => {
        const user = userEvent.setup()
        renderForm('/orders/types/new/edit')

        await screen.findByText('Новый тип продажи')
        await user.type(screen.getByPlaceholderText('Введите название'), 'С уведомлением')
        await user.click(screen.getByRole('button', { name: 'Добавить этап' }))
        await user.type(screen.getByPlaceholderText('Название этапа'), 'Финал')
        await user.click(screen.getByLabelText('Email'))
        await user.type(screen.getByPlaceholderText('email@example.com'), 'ops@example.com')
        await user.click(screen.getByRole('button', { name: 'Создать' }))

        await waitFor(() => expect(createTypeMock).toHaveBeenCalled())
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/orders/types'))
        expect(createTypeMock.mock.calls[0][0].finalActionSpec).toMatchObject({
            type: 'email',
            config: { to: 'ops@example.com' },
        })
    })

    it('финальное действие Webhook — подключение из allowlist уходит в payload', async () => {
        const user = userEvent.setup()
        renderForm('/orders/types/new/edit')

        await screen.findByText('Новый тип продажи')
        await user.type(screen.getByPlaceholderText('Введите название'), 'С webhook')
        await user.click(screen.getByRole('button', { name: 'Добавить этап' }))
        await user.type(screen.getByPlaceholderText('Название этапа'), 'Отправка')
        await user.click(screen.getByLabelText('Webhook'))
        const webhookBlock = screen.getByText('Подключение *').closest('div') as HTMLElement
        await user.click(within(webhookBlock).getByRole('combobox'))
        await user.click(await screen.findByText('CRM webhook'))
        await user.click(screen.getByRole('button', { name: 'Создать' }))

        await waitFor(() => expect(createTypeMock).toHaveBeenCalled())
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/orders/types'))
        expect(createTypeMock.mock.calls[0][0].finalActionSpec).toMatchObject({
            type: 'webhook',
            config: { connection_id: 'conn-1' },
        })
    })

    it('финальное действие Задача — название и исполнитель уходят в payload', async () => {
        const user = userEvent.setup()
        renderForm('/orders/types/new/edit')

        await screen.findByText('Новый тип продажи')
        await user.type(screen.getByPlaceholderText('Введите название'), 'С задачей')
        await user.click(screen.getByRole('button', { name: 'Добавить этап' }))
        await user.type(screen.getByPlaceholderText('Название этапа'), 'Закрытие')
        await user.click(screen.getByLabelText('Задача'))
        await user.type(
            screen.getByPlaceholderText('Задача по продаже {{order.number}}'),
            'Проверить документы',
        )
        const taskBlock = screen.getByText('Назначить на').closest('div') as HTMLElement
        await user.click(within(taskBlock).getByRole('combobox'))
        await user.click(await screen.findByText('Анна'))
        await user.click(screen.getByRole('button', { name: 'Создать' }))

        await waitFor(() => expect(createTypeMock).toHaveBeenCalled())
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/orders/types'))
        expect(createTypeMock.mock.calls[0][0].finalActionSpec).toMatchObject({
            type: 'task',
            config: { title: 'Проверить документы', userId: 'u1' },
        })
    })

    it('невалидный email — toast с ошибкой, сохранение не вызывается', async () => {
        const user = userEvent.setup()
        renderForm('/orders/types/new/edit')

        await screen.findByText('Новый тип продажи')
        await user.type(screen.getByPlaceholderText('Введите название'), 'Плохой email')
        await user.click(screen.getByRole('button', { name: 'Добавить этап' }))
        await user.type(screen.getByPlaceholderText('Название этапа'), 'Этап')
        await user.click(screen.getByLabelText('Email'))
        await user.type(screen.getByPlaceholderText('email@example.com'), 'не-адрес')
        await user.click(screen.getByRole('button', { name: 'Создать' }))

        expect(
            await screen.findByText(/Получатель — один почтовый адрес/),
        ).toBeInTheDocument()
        expect(createTypeMock).not.toHaveBeenCalled()
    })
})
