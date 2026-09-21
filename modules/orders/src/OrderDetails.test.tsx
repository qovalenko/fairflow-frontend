import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { SWRConfig } from 'swr'
import OrderDetails from './OrderDetails'
import {
    apiGetOrder,
    apiGetOrderType,
    apiGetActivities,
    apiGetOrderHistory,
} from '@/services/CrmService'
import type { Order, OrderTypeDetail } from '@/@types/crm'

vi.mock('@/services/CrmService', () => ({
    apiGetOrder: vi.fn(),
    apiGetOrderType: vi.fn(),
    apiGetOrderHistory: vi.fn(),
    apiGetActivities: vi.fn(),
    apiMoveOrderStage: vi.fn(),
    apiRetryOrderFinalAction: vi.fn(),
    apiAcceptOrderDrift: vi.fn(),
    apiCheckOrderDrift: vi.fn(),
    apiCancelOrder: vi.fn(),
}))
vi.mock('@/components/template/EntityCreateDrawer', () => ({ default: () => null }))
vi.mock('@/components/shared/documents/DocumentsTab', () => ({ default: () => null }))
vi.mock('@/utils/hooks/useDocumentsModuleEnabled', () => ({ default: () => true }))
vi.mock('@fairflow/shared-ui', () => ({ CompanyActivitiesWidget: () => null }))
vi.mock('@/utils/hooks/usePermission', () => ({ default: () => () => true }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))

const navigateMock = vi.fn()
vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router')
    return {
        ...actual,
        useNavigate: () => navigateMock,
    }
})

const orderMock = vi.mocked(apiGetOrder)
const typeMock = vi.mocked(apiGetOrderType)
const activitiesMock = vi.mocked(apiGetActivities)
const historyMock = vi.mocked(apiGetOrderHistory)

const order = {
    id: 'o-1',
    number: 'ORD-42',
    typeId: 't-1',
    typeName: 'Договор',
    orderTypeVersion: 1,
    stageId: 's-1',
    stageName: 'Оформление',
    status: 'ACTIVE',
    assigneeName: 'Иванов И.',
    fields: {},
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
} as unknown as Order

const typeDetail = {
    id: 't-1',
    revision: {
        version: 1,
        stages: [
            { id: 's-1', name: 'Оформление', order: 0, requiredFieldKeys: [] },
            { id: 's-2', name: 'Подписание', order: 1, requiredFieldKeys: [] },
        ],
        fields: [],
        documentTemplates: [],
        finalActionSpec: { type: 'none', config: {} },
        retryPolicy: { maxAttempts: 3, baseIntervalSec: 60 },
    },
} as unknown as OrderTypeDetail

const renderDetails = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/orders/o-1']}>
                <Routes>
                    <Route path="/orders/:id" element={<OrderDetails />} />
                </Routes>
            </MemoryRouter>
        </SWRConfig>,
    )

describe('OrderDetails — вкладка «Информация» и навигация', () => {
    beforeEach(() => {
        navigateMock.mockReset()
        orderMock.mockResolvedValue(order as never)
        typeMock.mockResolvedValue(typeDetail as never)
        activitiesMock.mockResolvedValue({ list: [], total: 0 } as never)
        historyMock.mockResolvedValue({ items: [] } as never)
    })

    it('показывает шапку продажи и прогресс по этапам закреплённой ревизии', async () => {
        renderDetails()

        expect(await screen.findByText('ORD-42')).toBeInTheDocument()
        expect(screen.getAllByText('Оформление').length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('Подписание')).toBeInTheDocument()
        expect(typeMock).toHaveBeenCalledWith('t-1', 1)
    })

    it('кнопка «Редактировать» в шапке ведёт на форму правки', async () => {
        const user = userEvent.setup()
        renderDetails()

        await user.click(await screen.findByRole('button', { name: 'Редактировать' }))
        expect(navigateMock).toHaveBeenCalledWith('/orders/o-1/edit')
    })
})
