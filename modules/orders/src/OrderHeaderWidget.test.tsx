import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OrderHeaderWidget from './OrderHeaderWidget'
import { useGlobalEntityDrawer } from '@/store/globalEntityDrawerStore'
import type { Order } from '@/@types/crm'

const baseOrder = {
    id: 'o1',
    number: 'ORD-100',
    typeId: 't1',
    typeName: 'Договор',
    stageId: 's1',
    stageName: 'Оформление',
    status: 'active',
    fields: {},
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
} as Order

describe('OrderHeaderWidget — шапка карточки продажи', () => {
    beforeEach(() => {
        useGlobalEntityDrawer.setState({ entityType: null, entityId: null, open: useGlobalEntityDrawer.getState().open, close: useGlobalEntityDrawer.getState().close })
    })

    it('показывает номер, тип, статус и связанные сущности', () => {
        render(
            <OrderHeaderWidget
                order={{
                    ...baseOrder,
                    dealName: 'Сделка А',
                    companyName: 'ООО Ромашка',
                }}
                stageOptions={[]}
            />,
        )

        expect(screen.getByText('ORD-100')).toBeInTheDocument()
        expect(screen.getByText('Договор')).toBeInTheDocument()
        expect(screen.getByText('Активен')).toBeInTheDocument()
        expect(screen.getByText('Сделка А')).toBeInTheDocument()
        expect(screen.getByText(/ООО Ромашка/)).toBeInTheDocument()
        expect(screen.getByText('Оформление')).toBeInTheDocument()
    })

    it('кнопка «Редактировать» вызывает onEdit', async () => {
        const user = userEvent.setup()
        const onEdit = vi.fn()
        render(
            <OrderHeaderWidget order={baseOrder} stageOptions={[]} onEdit={onEdit} />,
        )

        await user.click(screen.getByRole('button', { name: 'Редактировать' }))
        expect(onEdit).toHaveBeenCalledTimes(1)
    })

    it('селектор этапа зовёт onMoveToStage', async () => {
        const user = userEvent.setup()
        const onMove = vi.fn()
        render(
            <OrderHeaderWidget
                order={baseOrder}
                stageOptions={[
                    { value: 's1', label: 'Оформление' },
                    { value: 's2', label: 'Подписание' },
                ]}
                onMoveToStage={onMove}
            />,
        )

        const input = document.querySelector('input.select__input') as HTMLInputElement
        await user.click(input)
        await user.click(await screen.findByText('Подписание'))
        expect(onMove).toHaveBeenCalledWith('s2')
    })

    it('клик по ответственному открывает глобальный drawer пользователя', async () => {
        const user = userEvent.setup()
        render(
            <OrderHeaderWidget
                order={{
                    ...baseOrder,
                    assigneeId: 'u9',
                    assigneeName: 'Пётр Петров',
                }}
                stageOptions={[]}
            />,
        )

        await user.click(screen.getByText('Пётр Петров'))
        expect(useGlobalEntityDrawer.getState()).toMatchObject({
            entityType: 'user',
            entityId: 'u9',
        })
    })
})
