import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { ReactElement } from 'react'
import type { Deal } from '@/@types/crm'

const apiGetDeal = vi.fn()
const navigate = vi.fn()

let canWrite = true

vi.mock('react-router', () => ({
    useParams: () => ({ id: 'd1' }),
    useNavigate: () => navigate,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        subject === 'deals' && action === 'write' ? canWrite : true,
}))
vi.mock('@/services/CrmService', () => ({
    apiGetDeal: (...a: unknown[]) => apiGetDeal(...a),
    apiUpdateDeal: vi.fn(),
    apiGetPipelines: () => Promise.resolve([]),
    apiGetContacts: () => Promise.resolve({ list: [], total: 0 }),
    apiGetCompanies: () => Promise.resolve({ list: [], total: 0 }),
    apiGetProducts: () => Promise.resolve({ list: [], total: 0 }),
    apiGetDealSources: () => Promise.resolve([]),
    apiGetMembers: () => Promise.resolve([]),
}))

import DealEdit from './DealEdit'

const deal: Deal = {
    id: 'd1',
    name: 'Редактируемая сделка',
    amount: 200_000,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Новая',
    createdAt: 0,
    updatedAt: 0,
}

const render = (ui: ReactElement) =>
    rtlRender(<SWRConfig value={{ provider: () => new Map() }}>{ui}</SWRConfig>)

describe('DealEdit', () => {
    beforeEach(() => {
        canWrite = true
        apiGetDeal.mockReset()
        navigate.mockReset()
    })

    it('ошибка загрузки — сообщение и переход к списку', async () => {
        apiGetDeal.mockRejectedValue(new Error('404'))
        render(<DealEdit />)

        expect(await screen.findByText('Не удалось загрузить сделку')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'К списку' }))
        expect(navigate).toHaveBeenCalledWith('/deals')
    })

    it('гидратирует форму данными сделки', async () => {
        apiGetDeal.mockResolvedValue(deal)
        render(<DealEdit />)

        expect(await screen.findByDisplayValue('Редактируемая сделка')).toBeInTheDocument()
        await waitFor(() => expect(apiGetDeal).toHaveBeenCalledWith('d1', 'p1'))
    })

    it('без deals:write — кнопка «Сохранить» скрыта', async () => {
        canWrite = false
        apiGetDeal.mockResolvedValue(deal)
        render(<DealEdit />)

        await screen.findByDisplayValue('Редактируемая сделка')
        expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument()
    })

    it('закрытая сделка — сумма недоступна, название редактируемо', async () => {
        apiGetDeal.mockResolvedValue({ ...deal, status: 'won' })
        render(<DealEdit />)

        expect(
            await screen.findByText(/Сделка закрыта — вороночные поля недоступны/),
        ).toBeInTheDocument()
        const amountInput = screen.getByDisplayValue('200000') as HTMLInputElement
        expect(amountInput.disabled).toBe(true)
        const nameInput = screen.getByDisplayValue('Редактируемая сделка') as HTMLInputElement
        expect(nameInput.disabled).toBe(false)
    })
})
