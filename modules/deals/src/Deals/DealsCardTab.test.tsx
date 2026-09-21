import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { Deal } from '@/@types/crm'

const apiGetDeals = vi.fn()
const navigate = vi.fn()

let canReadDeals = true

vi.mock('react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: (subject: string, action: string) =>
        subject === 'deals' && action === 'read' ? canReadDeals : false,
}))
vi.mock('@/services/CrmService', () => ({
    apiGetDeals: (...a: unknown[]) => apiGetDeals(...a),
}))

import DealsCardTab from './DealsCardTab'

const deal = (over: Partial<Deal> = {}): Deal => ({
    id: 'd1',
    name: 'Сделка на карточке',
    amount: 250_000,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Квалификация',
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('DealsCardTab', () => {
    beforeEach(() => {
        canReadDeals = true
        navigate.mockReset()
        apiGetDeals.mockReset()
        apiGetDeals.mockResolvedValue({ list: [deal()], total: 1 })
    })

    it('без deals:read — заглушка прав', () => {
        canReadDeals = false
        render(<DealsCardTab contactId="c1" />)
        expect(screen.getByText('Нет прав на сделки')).toBeInTheDocument()
        expect(apiGetDeals).not.toHaveBeenCalled()
    })

    it('фильтрует сделки по contactId', async () => {
        render(<DealsCardTab contactId="c1" />)

        await waitFor(() =>
            expect(apiGetDeals).toHaveBeenCalledWith(
                expect.objectContaining({ projectId: 'p1', contactId: 'c1', pageSize: 100 }),
            ),
        )
        expect(await screen.findByText('Сделка на карточке')).toBeInTheDocument()
    })

    it('пустой список — «Нет сделок»', async () => {
        apiGetDeals.mockResolvedValue({ list: [], total: 0 })
        render(<DealsCardTab companyId="co1" />)

        expect(await screen.findByText('Нет сделок')).toBeInTheDocument()
    })

    it('клик по строке ведёт на карточку сделки', async () => {
        render(<DealsCardTab contactId="c1" />)
        await screen.findByText('Сделка на карточке')

        screen.getByText('Сделка на карточке').click()
        expect(navigate).toHaveBeenCalledWith('/deals/d1')
    })

    it('загрузка — skeleton без списка сделок', () => {
        apiGetDeals.mockImplementation(() => new Promise(() => {}))
        const { container } = render(<DealsCardTab contactId="c1" />)

        expect(screen.queryByText('Нет сделок')).not.toBeInTheDocument()
        expect(container.querySelector('.skeleton')).toBeTruthy()
    })
})
