import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Order } from '@/@types/crm'
import CompanyOrdersWidget, { statusKeyOf } from './CompanyOrdersWidget'

const order = (over: Partial<Order> = {}): Order => ({
    id: 'o1',
    number: 'SO-100',
    typeId: 't1',
    typeName: 'Договор',
    stageId: 's1',
    stageName: 'Подписание',
    status: 'ACTIVE',
    fields: {},
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

describe('CompanyOrdersWidget', () => {
    it('loading — скелетоны вместо строк', () => {
        const { container } = render(<CompanyOrdersWidget orders={[order()]} loading />)

        expect(screen.getByText('Продажи')).toBeInTheDocument()
        expect(screen.queryByText('SO-100')).not.toBeInTheDocument()
        expect(container.querySelectorAll('.skeleton').length + container.querySelectorAll('[class*="Skeleton"]').length).toBeGreaterThan(0)
    })

    it('пустой список — «Нет продаж»', () => {
        render(<CompanyOrdersWidget orders={[]} />)
        expect(screen.getByText('Нет продаж')).toBeInTheDocument()
    })

    it('рендерит продажи и статусы домена', () => {
        const onOrderClick = vi.fn()
        render(
            <CompanyOrdersWidget
                orders={[
                    order({ status: 'DONE' }),
                    order({ id: 'o2', number: 'SO-200', status: 'SEND_ERROR' }),
                ]}
                onOrderClick={onOrderClick}
            />,
        )

        expect(screen.getByText('SO-100')).toBeInTheDocument()
        expect(screen.getByText('Завершён')).toBeInTheDocument()
        expect(screen.getByText('⚠ Ошибка отправки')).toBeInTheDocument()

        fireEvent.click(screen.getByText('SO-100'))
        expect(onOrderClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'o1' }))
    })
})

describe('statusKeyOf', () => {
    it('экспортируется для dealOrdersWidget.test.ts', () => {
        expect(statusKeyOf('CANCELLED')).toBe('cancelled')
    })
})
