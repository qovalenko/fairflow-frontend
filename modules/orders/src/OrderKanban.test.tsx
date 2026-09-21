import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import OrderKanban from './OrderKanban'
import { apiGetOrdersKanban, apiGetOrderTypes } from '@/services/CrmService'

vi.mock('@/services/CrmService', () => ({
    apiGetOrdersKanban: vi.fn(),
    apiGetOrderTypes: vi.fn(),
    apiMoveOrderStage: vi.fn(),
}))
vi.mock('@/components/template/EntityCreateDrawer', () => ({ default: () => null }))
vi.mock('@/utils/hooks/usePermission', () => ({ default: () => () => true }))

const pidRef = vi.hoisted(() => ({ value: 'p1' }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => pidRef.value }))

const kanbanMock = vi.mocked(apiGetOrdersKanban)
const typesMock = vi.mocked(apiGetOrderTypes)

const kanbanWithOrders = {
    typeId: 't1',
    columns: [
        {
            id: 's1',
            name: 'Новая',
            orders: [
                {
                    id: 'o1',
                    number: 'SO-1',
                    typeName: 'Договор',
                    assigneeName: 'Иван',
                    createdAt: 1_700_000_000_000,
                    status: 'ACTIVE',
                },
            ],
        },
        { id: 's2', name: 'Оформление', orders: [] },
    ],
}

const renderKanban = (route = '/orders/kanban') =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={[route]}>
                <OrderKanban />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('OrderKanban — доска продаж', () => {
    beforeEach(() => {
        typesMock.mockResolvedValue([
            { id: 't1', name: 'Договор' },
            { id: 't2', name: 'Подписка' },
        ] as never)
    })

    it('без проекта — «Проект не выбран»', async () => {
        pidRef.value = ''
        renderKanban()
        expect(await screen.findByText('Проект не выбран')).toBeInTheDocument()
        pidRef.value = 'p1'
    })

    it('пустые колонки — онбординг «К типам продаж»', async () => {
        kanbanMock.mockResolvedValue({ columns: [] } as never)
        renderKanban()
        expect(await screen.findByText('Доска пуста')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'К типам продаж' })).toBeInTheDocument()
    })

    it('рендерит колонки и карточки продаж', async () => {
        kanbanMock.mockResolvedValue(kanbanWithOrders as never)
        renderKanban()

        expect(await screen.findByText('Новая')).toBeInTheDocument()
        expect(screen.getByText('Оформление')).toBeInTheDocument()
        expect(screen.getByText('SO-1')).toBeInTheDocument()
        expect(screen.getByText('Иван')).toBeInTheDocument()
    })

    it('typeId из селектора уходит в запрос kanban', async () => {
        const user = userEvent.setup()
        kanbanMock.mockResolvedValue(kanbanWithOrders as never)
        renderKanban()

        await screen.findByText('SO-1')
        const input = document.querySelector('input.select__input') as HTMLInputElement
        await user.click(input)
        await user.click(await screen.findByText('Подписка'))

        await waitFor(() =>
            expect(kanbanMock.mock.calls.some((c) => c[0] === 't2')).toBe(true),
        )
    })
})
