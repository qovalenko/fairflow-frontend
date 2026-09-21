import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { SWRConfig } from 'swr'
import OrderEdit from './OrderEdit'
import {
    apiGetOrder,
    apiGetOrderType,
    apiGetMembers,
    apiUpdateOrder,
} from '@/services/CrmService'
import type { Order, OrderTypeDetail } from '@/@types/crm'

/**
 * FR-ORDERS-120: форма редактирования строится по закреплённой ревизии типа
 * (`orderTypeVersion`), а не по текущей версии конструктора.
 */
vi.mock('@/services/CrmService', () => ({
    apiGetOrder: vi.fn(),
    apiGetOrderType: vi.fn(),
    apiGetMembers: vi.fn(),
    apiUpdateOrder: vi.fn(),
}))

const navigateMock = vi.fn()
let canWrite = true

vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router')
    return {
        ...actual,
        useNavigate: () => navigateMock,
        useParams: () => ({ id: 'o1' }),
    }
})
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        subject === 'orders' && action === 'write' ? canWrite : false,
}))

const getOrderMock = vi.mocked(apiGetOrder)
const getTypeMock = vi.mocked(apiGetOrderType)
const getMembersMock = vi.mocked(apiGetMembers)
const updateMock = vi.mocked(apiUpdateOrder)

const order = {
    id: 'o1',
    number: 'ORD-1',
    typeId: 't1',
    typeName: 'Договор',
    orderTypeVersion: 2,
    stageId: 's1',
    stageName: 'Подготовка',
    assigneeId: 'u1',
    assigneeName: 'Анна',
    dealName: 'Сделка X',
    notes: 'Было так',
    fields: { plan: 'Базовый', amount: '1000' },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
} as unknown as Order

const typeDetail = {
    id: 't1',
    name: 'Договор',
    currentVersion: 5,
    revision: {
        version: 2,
        fields: [
            { key: 'plan', label: 'Тариф', type: 'SELECT', required: true, options: ['Базовый', 'Премиум'] },
            { key: 'amount', label: 'Сумма', type: 'NUMBER', required: false },
        ],
        stages: [{ id: 's1', name: 'Подготовка', order: 0, requiredFieldKeys: [] }],
        documentTemplates: [],
        finalActionSpec: { type: 'none', config: {} },
        retryPolicy: { maxAttempts: 3, baseIntervalSec: 60 },
    },
} as unknown as OrderTypeDetail

const renderEdit = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/orders/o1/edit']}>
                <Routes>
                    <Route path="/orders/:id/edit" element={<OrderEdit />} />
                </Routes>
            </MemoryRouter>
        </SWRConfig>,
    )

describe('OrderEdit — редактирование продажи', () => {
    beforeEach(() => {
        canWrite = true
        navigateMock.mockReset()
        getOrderMock.mockReset()
        getTypeMock.mockReset()
        updateMock.mockReset()
        getMembersMock.mockResolvedValue([{ id: 'u1', name: 'Анна' }] as never)
        getOrderMock.mockResolvedValue(order as never)
        getTypeMock.mockResolvedValue(typeDetail as never)
        updateMock.mockResolvedValue(order as never)
    })

    it('ошибка загрузки — «Не удалось загрузить продажу»', async () => {
        getOrderMock.mockRejectedValue(new Error('boom'))
        renderEdit()
        expect(await screen.findByText('Не удалось загрузить продажу')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'К списку' })).toBeInTheDocument()
    })

    it('без права write — баннер read-only и нет кнопки «Сохранить»', async () => {
        canWrite = false
        renderEdit()

        expect(await screen.findByText(/Просмотр без права редактирования/)).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument()
        expect(screen.getByDisplayValue('ORD-1')).toBeDisabled()
    })

    it('гидрирует поля закреплённой ревизии и сохраняет изменения', async () => {
        const user = userEvent.setup()
        renderEdit()

        expect(await screen.findByText('Базовый')).toBeInTheDocument()
        expect(getTypeMock).toHaveBeenCalledWith('t1', 2)

        const notes = screen.getByPlaceholderText('Комментарий по продаже')
        await user.clear(notes)
        await user.type(notes, 'Обновлено')
        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(updateMock).toHaveBeenCalled())
        expect(updateMock.mock.calls[0][0]).toBe('o1')
        expect(updateMock.mock.calls[0][1]).toMatchObject({
            notes: 'Обновлено',
            customFields: expect.objectContaining({ plan: 'Базовый', amount: '1000' }),
            assigneeId: 'u1',
        })
        expect(navigateMock).toHaveBeenCalledWith(-1)
    })

    it('тип без настраиваемых полей — честная пустота', async () => {
        getTypeMock.mockResolvedValue({
            ...typeDetail,
            revision: { ...typeDetail.revision, fields: [] },
        } as never)

        renderEdit()
        expect(
            await screen.findByText('У типа продажи нет настраиваемых полей.'),
        ).toBeInTheDocument()
    })

    it('загрузка — индикатор, пока продажа не пришла', () => {
        getOrderMock.mockImplementation(() => new Promise(() => {}))
        renderEdit()
        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        expect(screen.queryByText('Не удалось загрузить продажу')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument()
    })

    it('ошибка сохранения — toast с текстом ошибки', async () => {
        const user = userEvent.setup()
        updateMock.mockRejectedValue({})
        renderEdit()

        await screen.findByText('Базовый')
        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        expect(await screen.findByText('Не удалось сохранить продажу')).toBeInTheDocument()
        expect(navigateMock).not.toHaveBeenCalled()
    })

    it('поля number/date/checkbox — редактирование уходит в payload', async () => {
        const user = userEvent.setup()
        getTypeMock.mockResolvedValue({
            ...typeDetail,
            revision: {
                ...typeDetail.revision,
                fields: [
                    { key: 'qty', label: 'Количество', type: 'NUMBER', required: false },
                    { key: 'due', label: 'Срок', type: 'DATE', required: false },
                    { key: 'urgent', label: 'Срочно', type: 'CHECKBOX', required: false },
                ],
            },
        } as never)
        getOrderMock.mockResolvedValue({
            ...order,
            fields: { qty: '2', due: '2026-08-21', urgent: 'false' },
        } as never)

        renderEdit()
        await screen.findByDisplayValue('2')

        const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
        await user.clear(screen.getByRole('spinbutton'))
        await user.type(screen.getByRole('spinbutton'), '5')
        await user.clear(dateInput)
        await user.type(dateInput, '2026-09-01')
        await user.click(screen.getByRole('checkbox'))
        await user.click(screen.getByRole('button', { name: 'Сохранить' }))

        await waitFor(() => expect(updateMock).toHaveBeenCalled())
        expect(updateMock.mock.calls[0][1]).toMatchObject({
            customFields: { qty: '5', due: '2026-09-01', urgent: 'true' },
        })
    })
})
