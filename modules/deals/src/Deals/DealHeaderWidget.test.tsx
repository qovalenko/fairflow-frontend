import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Deal } from '@/@types/crm'
import DealHeaderWidget from './DealHeaderWidget'

vi.mock('@/store/globalEntityDrawerStore', () => ({
    useGlobalEntityDrawer: {
        getState: () => ({ open: vi.fn() }),
    },
}))

const deal = (over: Partial<Deal> = {}): Deal => ({
    id: 'd1',
    name: 'Крупная сделка',
    amount: 1_500_000,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Переговоры',
    companyName: 'ООО Ромашка',
    assigneeId: 'u1',
    assigneeName: 'Пётр Петров',
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

describe('DealHeaderWidget', () => {
    it('рендерит сумму, стадию и бейдж выигранной сделки', () => {
        const { container } = render(
            <DealHeaderWidget
                deal={deal({ result: 'won' })}
                stageOptions={[]}
            />,
        )

        expect(screen.getByText('Крупная сделка')).toBeInTheDocument()
        expect(screen.getByText('Выиграна')).toBeInTheDocument()
        expect(screen.getByText('Переговоры')).toBeInTheDocument()
        expect(container.textContent).toContain('₽')
        expect(screen.getByText('Пётр Петров')).toBeInTheDocument()
    })

    it('вызывает onEdit/onDelete и показывает select перемещения', () => {
        const onEdit = vi.fn()
        const onDelete = vi.fn()
        const onMoveToStage = vi.fn()

        render(
            <DealHeaderWidget
                deal={deal()}
                stageOptions={[
                    { value: 's1', label: 'Переговоры' },
                    { value: 's2', label: 'КП' },
                ]}
                onEdit={onEdit}
                onDelete={onDelete}
                onMoveToStage={onMoveToStage}
            />,
        )

        fireEvent.click(screen.getByLabelText('Редактировать'))
        fireEvent.click(screen.getByLabelText('Удалить'))
        expect(onEdit).toHaveBeenCalled()
        expect(onDelete).toHaveBeenCalled()
        expect(document.querySelector('input.select__input')).toBeTruthy()
    })
})
