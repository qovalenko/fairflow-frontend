import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { Deal } from '@/@types/crm'

const apiGetDeal = vi.fn()
const navigate = vi.fn()

let permissions = new Set<string>(['deals:read', 'deals:write', 'contacts:write'])
let projectRole = 'manager'

vi.mock('react-router', () => ({
    useParams: () => ({ id: 'd1' }),
    useNavigate: () => navigate,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => ({ projects: [{ id: 'p1', role: projectRole }] }),
}))
vi.mock('@/utils/hooks/useDocumentsModuleEnabled', () => ({ default: () => false }))
vi.mock('@/store/authStore', () => ({
    useSessionUser: (sel: (s: { user: { userId: string } }) => unknown) =>
        sel({ user: { userId: 'u1' } }),
}))
vi.mock('@/components/shared/HostSlot', () => ({ default: () => null }))
vi.mock('@/components/shared/RecordShareControl', () => ({ default: () => null }))
vi.mock('@/components/shared/documents/DocumentsTab', () => ({ default: () => null }))
vi.mock('@/components/shared/HistoryTimeline', () => ({ default: () => null }))
vi.mock('@/components/shared/UserProfileLink', () => ({ default: () => null }))
vi.mock('@fairflow/shared-ui', () => ({
    CompanyActivitiesWidget: () => null,
}))
vi.mock('./DealHeaderWidget', () => ({
    default: ({ deal }: { deal: Deal }) => <div>header:{deal.name}</div>,
}))
vi.mock('./DealHeaderStats', () => ({ default: () => null }))
vi.mock('./DealInfoWidget', () => ({ default: () => null }))
vi.mock('./CompanyOrdersWidget', () => ({ default: () => null }))
vi.mock('./CloseDealDialog', () => ({ default: () => null }))
vi.mock('./ReopenDealDialog', () => ({ default: () => null }))
vi.mock('./QualifyDealDialog', () => ({ default: () => null }))
vi.mock('./DriftPanel', () => ({ default: () => null }))
vi.mock('@/services/CrmService', () => ({
    apiGetDeal: (...a: unknown[]) => apiGetDeal(...a),
    apiGetDealStageHistory: () => Promise.resolve([]),
    apiGetPipelines: () => Promise.resolve([]),
    apiGetActivities: () => Promise.resolve({ list: [], total: 0 }),
    apiGetDealOrdersSummary: () => Promise.resolve({ items: [] }),
    apiGetProduct: () => Promise.resolve(null),
    apiDeleteDeal: vi.fn(),
    apiMoveDealStage: vi.fn(),
    apiFindContactDuplicates: vi.fn(),
    apiQualifyDeal: vi.fn(),
}))

import DealDetails from './DealDetails'

const deal: Deal = {
    id: 'd1',
    name: 'Карточка сделки',
    amount: 300_000,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Переговоры',
    createdAt: 0,
    updatedAt: 0,
}

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('DealDetails', () => {
    beforeEach(() => {
        permissions = new Set(['deals:read', 'deals:write', 'contacts:write'])
        projectRole = 'manager'
        apiGetDeal.mockReset()
        navigate.mockReset()
    })

    it('пока грузится — не показывает «не найдена» и «ошибку»', () => {
        apiGetDeal.mockImplementation(() => new Promise(() => {}))
        const { container } = render(<DealDetails />)

        expect(screen.queryByText('Сделка не найдена')).not.toBeInTheDocument()
        expect(screen.queryByText('Не удалось загрузить сделку')).not.toBeInTheDocument()
        expect(container.querySelector('.animate-spin')).toBeTruthy()
    })

    it('ошибка загрузки — «Не удалось загрузить сделку»', async () => {
        apiGetDeal.mockRejectedValue(new Error('boom'))
        render(<DealDetails />)

        expect(await screen.findByText('Не удалось загрузить сделку')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'К списку' })).toBeInTheDocument()
    })

    it('несуществующая сделка — «Сделка не найдена»', async () => {
        apiGetDeal.mockResolvedValue(undefined)
        render(<DealDetails />)

        expect(await screen.findByText('Сделка не найдена')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Вернуться к списку' })).toBeInTheDocument()
    })

    it('успешная загрузка — шапка с именем сделки', async () => {
        apiGetDeal.mockResolvedValue(deal)
        render(<DealDetails />)

        expect(await screen.findByText('header:Карточка сделки')).toBeInTheDocument()
        await waitFor(() => expect(apiGetDeal).toHaveBeenCalledWith('d1', 'p1'))
    })

    it('открытая сделка с правом write — кнопки закрытия Won/Lost', async () => {
        apiGetDeal.mockResolvedValue({ ...deal, status: 'open' })
        render(<DealDetails />)

        expect(await screen.findByRole('button', { name: 'Закрыть (Won)' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Закрыть (Lost)' })).toBeInTheDocument()
    })

    it('закрытая сделка — бейдж «Проиграна» и «Переоткрыть» для manager', async () => {
        apiGetDeal.mockResolvedValue({
            ...deal,
            status: 'lost',
            stageId: 's-lost',
            stageName: 'Lost',
        })
        render(<DealDetails />)

        expect(await screen.findByText('Проиграна')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Переоткрыть' })).toBeInTheDocument()
    })

    it('light-лид без contactId — кнопка «Квалифицировать»', async () => {
        apiGetDeal.mockResolvedValue({
            ...deal,
            contactId: undefined,
            lightName: 'Иван',
            lightPhone: '+7999',
        })
        render(<DealDetails />)

        expect(await screen.findByRole('button', { name: 'Квалифицировать' })).toBeInTheDocument()
    })

    it('member без manager-роли не видит «Переоткрыть» на закрытой сделке', async () => {
        projectRole = 'member'
        apiGetDeal.mockResolvedValue({ ...deal, status: 'won', stageName: 'Won' })
        render(<DealDetails />)

        expect(await screen.findByText('Выиграна')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Переоткрыть' })).not.toBeInTheDocument()
    })
})
