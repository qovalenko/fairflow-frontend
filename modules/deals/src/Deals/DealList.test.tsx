import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { Deal } from '@/@types/crm'

const apiGetDeals = vi.fn()
const navigate = vi.fn()

let permissions = new Set<string>()
let searchParams = new URLSearchParams()

vi.mock('react-router', () => ({
    useNavigate: () => navigate,
    useLocation: () => ({ pathname: '/deals', search: '' }),
    useSearchParams: () => [searchParams, vi.fn()],
    Link: ({ children, to }: { children?: unknown; to?: string }) => (
        <a href={String(to)}>{children as never}</a>
    ),
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/store/authStore', () => ({
    useSessionUser: (sel: (s: { user: { userId: string } }) => unknown) =>
        sel({ user: { userId: 'u-self' } }),
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/utils/hooks/useSegmentRouteTransition', () => ({
    default: () => ['list', vi.fn()] as const,
}))
vi.mock('@/utils/profile/rememberDefaultView', () => ({
    useRememberProfileDefaultView: () => undefined,
}))
vi.mock('@/components/template/EntityCreateDrawer', () => ({ default: () => null }))
vi.mock('@/components/shared/HostSlot', () => ({ default: () => null }))
vi.mock('react-csv', () => ({ CSVLink: () => null }))
vi.mock('framer-motion', () => ({
    AnimatePresence: ({ children }: { children?: unknown }) => children,
    motion: { div: ({ children }: { children?: unknown }) => <div>{children as never}</div> },
}))
vi.mock('@/services/CrmService', () => ({
    apiGetDeals: (...a: unknown[]) => apiGetDeals(...a),
    apiGetPipelines: () => Promise.resolve([]),
    apiGetCompanies: () => Promise.resolve({ list: [], total: 0 }),
    apiGetContacts: () => Promise.resolve({ list: [], total: 0 }),
    apiGetMembers: () => Promise.resolve([]),
    apiGetDealSources: () => Promise.resolve([]),
    apiGetProducts: () => Promise.resolve([]),
    apiCreateDeal: vi.fn(),
    newIdempotencyKey: () => 'key-1',
}))

import DealList from './DealList'

const deal = (over: Partial<Deal> = {}): Deal => ({
    id: 'd1',
    name: 'Сделка Альфа',
    amount: 100_000,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Новая',
    companyName: 'ООО Бета',
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('DealList', () => {
    beforeEach(() => {
        permissions = new Set([
            'deals:read',
            'deals:write',
            'deals:export',
            'deals:import',
            'deals:delete',
            'deals.stage:move',
            'deals:manage',
        ])
        searchParams = new URLSearchParams()
        apiGetDeals.mockReset()
        apiGetDeals.mockResolvedValue({ list: [deal()], total: 1 })
    })

    it('запрашивает список сделок с projectId текущего проекта', async () => {
        render(<DealList />)

        await waitFor(() =>
            expect(apiGetDeals).toHaveBeenCalledWith(
                expect.objectContaining({ projectId: 'p1' }),
            ),
        )
    })

    it('ошибка загрузки — сообщение и «Повторить»', async () => {
        apiGetDeals.mockRejectedValue(new Error('boom'))
        render(<DealList />)

        expect(await screen.findByText('Не удалось загрузить сделки')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('пустой список без фильтров — «Сделок пока нет»', async () => {
        apiGetDeals.mockResolvedValue({ list: [], total: 0 })
        render(<DealList />)

        expect(await screen.findByText('Сделок пока нет')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Создать сделку' })).toBeInTheDocument()
    })

    it('рендерит название сделки из ответа API', async () => {
        render(<DealList />)
        expect(await screen.findByText('Сделка Альфа')).toBeInTheDocument()
    })

    it('баннер hiddenByPolicy — «Ещё N сделок скрыто»', async () => {
        apiGetDeals.mockResolvedValue({ list: [deal()], total: 1, hiddenByPolicy: 5 })
        render(<DealList />)

        expect(
            await screen.findByText('Ещё 5 сделок скрыто настройками доступа'),
        ).toBeInTheDocument()
    })

    it('фильтр без результатов — «Сбросить фильтры»', async () => {
        searchParams = new URLSearchParams('stageId=s-missing')
        apiGetDeals.mockResolvedValue({ list: [], total: 0 })
        render(<DealList />)

        expect(await screen.findByText('По заданным фильтрам ничего не найдено')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Сбросить фильтры' })).toBeInTheDocument()
    })

    it('без deals:write кнопка «Создать сделку» скрыта', async () => {
        permissions = new Set(['deals:read', 'deals:export'])
        render(<DealList />)

        await waitFor(() => expect(apiGetDeals).toHaveBeenCalled())
        expect(screen.queryByRole('button', { name: 'Создать сделку' })).not.toBeInTheDocument()
    })
})
