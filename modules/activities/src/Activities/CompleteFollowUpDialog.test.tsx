import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Activity } from '@/@types/crm'
import CompleteFollowUpDialog from './CompleteFollowUpDialog'

const source: Activity = {
    id: 'a1',
    type: 'call',
    title: 'Обсудить условия',
    status: 'planned',
    priority: 'medium',
    createdAt: 0,
    updatedAt: 0,
}

describe('CompleteFollowUpDialog', () => {
    it('после открытия подставляет follow-up заголовок и тип по умолчанию', async () => {
        render(
            <CompleteFollowUpDialog
                open
                source={source}
                onClose={() => {}}
                onConfirm={vi.fn()}
            />,
        )

        await waitFor(() =>
            expect(
                screen.getByDisplayValue('Follow-up: Обсудить условия'),
            ).toBeInTheDocument(),
        )
        expect(screen.getByText('Завершить и запланировать следующую')).toBeInTheDocument()
    })

    it('без названия кнопка подтверждения заблокирована', async () => {
        render(
            <CompleteFollowUpDialog
                open
                source={source}
                onClose={() => {}}
                onConfirm={vi.fn()}
            />,
        )

        const titleInput = await screen.findByDisplayValue('Follow-up: Обсудить условия')
        fireEvent.change(titleInput, { target: { value: '   ' } })

        expect(screen.getByRole('button', { name: 'Завершить и создать' })).toHaveClass('cursor-not-allowed')
    })

    it('подтверждение отдаёт payload с типом и сроком', async () => {
        const onConfirm = vi.fn()
        render(
            <CompleteFollowUpDialog
                open
                source={source}
                onClose={() => {}}
                onConfirm={onConfirm}
            />,
        )

        const titleInput = await screen.findByDisplayValue('Follow-up: Обсудить условия')
        fireEvent.change(titleInput, { target: { value: 'Следующий шаг' } })

        fireEvent.click(screen.getByRole('button', { name: 'Завершить и создать' }))

        await waitFor(() => expect(onConfirm).toHaveBeenCalled())
        expect(onConfirm.mock.calls[0][0]).toMatchObject({
            title: 'Следующий шаг',
            type: 'task',
        })
        expect(typeof onConfirm.mock.calls[0][0].dueDateMs).toBe('number')
    })

    it('для заметки поле срока скрыто', async () => {
        render(
            <CompleteFollowUpDialog
                open
                source={source}
                onClose={() => {}}
                onConfirm={vi.fn()}
            />,
        )

        await screen.findByDisplayValue('Follow-up: Обсудить условия')
        // react-select: выбираем «Заметка» в селекте типа
        const inputs = document.querySelectorAll('input.select__input')
        fireEvent.focus(inputs[0])
        fireEvent.keyDown(inputs[0], { key: 'ArrowDown', code: 'ArrowDown' })
        const noteOption = await waitFor(() => {
            const found = Array.from(document.querySelectorAll('[role="option"]')).find(
                (el) => el.textContent === 'Заметка',
            )
            if (!found) throw new Error('option not rendered yet')
            return found
        })
        fireEvent.click(noteOption)

        expect(screen.queryByLabelText('Срок')).not.toBeInTheDocument()
    })
})
