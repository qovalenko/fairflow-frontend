import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DealHeaderStats from './DealHeaderStats'
import type { Deal, Order } from '@/@types/crm'

/**
 * Reference RTL component test for a Module Federation remote (T-027 template).
 * Renders a real remote component against the host `@/@types` + host UI kit
 * (`@/components/ui/Skeleton`) resolved via the `@` alias — no network, no
 * federation runtime.
 */
const deal = (over: Partial<Deal> = {}): Deal => ({
    id: 'd1',
    name: 'Big deal',
    amount: 1_500_000,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Новая',
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

/** DealHeaderStats only reads `orders.length`. */
const orders = (n: number): Order[] => new Array(n).fill(null) as unknown as Order[]

/** Strip all whitespace (incl. NBSP/narrow-NBSP that Intl inserts) for stable assertions. */
const squash = (s: string | null) => (s ?? '').replace(/\s/g, '')

describe('DealHeaderStats (remote component)', () => {
    it('renders formatted amount + orders/activities counts', () => {
        const { container } = render(
            <DealHeaderStats deal={deal()} orders={orders(2)} activitiesCount={5} />,
        )

        // Labels present.
        expect(screen.getByText('Сумма')).toBeInTheDocument()
        expect(screen.getByText('Продаж')).toBeInTheDocument()
        expect(screen.getByText('Активностей')).toBeInTheDocument()

        // Money formatted in ru-RU with a currency sign (whitespace-normalized).
        expect(squash(container.textContent)).toContain('1500000')
        expect(container.textContent).toContain('₽')

        // Counts derived from props.
        expect(screen.getByText('2')).toBeInTheDocument()
        expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('shows skeletons instead of values while loading', () => {
        const { container } = render(
            <DealHeaderStats
                deal={deal()}
                orders={orders(2)}
                activitiesCount={5}
                loading
            />,
        )

        // Labels stay; values are replaced by skeletons (no currency/counts).
        expect(screen.getByText('Сумма')).toBeInTheDocument()
        expect(container.textContent).not.toContain('₽')
        expect(screen.queryByText('5')).not.toBeInTheDocument()
    })
})
