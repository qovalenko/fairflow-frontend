import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompanyDealsWidget from './CompanyDealsWidget'
import type { Deal } from '@/@types/crm'

const deal = (over: Partial<Deal> = {}): Deal =>
    ({
        id: 'd1',
        name: 'Сделка А',
        amount: 150_000,
        currency: 'RUB',
        pipelineId: 'pipe-1',
        stageId: 'stage-1',
        stageName: 'Переговоры',
        result: 'won',
        createdAt: 0,
        updatedAt: 0,
        ...over,
    }) as Deal

describe('CompanyDealsWidget', () => {
    it('loading — скелетоны вместо списка', () => {
        const { container } = render(<CompanyDealsWidget deals={[]} loading />)
        expect(screen.getByText('Сделки')).toBeInTheDocument()
        expect(container.querySelector('.skeleton')).toBeTruthy()
    })

    it('пустой список', () => {
        render(<CompanyDealsWidget deals={[]} />)
        expect(screen.getByText('Нет сделок')).toBeInTheDocument()
    })

    it('рендерит сумму, стадию и бейдж Won', () => {
        render(<CompanyDealsWidget deals={[deal()]} />)
        expect(screen.getByText('Сделка А')).toBeInTheDocument()
        expect(screen.getByText('Переговоры')).toBeInTheDocument()
        expect(screen.getByText('Won')).toBeInTheDocument()
        expect(screen.getByText(/150/)).toBeInTheDocument()
    })

    it('клик по сделке', async () => {
        const user = userEvent.setup()
        const onDealClick = vi.fn()
        render(<CompanyDealsWidget deals={[deal()]} onDealClick={onDealClick} />)
        await user.click(screen.getByText('Сделка А'))
        expect(onDealClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }))
    })
})
