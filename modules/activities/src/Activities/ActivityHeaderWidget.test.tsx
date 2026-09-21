import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Activity } from '@/@types/crm'
import ActivityHeaderWidget from './ActivityHeaderWidget'

const base: Activity = {
    id: 'a1',
    type: 'task',
    title: 'Согласовать КП',
    status: 'planned',
    priority: 'high',
    assigneeName: 'Анна Смирнова',
    dueDate: Date.now() - 86400000,
    createdAt: 0,
    updatedAt: 0,
}

describe('ActivityHeaderWidget', () => {
    it('рисует заголовок, тип и метку просрочки', () => {
        render(<ActivityHeaderWidget activity={base} isOverdue />)

        expect(screen.getByText('Согласовать КП')).toBeInTheDocument()
        expect(screen.getByText('Задача')).toBeInTheDocument()
        expect(screen.getByText('Просрочено')).toBeInTheDocument()
    })

    it('кнопки мутации вызывают колбэки', () => {
        const onComplete = vi.fn()
        const onEdit = vi.fn()
        const onDelete = vi.fn()
        const onFollowUp = vi.fn()

        render(
            <ActivityHeaderWidget
                activity={base}
                onComplete={onComplete}
                onCompleteWithFollowUp={onFollowUp}
                onEdit={onEdit}
                onDelete={onDelete}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Завершить' }))
        fireEvent.click(screen.getByRole('button', { name: 'Завершить и следующую' }))
        fireEvent.click(screen.getByLabelText('Редактировать'))
        fireEvent.click(screen.getByLabelText('Удалить'))

        expect(onComplete).toHaveBeenCalledTimes(1)
        expect(onFollowUp).toHaveBeenCalledTimes(1)
        expect(onEdit).toHaveBeenCalledTimes(1)
        expect(onDelete).toHaveBeenCalledTimes(1)
    })

    it('без canMutate скрывает завершение и редактирование', () => {
        render(
            <ActivityHeaderWidget
                activity={base}
                canMutate={false}
                canDelete={false}
                onComplete={() => {}}
                onEdit={() => {}}
                onDelete={() => {}}
            />,
        )

        expect(screen.queryByRole('button', { name: 'Завершить' })).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Редактировать')).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Удалить')).not.toBeInTheDocument()
    })

    it('терминальный статус блокирует «Завершить»', () => {
        render(
            <ActivityHeaderWidget
                activity={{ ...base, status: 'completed' }}
                onComplete={vi.fn()}
            />,
        )

        expect(screen.queryByRole('button', { name: 'Завершить' })).not.toBeInTheDocument()
        expect(screen.getAllByText('Завершено').length).toBeGreaterThan(0)
    })
})
