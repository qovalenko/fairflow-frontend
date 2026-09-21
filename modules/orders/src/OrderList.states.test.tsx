import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import OrderList from './OrderList'
import { apiGetOrders, apiGetOrderTypes, apiExportOrders } from '@/services/CrmService'

vi.mock('@/services/CrmService', () => ({
    apiGetOrders: vi.fn(),
    apiGetOrderTypes: vi.fn(),
    apiExportOrders: vi.fn(),
}))
vi.mock('@/components/template/EntityCreateDrawer', () => ({
    default: ({
        isOpen,
        orderInitialData,
        entityType,
    }: {
        isOpen?: boolean
        orderInitialData?: { dealId?: string; productId?: string }
        entityType?: string
    }) =>
        isOpen ? (
            <div>
                Создание {entityType}:{' '}
                {orderInitialData?.dealId ?? orderInitialData?.productId ?? '—'}
            </div>
        ) : null,
}))
vi.mock('./MultiCreateWizard', () => ({
    default: ({ isOpen, context }: { isOpen?: boolean; context?: { dealId?: string } }) =>
        isOpen ? <div>Мастер массового создания: {context?.dealId}</div> : null,
}))
vi.mock('@/components/shared/HostSlot', () => ({
    default: ({ fallback }: { fallback?: unknown }) => fallback ?? null,
}))

const canRef = vi.hoisted(() => ({
    fn: (_domain: string, _action: string): boolean => true,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (domain: string, action: string) => canRef.fn(domain, action),
}))

const pidRef = vi.hoisted(() => ({ value: 'p1' }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => pidRef.value }))

vi.mock('@/utils/hooks/useCompanyNames', () => ({
    default: () => ({ companyName: (id: string) => (id === 'c1' ? 'ООО Ромашка' : '') }),
}))

const navigateMock = vi.fn()
vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router')
    return { ...actual, useNavigate: () => navigateMock }
})

const getOrdersMock = vi.mocked(apiGetOrders)
const getTypesMock = vi.mocked(apiGetOrderTypes)
const exportMock = vi.mocked(apiExportOrders)

const order = (overrides: Record<string, unknown> = {}) => ({
    id: 'o1',
    number: 'SO-1',
    typeId: 't1',
    typeName: 'Договор',
    stageId: 's1',
    stageName: 'Подготовка',
    status: 'ACTIVE',
    fields: {},
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
})

