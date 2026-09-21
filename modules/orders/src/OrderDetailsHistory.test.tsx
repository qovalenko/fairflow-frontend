import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { SWRConfig } from 'swr'
import OrderDetails from './OrderDetails'
import {
    apiGetOrder,
    apiGetActivities,
    apiGetOrderHistory,
} from '@/services/CrmService'
import type { Order } from '@/@types/crm'

/**
 * TODO-414: карточка «История» раньше синтезировала на клиенте два события
 * («Создание» и «Обновление продажи» с придуманным diff по стадии и автором
 * из assigneeName). Теперь она показывает РЕАЛЬНУЮ ленту из неизменяемой
 * цепочки audit (`GET /v1/orders/:id/history`, BFF-ручка того же вида, что у
 * контактов/компаний), а при пустой ленте — честную пустоту, не подделку.
 */
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
vi.mock('./OrderInfoWidget', () => ({ default: () => null }))
vi.mock('@fairflow/shared-ui', () => ({
    CompanyActivitiesWidget: () => null,
}))
vi.mock('@/utils/hooks/usePermission', () => ({ default: () => () => true }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))

const orderMock = vi.mocked(apiGetOrder)
const activitiesMock = vi.mocked(apiGetActivities)
const historyMock = vi.mocked(apiGetOrderHistory)

// 15.03.2026 10:30 и 17.03.2026 09:05 в локальной зоне рантайма — сравниваем
// с тем же форматтером, что и продакшен-код, чтобы тест не зависел от TZ.
const CREATED_AT = new Date(2026, 2, 15, 10, 30).getTime()
const UPDATED_AT = new Date(2026, 2, 17, 9, 5).getTime()

const order = {
    id: 'o-1',
    number: 'ORD-1',
    typeId: 't-1',
    orderTypeVersion: 1,
    stageId: 's-1',
    stageName: 'Оформление',
    assigneeName: 'Иванов И.',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
} as unknown as Order

// Свежий кэш SWR на каждый рендер: иначе ответ первого теста переиспользуется
// следующими, и «лента» проверялась бы по данным соседнего кейса.
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

describe('TODO-414 — карточка «История» показывает реальную ленту', () => {
    beforeEach(() => {
        orderMock.mockReset()
        historyMock.mockReset()
        orderMock.mockResolvedValue(order as never)
        activitiesMock.mockResolvedValue({ list: [], total: 0 } as never)
        historyMock.mockResolvedValue({ items: [] } as never)
    })

    it('показывает фактические метки времени продажи', async () => {
        renderDetails()

        expect(await screen.findByText('История')).toBeInTheDocument()
        expect(screen.getByText('Создана')).toBeInTheDocument()
        expect(screen.getByText('15.03.2026 10:30')).toBeInTheDocument()
        expect(screen.getByText('Последнее изменение')).toBeInTheDocument()
        expect(screen.getByText('17.03.2026 09:05')).toBeInTheDocument()
    })

    it('рендерит события ленты с автором и раскрываемым diff', async () => {
        historyMock.mockResolvedValue({
            items: [
                {
                    id: 'e1',
                    type: 'crm.order.stage_changed',
                    userId: 'u7',
                    userName: 'Петров П.',
                    timestamp: Math.floor(UPDATED_AT / 1000),
                    summary: 'Смена этапа',
                    changedFields: [{ field: 'Этап', old: 'Новая', new: 'Оформление' }],
                },
            ],
        } as never)

        renderDetails()

        expect(await screen.findByText('Смена этапа')).toBeInTheDocument()
        expect(screen.getByText('Петров П.')).toBeInTheDocument()
        // запрос уходит именно за историей этой продажи
        expect(historyMock).toHaveBeenCalledWith('o-1', { limit: 50 })

        // diff спрятан под раскрытием — разворачиваем и проверяем «было → стало»
        await userEvent.click(screen.getByRole('button', { name: 'Развернуть' }))
        expect(screen.getByText('Этап:')).toBeInTheDocument()
        expect(screen.getByText('Новая')).toBeInTheDocument()
        expect(screen.getByText('→ Оформление')).toBeInTheDocument()
    })

    it('не подделывает события, когда лента пуста', async () => {
        renderDetails()

        const empty = await screen.findByText('Изменений пока не зафиксировано')
        const historyBody = empty.parentElement as HTMLElement

        expect(screen.queryByText('Обновление продажи')).not.toBeInTheDocument()
        expect(screen.queryByText('Создание')).not.toBeInTheDocument()
        expect(screen.queryByText(/Продажа ORD-1 (создана|обновлена)/)).not.toBeInTheDocument()
        // Автор события не может браться из ответственного за продажу: в шапке
        // карточки ответственный законно есть, а в «Истории» — нет.
        expect(within(historyBody).queryByText('Иванов И.')).not.toBeInTheDocument()
        expect(within(historyBody).queryByText('Стадия')).not.toBeInTheDocument()
    })

    it('ошибку загрузки истории показывает как ошибку, а не как «изменений не было»', async () => {
        historyMock.mockRejectedValue(new Error('boom'))

        renderDetails()

        expect(
            await screen.findByText('Не удалось загрузить историю изменений.'),
        ).toBeInTheDocument()
        expect(screen.queryByText('Изменений пока не зафиксировано')).not.toBeInTheDocument()
    })
})
