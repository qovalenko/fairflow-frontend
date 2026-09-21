import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Deal } from '@/@types/crm'
import ContactHeaderStats from './ContactHeaderStats'

const deal = (over: Partial<Deal> = {}): Deal => ({
    id: 'd1',
    name: 'Сделка',
    amount: 100_000,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Новая',
    result: 'active',
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

const squash = (s: string | null) => (s ?? '').replace(/\s/g, '')

describe('ContactHeaderStats', () => {
    it('считает сумму сделок, оборот won и количество', () => {
        const { container } = render(
            <ContactHeaderStats
                deals={[
                    deal({ amount: 100_000, result: 'active' }),
                    deal({ id: 'd2', amount: 250_000, result: 'won' }),
                ]}
            />,
        )

        expect(screen.getByText('Сумма сделок')).toBeInTheDocument()
        expect(screen.getByText('Оборот')).toBeInTheDocument()
        expect(screen.getByText('Сделок')).toBeInTheDocument()
        expect(squash(container.textContent)).toContain('350000')
        expect(squash(container.textContent)).toContain('250000')
        expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('в loading показывает skeleton вместо сумм', () => {
        const { container } = render(
            <ContactHeaderStats deals={[deal()]} loading />,
        )

        expect(screen.getByText('Сумма сделок')).toBeInTheDocument()
        expect(container.textContent).not.toContain('₽')
    })
})
