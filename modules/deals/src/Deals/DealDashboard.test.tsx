import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'

const apiGetDealDashboard = vi.fn()
const apiGetPipelines = vi.fn()
const navigate = vi.fn()

let permissions = new Set<string>()

vi.mock('react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetDealDashboard: (...a: unknown[]) => apiGetDealDashboard(...a),
    apiGetPipelines: (...a: unknown[]) => apiGetPipelines(...a),
}))

import DealDashboard from './DealDashboard'

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('DealDashboard', () => {
    beforeEach(() => {
        permissions = new Set(['deals:read'])
        apiGetDealDashboard.mockReset()
        apiGetPipelines.mockReset()
        navigate.mockReset()
        apiGetPipelines.mockResolvedValue([{ id: 'pl1', name: 'Основная', stages: [] }])
    })

    it('без deals:read показывает заглушку прав', () => {
        permissions = new Set()
        render(<DealDashboard />)

        expect(
            screen.getByText('Недостаточно прав для просмотра дашборда сделок.'),
        ).toBeInTheDocument()
        expect(apiGetDealDashboard).not.toHaveBeenCalled()
    })

    it('ошибка загрузки — «Повторить»', async () => {
        apiGetDealDashboard.mockRejectedValue(new Error('boom'))
        render(<DealDashboard />)

        expect(await screen.findByText('Не удалось загрузить дашборд')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('пустой период — предложение перейти к сделкам', async () => {
        apiGetDealDashboard.mockResolvedValue({
            dealsByStage: [],
            statistics: [],
        })

        render(<DealDashboard />)

        expect(await screen.findByText('За выбранный период данных нет.')).toBeInTheDocument()
    })

    it('рендерит KPI по данным дашборда', async () => {
        apiGetDealDashboard.mockResolvedValue({
            dealsByStage: [{ stageId: 's1', stageName: 'Новая', count: 3, amount: 300_000 }],
            statistics: [
                { key: 'won', value: 2 },
                { key: 'lost', value: 1 },
            ],
            avgCycleDays: 14,
            stalledCount: 1,
            forecastAmount: 500_000,
        })

        render(<DealDashboard />)

        expect(await screen.findByText('Дашборд сделок')).toBeInTheDocument()
        expect(screen.getByText('Открытые сделки')).toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument()
        expect(screen.getByText('Выиграно за период').closest('button')?.textContent).toContain('2')
        expect(screen.getByText('Проиграно за период').closest('button')?.textContent).toContain('1')
        expect(screen.getByText('14 дн.')).toBeInTheDocument()
        expect(screen.getByText('Новая')).toBeInTheDocument()

        await waitFor(() =>
            expect(apiGetDealDashboard).toHaveBeenCalledWith(
                expect.objectContaining({ projectId: 'p1' }),
            ),
        )
    })
})
