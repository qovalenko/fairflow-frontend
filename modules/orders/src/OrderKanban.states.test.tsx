import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import type { DropResult } from '@hello-pangea/dnd'
import OrderKanban from './OrderKanban'
import { apiGetOrdersKanban, apiGetOrderTypes, apiMoveOrderStage } from '@/services/CrmService'

vi.mock('@/services/CrmService', () => ({
    apiGetOrdersKanban: vi.fn(),
    apiGetOrderTypes: vi.fn(),
    apiMoveOrderStage: vi.fn(),
}))
vi.mock('@/components/template/EntityCreateDrawer', () => ({ default: () => null }))

const canRef = vi.hoisted(() => ({
    fn: (_domain: string, _action: string): boolean => true,
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (domain: string, action: string) => canRef.fn(domain, action),
}))

const pidRef = vi.hoisted(() => ({ value: 'p1' }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => pidRef.value }))

const navigateMock = vi.fn()
vi.mock('react-router', async () => {
    const actual = await vi.importActual<typeof import('react-router')>('react-router')
    return { ...actual, useNavigate: () => navigateMock }
})

const dndRef = vi.hoisted(() => ({ onDragEnd: null as null | ((result: DropResult) => void) }))
vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({
        children,
        onDragEnd,
    }: {
        children?: unknown
        onDragEnd?: (result: DropResult) => void
    }) => {
        dndRef.onDragEnd = onDragEnd ?? null
        return children
    },
    Droppable: ({ children }: { children: (p: unknown, s: unknown) => unknown }) =>
        children(
            { innerRef: () => {}, droppableProps: {}, placeholder: null },
            { isDraggingOver: false },
        ),
    Draggable: ({ children }: { children: (p: unknown, s: unknown) => unknown }) =>
        children(
            { innerRef: () => {}, draggableProps: {}, dragHandleProps: {} },
            { isDragging: false },
        ),
}))

const kanbanMock = vi.mocked(apiGetOrdersKanban)
const typesMock = vi.mocked(apiGetOrderTypes)
const moveMock = vi.mocked(apiMoveOrderStage)

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

describe('OrderKanban — состояния экрана', () => {
    beforeEach(() => {
        canRef.fn = () => true
        pidRef.value = 'p-kanban'
        navigateMock.mockReset()
        dndRef.onDragEnd = null
        kanbanMock.mockReset()
        moveMock.mockReset()
        typesMock.mockResolvedValue([{ id: 't1', name: 'Договор' }] as never)
        moveMock.mockResolvedValue({} as never)
    })

    it('загрузка — индикатор, пока доска не пришла', () => {
        kanbanMock.mockImplementation(() => new Promise(() => {}))
        renderKanban()
        expect(document.querySelector('.animate-spin')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Список/ })).not.toBeInTheDocument()
    })

    it('без orders:write — кнопки «Создать продажу» нет', async () => {
        canRef.fn = (domain, action) => !(domain === 'orders' && action === 'write')
        kanbanMock.mockResolvedValue(kanbanWithOrders as never)
        renderKanban()
        await screen.findByText('SO-1')
        expect(screen.queryByTitle('Создать продажу')).not.toBeInTheDocument()
    })

    it('колонки без продаж — подсказка над доской', async () => {
        kanbanMock.mockResolvedValue({
            typeId: 't1',
            columns: [
                { id: 's1', name: 'Новая', orders: [] },
                { id: 's2', name: 'Оформление', orders: [] },
            ],
        } as never)
        renderKanban()
        expect(
            await screen.findByText(/По выбранному типу продаж пока нет/),
        ).toBeInTheDocument()
    })

    it('карточка с ошибкой отправки и drift — иконки предупреждения', async () => {
        kanbanMock.mockResolvedValue({
            typeId: 't1',
            columns: [
                {
                    id: 's1',
                    name: 'Новая',
                    orders: [
                        {
                            id: 'o-bad',
                            number: 'SO-ERR',
                            typeName: 'Договор',
                            status: 'SEND_ERROR',
                            hasDrift: true,
                            createdAt: 1_700_000_000_000,
                        },
                    ],
                },
            ],
        } as never)
        renderKanban()
        expect(await screen.findByText('SO-ERR')).toBeInTheDocument()
        expect(document.querySelector('.text-red-500')).toBeTruthy()
        expect(document.querySelector('.text-amber-500')).toBeTruthy()
    })
})

describe('OrderKanban — перетаскивание и навигация', () => {
    beforeEach(() => {
        canRef.fn = () => true
        pidRef.value = 'p-dnd'
        navigateMock.mockReset()
        kanbanMock.mockReset()
        moveMock.mockReset()
        typesMock.mockResolvedValue([{ id: 't1', name: 'Договор' }] as never)
        kanbanMock.mockResolvedValue(kanbanWithOrders as never)
        moveMock.mockResolvedValue({} as never)
    })

    it('перенос карточки между колонками вызывает apiMoveOrderStage', async () => {
        renderKanban()
        await screen.findByText('SO-1')
        expect(dndRef.onDragEnd).toBeTypeOf('function')

        await dndRef.onDragEnd!({
            draggableId: 'o1',
            type: 'DEFAULT',
            source: { droppableId: 's1', index: 0 },
            destination: { droppableId: 's2', index: 0 },
            reason: 'DROP',
            mode: 'FLUID',
            combine: null,
        })

        await waitFor(() => expect(moveMock).toHaveBeenCalledWith('o1', 's2'))
    })

    it('ошибка переноса — toast «Не заполнены обязательные поля этапа»', async () => {
        moveMock.mockRejectedValue({
            response: { data: { error: { code: 'REQUIRED_FIELDS_MISSING' } } },
        })
        renderKanban()
        await screen.findByText('SO-1')

        await dndRef.onDragEnd!({
            draggableId: 'o1',
            type: 'DEFAULT',
            source: { droppableId: 's1', index: 0 },
            destination: { droppableId: 's2', index: 0 },
            reason: 'DROP',
            mode: 'FLUID',
            combine: null,
        })

        expect(
            await screen.findByText('Не заполнены обязательные поля этапа'),
        ).toBeInTheDocument()
    })

    it('переключатель «Список» ведёт на /orders', async () => {
        const user = userEvent.setup()
        renderKanban()
        await screen.findByText('SO-1')
        await user.click(screen.getByRole('button', { name: /Список/ }))
        await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/orders'), { timeout: 500 })
    })
})
