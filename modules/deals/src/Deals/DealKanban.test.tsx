import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'

const apiGetDealsKanban = vi.fn()

let permissions = new Set<string>(['deals:read', 'deals:write', 'deals.stage:move'])

vi.mock('react-router', () => ({
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: '/deals/kanban', search: '' }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    Link: ({ children }: { children?: unknown }) => <span>{children as never}</span>,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/store/authStore', () => ({
    useSessionUser: (sel: (s: { user: { userId: string } }) => unknown) =>
        sel({ user: { userId: 'u1' } }),
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/utils/hooks/useSegmentRouteTransition', () => ({
    default: () => ['kanban', vi.fn()] as const,
}))
vi.mock('@/utils/profile/rememberDefaultView', () => ({
    useRememberProfileDefaultView: () => undefined,
}))
vi.mock('@hello-pangea/dnd', () => ({
    DragDropContext: ({ children }: { children?: unknown }) => children,
    Droppable: ({ children }: { children: (p: unknown, s: unknown) => unknown }) =>
        children(
            {
                innerRef: () => {},
                droppableProps: {},
                placeholder: null,
            },
            { isDraggingOver: false },
        ),
    Draggable: ({ children }: { children: (p: unknown, s: unknown) => unknown }) =>
        children(
            { innerRef: () => {}, draggableProps: {}, dragHandleProps: {} },
            { isDragging: false },
        ),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetDealsKanban: (...a: unknown[]) => apiGetDealsKanban(...a),
    apiGetDeals: () => Promise.resolve({ list: [], total: 0 }),
    apiGetPipelines: () => Promise.resolve([]),
    apiGetDealSources: () => Promise.resolve([]),
    apiGetMembers: () => Promise.resolve([]),
    apiMoveDealStage: vi.fn(),
    apiCreateDeal: vi.fn(),
    apiGetActivities: () => Promise.resolve([]),
}))

import DealKanban from './DealKanban'

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('DealKanban', () => {
    beforeEach(() => {
        permissions = new Set(['deals:read', 'deals:write', 'deals.stage:move'])
        apiGetDealsKanban.mockReset()
    })

    it('ошибка загрузки доски — «Не удалось загрузить доску» и retry', async () => {
        apiGetDealsKanban.mockRejectedValue(new Error('boom'))
        render(<DealKanban />)

        expect(await screen.findByText('Не удалось загрузить доску')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('пустая доска — предложение создать сделку', async () => {
        apiGetDealsKanban.mockResolvedValue({
            pipeline: { id: 'pl1', name: 'Main', stages: [] },
            columns: [],
        })
        render(<DealKanban />)

        expect(await screen.findByText('Доска пуста')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Создать сделку' })).toBeInTheDocument()
    })

    it('рендерит колонку и карточку сделки из ответа API', async () => {
        apiGetDealsKanban.mockResolvedValue({
            pipeline: { id: 'pl1', name: 'Main', stages: [] },
            columns: [
                {
                    stageId: 's1',
                    stageName: 'Новая',
                    color: '#3B82F6',
                    deals: [
                        {
                            id: 'd1',
                            name: 'Сделка на доске',
                            amount: 100_000,
                            currency: 'RUB',
                            pipelineId: 'pl1',
                            stageId: 's1',
                            companyName: 'ООО Бета',
                            createdAt: 0,
                            updatedAt: 0,
                        },
                    ],
                },
            ],
        })
        render(<DealKanban />)

        expect(await screen.findByText('Сделка на доске')).toBeInTheDocument()
        expect(screen.getByText('Новая')).toBeInTheDocument()
        expect(screen.getByText('ООО Бета')).toBeInTheDocument()
    })

    it('без deals:write — кнопка «Создать сделку» скрыта', async () => {
        permissions = new Set(['deals:read', 'deals.stage:move'])
        apiGetDealsKanban.mockResolvedValue({
            pipeline: { id: 'pl1', name: 'Main', stages: [] },
            columns: [],
        })
        render(<DealKanban />)

        await screen.findByText('Доска пуста')
        expect(screen.queryByRole('button', { name: 'Создать сделку' })).not.toBeInTheDocument()
    })
})
