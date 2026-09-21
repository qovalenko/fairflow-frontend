import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OrderInfoWidget from './OrderInfoWidget'
import type { Order } from '@/@types/crm'

const baseOrder = {
    id: 'o1',
    number: 'ORD-00001',
    typeId: 't1',
    typeName: 'Тип',
    stageId: 's1',
    stageName: 'Новая',
    status: 'ACTIVE',
    fields: {},
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
} as Order

describe('OrderInfoWidget — FR-PRODUCTS-180 snapshot', () => {
    it('показывает снимок продукта вместо «Нет связей», если нет сделки', () => {
        render(
            <OrderInfoWidget
                order={{
                    ...baseOrder,
                    productId: 'pr1',
                    productName: 'Премиум-РКО',
                    productPrice: 50000,
                    productCurrency: 'RUB',
                    productUnit: 'MONTHLY',
                    productCategory: 'РКО',
                }}
            />,
        )

        expect(screen.getByText('Премиум-РКО')).toBeInTheDocument()
        expect(screen.getByText(/РКО · 50.*000.*₽ · ежемес/)).toBeInTheDocument()
        expect(screen.getByText(/ежемес/)).toBeInTheDocument()
        expect(screen.queryByText('Нет связей')).not.toBeInTheDocument()
    })

    it('без продукта и без других связей остаётся «Нет связей»', () => {
        render(<OrderInfoWidget order={baseOrder} />)
        expect(screen.getByText('Нет связей')).toBeInTheDocument()
    })

    it('клики по связям вызывают колбэки навигации', async () => {
        const user = userEvent.setup()
        const onDealClick = vi.fn()
        const onContactClick = vi.fn()
        const onCompanyClick = vi.fn()

        render(
            <OrderInfoWidget
                order={{
                    ...baseOrder,
                    dealId: 'd1',
                    dealName: 'Сделка X',
                    contactId: 'c1',
                    contactName: 'Иван И.',
                    companyId: 'co1',
                    companyName: 'ООО Альфа',
                }}
                onDealClick={onDealClick}
                onContactClick={onContactClick}
                onCompanyClick={onCompanyClick}
            />,
        )

        await user.click(screen.getByRole('button', { name: 'Сделка X' }))
        await user.click(screen.getByRole('button', { name: 'Иван И.' }))
        await user.click(screen.getByRole('button', { name: 'ООО Альфа' }))
        expect(onDealClick).toHaveBeenCalledWith('d1')
        expect(onContactClick).toHaveBeenCalledWith('c1')
        expect(onCompanyClick).toHaveBeenCalledWith('co1')
    })

    it('показывает заметки, поля и дату обновления', () => {
        render(
            <OrderInfoWidget
                order={{
                    ...baseOrder,
                    notes: 'Важный комментарий',
                    fields: { contractNo: 'CN-77' },
                    updatedAt: baseOrder.createdAt + 86_400_000,
                }}
            />,
        )

        expect(screen.getByText('Важный комментарий')).toBeInTheDocument()
        expect(screen.getByText('contractNo')).toBeInTheDocument()
        expect(screen.getByText('CN-77')).toBeInTheDocument()
        expect(screen.getByText(/Обновлена:/)).toBeInTheDocument()
    })
})
