import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import OrderKanban from './OrderKanban'
import OrderDetails from './OrderDetails'
import { apiGetOrdersKanban, apiGetOrder } from '@/services/CrmService'

/**
 * TODO-416: 403 MODULE_DISABLED — это не сбой загрузки. Раньше ветку знал только
 * экран типов продаж, а доска и карточка предлагали «Повторить», который при
 * выключенном модуле не может помочь. Проверяем обе оставшиеся поверхности.
 */
vi.mock('@/services/CrmService', () => ({
    apiGetOrdersKanban: vi.fn(),
    apiGetOrderTypes: vi.fn(),
    apiMoveOrderStage: vi.fn(),
    apiGetOrder: vi.fn(),
    apiGetOrderType: vi.fn(),
    apiGetActivities: vi.fn(),
    apiRetryOrderFinalAction: vi.fn(),
    apiAcceptOrderDrift: vi.fn(),
    apiCheckOrderDrift: vi.fn(),
    apiCancelOrder: vi.fn(),
}))
vi.mock('@/components/template/EntityCreateDrawer', () => ({ default: () => null }))
vi.mock('@fairflow/shared-ui', () => ({ CompanyActivitiesWidget: () => null }))
vi.mock('@/utils/hooks/usePermission', () => ({ default: () => () => true }))

const pidRef = vi.hoisted(() => ({ value: 'p1' }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => pidRef.value }))

const kanbanMock = vi.mocked(apiGetOrdersKanban)
const orderMock = vi.mocked(apiGetOrder)

const moduleDisabled = () =>
    Object.assign(new Error('module orders disabled'), {
        response: { status: 403, data: { error: { code: 'MODULE_DISABLED' } } },
    })

const serverError = () =>
    Object.assign(new Error('boom'), { response: { status: 500, data: {} } })

describe('TODO-416 — «Раздел выключен» на доске и в карточке продажи', () => {
    beforeEach(() => {
        vi.mocked(apiGetOrder).mockReset()
    })

    it('доска: MODULE_DISABLED → «Раздел выключен», без «Повторить»', async () => {
        pidRef.value = 'p-kanban-disabled'
        kanbanMock.mockRejectedValue(moduleDisabled())

        render(
            <MemoryRouter initialEntries={['/orders/kanban']}>
                <OrderKanban />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Раздел выключен')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
    })

    it('доска: обычная ошибка сохраняет «Повторить»', async () => {
        pidRef.value = 'p-kanban-error'
        kanbanMock.mockRejectedValue(serverError())

        render(
            <MemoryRouter initialEntries={['/orders/kanban']}>
                <OrderKanban />
            </MemoryRouter>,
        )

        expect(await screen.findByText('Не удалось загрузить доску')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    const renderDetails = (id: string) =>
        render(
            <MemoryRouter initialEntries={[`/orders/${id}`]}>
                <Routes>
                    <Route path="/orders/:id" element={<OrderDetails />} />
                </Routes>
            </MemoryRouter>,
        )

    it('карточка: MODULE_DISABLED → «Раздел выключен», без «Повторить»', async () => {
        orderMock.mockRejectedValue(moduleDisabled())

        renderDetails('o-disabled')

        expect(await screen.findByText('Раздел выключен')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
        // Выход из тупика остаётся.
        expect(screen.getByRole('button', { name: 'К списку' })).toBeInTheDocument()
    })

    it('карточка: 404 по-прежнему «Продажа не найдена», 500 — «Повторить»', async () => {
        orderMock.mockRejectedValue(
            Object.assign(new Error('nf'), { response: { status: 404, data: {} } }),
        )
        renderDetails('o-404')
        expect(await screen.findByText('Продажа не найдена')).toBeInTheDocument()

        orderMock.mockRejectedValue(serverError())
        renderDetails('o-500')
        expect(await screen.findByText('Не удалось загрузить продажу')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })
})
