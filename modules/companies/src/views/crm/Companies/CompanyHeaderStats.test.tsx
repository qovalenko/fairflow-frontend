import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CompanyHeaderStats from './CompanyHeaderStats'

describe('CompanyHeaderStats', () => {
    it('loading — скелетоны вместо цифр', () => {
        const { container } = render(
            <CompanyHeaderStats
                loading
                stats={{
                    dealsTotalAmount: 0,
                    dealsWonAmount: 0,
                    dealsCount: 0,
                    ordersCount: 0,
                    contactsCount: 0,
                }}
            />,
        )
        expect(screen.getByText('Сумма сделок')).toBeInTheDocument()
        expect(container.querySelector('.skeleton')).toBeTruthy()
    })

    it('форматирует суммы и счётчики', () => {
        render(
            <CompanyHeaderStats
                stats={{
                    dealsTotalAmount: 150_000,
                    dealsWonAmount: 100_000,
                    dealsCount: 7,
                    ordersCount: 3,
                    contactsCount: 5,
                }}
            />,
        )
        expect(screen.getByText('Сделок')).toBeInTheDocument()
        expect(screen.getByText('7')).toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument()
        expect(screen.getByText(/150/)).toBeInTheDocument()
        expect(screen.getByText(/100/)).toBeInTheDocument()
    })
})
