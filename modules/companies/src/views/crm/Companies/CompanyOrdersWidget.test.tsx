import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompanyOrdersWidget from './CompanyOrdersWidget'
import type { Order } from '@/@types/crm'

const order = (over: Partial<Order> = {}): Order =>
    ({
        id: 'o1',
        number: 'ORD-42',
        typeId: 'type-1',
        typeName: 'Поставка',
        productId: 'prod-1',
        productName: 'Лицензия',
        stageId: 'stage-1',
        dealName: 'Сделка А',
        stageName: 'Оформление',
        status: 'active',
        createdAt: 0,
        updatedAt: 0,
        ...over,
    }) as Order

describe('CompanyOrdersWidget', () => {
    it('loading — скелетоны', () => {
        const { container } = render(<CompanyOrdersWidget orders={[]} loading />)
        expect(screen.getByText('Продажи')).toBeInTheDocument()
        expect(container.querySelector('.skeleton')).toBeTruthy()
    })

    it('пустой список', () => {
        render(<CompanyOrdersWidget orders={[]} />)
        expect(screen.getByText('Нет продаж')).toBeInTheDocument()
    })

    it('рендерит номер, тип и статус', () => {
        render(<CompanyOrdersWidget orders={[order()]} />)
        expect(screen.getByText('ORD-42')).toBeInTheDocument()
        expect(screen.getByText(/Поставка/)).toBeInTheDocument()
        expect(screen.getByText('Активен')).toBeInTheDocument()
    })

    it('статус error — бейдж DLQ', () => {
        render(<CompanyOrdersWidget orders={[order({ status: 'error' })]} />)
        expect(screen.getByText('⚠ DLQ')).toBeInTheDocument()
    })

    it('клик по продаже', async () => {
        const user = userEvent.setup()
        const onOrderClick = vi.fn()
        render(<CompanyOrdersWidget orders={[order()]} onOrderClick={onOrderClick} />)
        await user.click(screen.getByText('ORD-42'))
        expect(onOrderClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }))
    })
})
