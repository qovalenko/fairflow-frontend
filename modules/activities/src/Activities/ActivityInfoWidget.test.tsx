import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Activity } from '@/@types/crm'
import ActivityInfoWidget from './ActivityInfoWidget'

const activity: Activity = {
    id: 'a1',
    type: 'meeting',
    title: 'Встреча с клиентом',
    status: 'planned',
    priority: 'medium',
    dueDate: 1_700_000_000_000,
    startDate: 1_700_000_000_000,
    endDate: 1_700_000_360_000,
    duration: 60,
    assigneeName: 'Пётр Петров',
    participants: ['u1', 'u2'],
    location: 'Офис',
    dealId: 'd1',
    dealName: 'Сделка №1',
    contactId: 'c1',
    contactName: 'Иван Иванов',
    companyId: 'co1',
    companyName: 'ООО Ромашка',
    orderId: 'o1',
    orderName: 'SO-001',
    createdByRule: { ruleId: 'rule-follow-up', name: 'Follow-up' },
    createdAt: 0,
    updatedAt: 0,
}

describe('ActivityInfoWidget', () => {
    it('показывает даты, участников и связи', () => {
        render(<ActivityInfoWidget activity={activity} isOverdue />)

        expect(screen.getByText('Информация об активности')).toBeInTheDocument()
        expect(screen.getByText('Пётр Петров')).toBeInTheDocument()
        expect(screen.getByText('Офис')).toBeInTheDocument()
        expect(screen.getByText('Сделка №1')).toBeInTheDocument()
        expect(screen.getByText('Иван Иванов')).toBeInTheDocument()
        expect(screen.getByText('ООО Ромашка')).toBeInTheDocument()
        expect(screen.getByText('SO-001')).toBeInTheDocument()
    })

    it('клики по связям вызывают колбэки навигации', () => {
        const onDealClick = vi.fn()
        const onContactClick = vi.fn()
        const onCompanyClick = vi.fn()
        const onOrderClick = vi.fn()

        render(
            <ActivityInfoWidget
                activity={activity}
                onDealClick={onDealClick}
                onContactClick={onContactClick}
                onCompanyClick={onCompanyClick}
                onOrderClick={onOrderClick}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Сделка №1' }))
        fireEvent.click(screen.getByRole('button', { name: 'Иван Иванов' }))
        fireEvent.click(screen.getByRole('button', { name: 'ООО Ромашка' }))
        fireEvent.click(screen.getByRole('button', { name: 'SO-001' }))

        expect(onDealClick).toHaveBeenCalledWith('d1')
        expect(onContactClick).toHaveBeenCalledWith('c1')
        expect(onCompanyClick).toHaveBeenCalledWith('co1')
        expect(onOrderClick).toHaveBeenCalledWith('o1')
    })

    it('без данных показывает «Нет данных» и «Нет связей»', () => {
        render(
            <ActivityInfoWidget
                activity={{
                    id: 'a2',
                    type: 'note',
                    title: 'Заметка',
                    status: 'planned',
                    priority: 'low',
                    createdAt: 0,
                    updatedAt: 0,
                }}
            />,
        )

        expect(screen.getAllByText('Нет данных').length).toBeGreaterThan(0)
        expect(screen.getByText('Нет связей')).toBeInTheDocument()
    })
})