const renderList = (route = '/orders') =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={[route]}>
                <OrderList />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('OrderList — состояния и права', () => {
    beforeEach(() => {
        canRef.fn = () => true
        pidRef.value = 'p-states'
        navigateMock.mockReset()
        getTypesMock.mockResolvedValue([{ id: 't1', name: 'Договор' }] as never)
        exportMock.mockResolvedValue({
            blob: new Blob(['number\n'], { type: 'text/csv' }),
            truncated: false,
            rowCount: 1,
            total: 1,
        })
        URL.createObjectURL = vi.fn(() => 'blob:orders')
        URL.revokeObjectURL = vi.fn()
    })

    it('загрузка — таблица показывает скелетон, пока список не пришёл', () => {
        getOrdersMock.mockImplementation(() => new Promise(() => {}))
        renderList()
        expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
    })

    it('без orders:write — нет кнопки «Создать продажу» в пустом списке', async () => {
        canRef.fn = (domain, action) =>
            !(domain === 'orders' && action === 'write')
        getOrdersMock.mockResolvedValue({ list: [], total: 0 } as never)
        renderList()
        expect(await screen.findByText('Продаж пока нет')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Создать продажу' })).not.toBeInTheDocument()
    })

    it('без orders:export — кнопки «Экспорт продаж» нет', async () => {
        canRef.fn = (domain, action) =>
            !(domain === 'orders' && action === 'export')
        getOrdersMock.mockResolvedValue({ list: [order()], total: 1 } as never)
        renderList()
        await screen.findByText('Подготовка')
        expect(screen.queryByRole('button', { name: 'Экспорт продаж' })).not.toBeInTheDocument()
    })

    it('переключатель «Доска» ведёт на /orders/kanban', async () => {
        const user = userEvent.setup()
        getOrdersMock.mockResolvedValue({ list: [order()], total: 1 } as never)
        renderList()
        await screen.findByText('Подготовка')
        await user.click(screen.getByRole('button', { name: /Доска/ }))
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/orders/kanban'))
    })

    it('dealId в URL открывает создание продажи из сделки', async () => {
        getOrdersMock.mockResolvedValue({ list: [], total: 0 } as never)
        renderList('/orders?dealId=d-from-deal')
        expect(await screen.findByText('Создание order: d-from-deal')).toBeInTheDocument()
    })

    it('dealId+multi=1 открывает мастер массового создания', async () => {
        getOrdersMock.mockResolvedValue({ list: [], total: 0 } as never)
        renderList('/orders?dealId=d-multi&multi=1')
        expect(
            await screen.findByText('Мастер массового создания: d-multi'),
        ).toBeInTheDocument()
    })
})

describe('OrderList — таблица и массовые действия', () => {
    beforeEach(() => {
        canRef.fn = () => true
        pidRef.value = 'p-table'
        getTypesMock.mockResolvedValue([{ id: 't1', name: 'Договор' }] as never)
    })

    it('строка с данными — компания, ответственный и предупреждение drift', async () => {
        getOrdersMock.mockResolvedValue({
            list: [
                order({
                    id: 'o-rich',
                    companyId: 'c1',
                    assigneeName: 'Пётр Иванов',
                    hasDrift: true,
                    stageChangedAt: Date.now() - 8 * 86_400_000,
                }),
            ],
            total: 1,
        } as never)
        renderList()
        expect(await screen.findByText('ООО Ромашка')).toBeInTheDocument()
        expect(screen.getByText('Пётр Иванов')).toBeInTheDocument()
        expect(screen.getByText('8 дн.')).toBeInTheDocument()
        const row = screen.getByText('ООО Ромашка').closest('tr')
        expect(row?.querySelector('.text-amber-500')).toBeTruthy()
    })

    it('выделение строк — кнопка «Поставить задачу» и пункт «Только выделенные»', async () => {
        const user = userEvent.setup()
        getOrdersMock.mockResolvedValue({
            list: [
                order({ id: 'o-sel', assigneeName: 'Алиса' }),
                order({ id: 'o2', assigneeName: 'Борис' }),
            ],
            total: 2,
        } as never)
        renderList()
        await screen.findByText('Алиса')

        const checkboxes = await screen.findAllByRole('checkbox')
        await user.click(checkboxes[1])

        await user.click(document.querySelector('.bg-yellow-500') as HTMLElement)
        expect(await screen.findByText(/^Создание task:/)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Экспорт продаж' }))
        expect(await screen.findByText('Только выделенные (1)')).toBeInTheDocument()
    })

    it('фильтр «дней в этапе» — предупреждение в меню экспорта', async () => {
        const user = userEvent.setup()
        getOrdersMock.mockResolvedValue({ list: [order()], total: 1 } as never)
        renderList()
        await screen.findByText('Подготовка')

        await user.type(screen.getByPlaceholderText('В этапе более (дней)'), '7')
        await user.click(screen.getByRole('button', { name: 'Экспорт продаж' }))
        expect(
            await screen.findByText(/Фильтр «дней в этапе» сервер к выгрузке не применяет/),
        ).toBeInTheDocument()
    })

    it('403 на экспорт — toast «Нет права на экспорт продаж»', async () => {
        const user = userEvent.setup()
        getOrdersMock.mockResolvedValue({ list: [order()], total: 1 } as never)
        exportMock.mockRejectedValue({ response: { status: 403 } })
        renderList()
        await screen.findByText('Подготовка')

        await user.click(screen.getByRole('button', { name: 'Экспорт продаж' }))
        await user.click(await screen.findByText(/По текущим фильтрам \(весь список/))

        await waitFor(() => expect(exportMock).toHaveBeenCalled())
        expect(await screen.findByText('Нет права на экспорт продаж (orders:export).')).toBeInTheDocument()
    })
})
