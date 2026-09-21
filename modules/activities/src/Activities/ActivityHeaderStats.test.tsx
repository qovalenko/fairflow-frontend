import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Activity } from '@/@types/crm'
import ActivityHeaderStats from './ActivityHeaderStats'

const activity = (over: Partial<Activity> = {}): Activity => ({
    id: 'a1',
    type: 'task',
    title: 'Позвонить клиенту',
    status: 'planned',
    priority: 'medium',
    dueDate: 1_700_000_000_000,
    assigneeName: 'Пётр Петров',
    dealId: 'd1',
    contactId: 'c1',
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

describe('ActivityHeaderStats', () => {
    it('показывает срок, ответственного и число связей', () => {
        render(<ActivityHeaderStats activity={activity()} />)

        expect(screen.getByText('Срок')).toBeInTheDocument()
        expect(screen.getByText('Пётр Петров')).toBeInTheDocument()
        expect(screen.getByText('2 связ.')).toBeInTheDocument()
    })

    it('без связей показывает «Нет»', () => {
        render(
            <ActivityHeaderStats
                activity={activity({ dealId: undefined, contactId: undefined })}
            />,
        )

        expect(screen.getByText('Нет')).toBeInTheDocument()
    })

    it('без срока показывает прочерк', () => {
        render(<ActivityHeaderStats activity={activity({ dueDate: undefined })} />)

        expect(screen.getByText('—')).toBeInTheDocument()
    })
})
