import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Deal } from '@/@types/crm'
import ContactDealsWidget from './ContactDealsWidget'

const deal = (over: Partial<Deal> = {}): Deal => ({
    id: 'd1',
    name: 'Крупная сделка',
    amount: 500_000,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Переговоры',
    companyName: 'ООО Ромашка',
    result: 'won',
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

describe('ContactDealsWidget', () => {
    it('пустой список — «Нет сделок»', () => {
        render(<ContactDealsWidget deals={[]} />)
        expect(screen.getByText('Нет сделок')).toBeInTheDocument()
    })

    it('loading — skeleton без строк сделок', () => {
        render(<ContactDealsWidget deals={[deal()]} loading />)
        expect(screen.queryByText('Крупная сделка')).not.toBeInTheDocument()
    })

    it('рендерит сделки и onDealClick получает объект', () => {
        const onDealClick = vi.fn()
        const d = deal()

        render(<ContactDealsWidget deals={[d]} onDealClick={onDealClick} />)

        expect(screen.getByText('Крупная сделка')).toBeInTheDocument()
        expect(screen.getByText(/ООО Ромашка/)).toBeInTheDocument()
        expect(screen.getByText('Won')).toBeInTheDocument()

        fireEvent.click(screen.getByText('Крупная сделка'))
        expect(onDealClick).toHaveBeenCalledWith(d)
    })
})
