import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { SWRConfig } from 'swr'
import OrderDetails from './OrderDetails'
import {
    apiGetOrder,
    apiGetOrderType,
    apiGetActivities,
    apiGetOrderHistory,
    apiCheckOrderDrift,
    apiAcceptOrderDrift,
    apiRetryOrderFinalAction,
    apiCancelOrder,
} from '@/services/CrmService'
import type { Order, OrderTypeDetail } from '@/@types/crm'

const notifySuccess = vi.fn()
const notifyError = vi.fn()

vi.mock('./orderUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./orderUtils')>()
    return {
        ...actual,
        notifySuccess: (m: string) => notifySuccess(m),
        notifyError: (m: string) => notifyError(m),
    }
})

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
vi.mock('@/components/shared/HostSlot', () => ({
    default: ({ fallback }: { fallback?: unknown }) => fallback ?? null,
}))
vi.mock('@fairflow/shared-ui', () => ({ CompanyActivitiesWidget: () => null }))
vi.mock('@/utils/hooks/useDocumentsModuleEnabled', () => ({ default: () => false }))

const canRef = vi.hoisted(() => ({
    fn: (_domain: string, _action: string) => true,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (domain: string, action: string) => canRef.fn(domain, action),
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))

const orderMock = vi.mocked(apiGetOrder)
const typeMock = vi.mocked(apiGetOrderType)
const activitiesMock = vi.mocked(apiGetActivities)
const historyMock = vi.mocked(apiGetOrderHistory)
const driftMock = vi.mocked(apiCheckOrderDrift)
const acceptDriftMock = vi.mocked(apiAcceptOrderDrift)
const retryMock = vi.mocked(apiRetryOrderFinalAction)
const cancelMock = vi.mocked(apiCancelOrder)

const typeDetail = {
    id: 't-1',
    revision: {
        version: 1,
        stages: [{ id: 's-1', name: 'Оформление', order: 0, requiredFieldKeys: [] }],
        fields: [],
        documentTemplates: [],
        finalActionSpec: { type: 'none', config: {} },
        retryPolicy: { maxAttempts: 3, baseIntervalSec: 60 },
    },
} as unknown as OrderTypeDetail

const renderDetails = (id = 'o-1') =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={[`/orders/${id}`]}>
                <Routes>
                    <Route path="/orders/:id" element={<OrderDetails />} />
                </Routes>
            </MemoryRouter>
        </SWRConfig>,
    )

describe('OrderDetails — состояния загрузки и баннеры', () => {
    beforeEach(() => {
        notifySuccess.mockClear()
        notifyError.mockClear()
        canRef.fn = () => true
        orderMock.mockReset()
        typeMock.mockReset()
        activitiesMock.mockResolvedValue({ list: [], total: 0 } as never)
        historyMock.mockResolvedValue({ items: [] } as never)
        typeMock.mockResolvedValue(typeDetail as never)
        vi.spyOn(window, 'confirm').mockReturnValue(true)
    })

    it('показывает индикатор загрузки, пока продажа не пришла', () => {
        orderMock.mockImplementation(() => new Promise(() => {}))
        renderDetails()
        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        expect(screen.queryByText('Продажа не найдена')).not.toBeInTheDocument()
        expect(screen.queryByText('Детали')).not.toBeInTheDocument()
    })

    it('баннер SEND_ERROR и «Повторить отправку» вызывают retry RPC', async () => {
        const user = userEvent.setup()
        orderMock.mockResolvedValue({
            id: 'o-1',
            number: 'ORD-9',
            typeId: 't-1',
            orderTypeVersion: 1,
            stageId: 's-1',
            status: 'SEND_ERROR',
            dlqError: 'Webhook timeout',
            fields: {},
            createdAt: 1,
            updatedAt: 1,
        } as never)
        retryMock.mockResolvedValue({} as never)

        renderDetails()

        expect(await screen.findByText('Ошибка отправки (финальное действие)')).toBeInTheDocument()
        expect(screen.getByText('Webhook timeout')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Повторить отправку' }))
        await waitFor(() => expect(retryMock).toHaveBeenCalledWith('o-1'))
        expect(notifySuccess).toHaveBeenCalledWith('Отправка запущена повторно')
    })

    it('баннер drift показывает diff и «Принять изменения»', async () => {
        const user = userEvent.setup()
        orderMock.mockResolvedValue({
            id: 'o-1',
            number: 'ORD-7',
            typeId: 't-1',
            orderTypeVersion: 1,
            stageId: 's-1',
            status: 'ACTIVE',
            hasDrift: true,
            fields: {},
            createdAt: 1,
            updatedAt: 1,
        } as never)
        driftMock.mockResolvedValue({
            sourceState: 'changed',
            diffs: [{ entity: 'contact', field: 'email', old: 'a@b.c', new: 'x@y.z' }],
        } as never)
        acceptDriftMock.mockResolvedValue({} as never)

        renderDetails()

        expect(await screen.findByText('Реквизиты изменились (drift)')).toBeInTheDocument()
        expect(await screen.findByText('contact.email')).toBeInTheDocument()
        expect(screen.getByText('a@b.c')).toBeInTheDocument()
        expect(screen.getByText('x@y.z')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Принять изменения' }))
        await waitFor(() => expect(acceptDriftMock).toHaveBeenCalledWith('o-1'))
        expect(notifySuccess).toHaveBeenCalledWith('Изменения реквизитов приняты')
    })

    it('«Отменить продажу» подтверждается и вызывает cancel RPC', async () => {
        const user = userEvent.setup()
        orderMock.mockResolvedValue({
            id: 'o-1',
            number: 'ORD-5',
            typeId: 't-1',
            orderTypeVersion: 1,
            stageId: 's-1',
            status: 'ACTIVE',
            fields: {},
            createdAt: 1,
            updatedAt: 1,
        } as never)
        cancelMock.mockResolvedValue({} as never)

        renderDetails()

        await user.click(await screen.findByRole('button', { name: 'Отменить продажу' }))
        expect(window.confirm).toHaveBeenCalled()
        await waitFor(() => expect(cancelMock).toHaveBeenCalledWith('o-1'))
        expect(notifySuccess).toHaveBeenCalledWith('Продажа отменена')
    })

    it('таблица попыток финального действия показывает код ответа и ошибку', async () => {
        orderMock.mockResolvedValue({
            id: 'o-1',
            number: 'ORD-3',
            typeId: 't-1',
            orderTypeVersion: 1,
            stageId: 's-1',
            status: 'SEND_ERROR',
            fields: {},
            createdAt: 1,
            updatedAt: 1,
            finalActionState: {
                status: 'failed',
                lastError: 'HTTP 502',
                attempts: [
                    {
                        attemptNo: 1,
                        at: 1_700_000_000_000,
                        responseCode: 502,
                        durationMs: 1200,
                        errorBody: 'Bad Gateway',
                    },
                ],
            },
        } as unknown as Order)

        renderDetails()

        expect(await screen.findByText('Попытки отправки')).toBeInTheDocument()
        expect(screen.getByText('HTTP 502')).toBeInTheDocument()
        expect(screen.getByText('502')).toBeInTheDocument()
        expect(screen.getByText('Bad Gateway')).toBeInTheDocument()
        expect(screen.getByText('1200 мс')).toBeInTheDocument()
    })
})
