import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompanyHistoryWidget from './CompanyHistoryWidget'
import type { HistoryTimelineEvent } from '@/components/shared/HistoryTimeline'

const event = (over: Partial<HistoryTimelineEvent> = {}): HistoryTimelineEvent => ({
    id: 'h1',
    time: '01.01.2024 12:00',
    action: 'Компания изменена',
    user: 'Мария Иванова',
    details: 'Обновлены реквизиты',
    timestamp: 1_700_000_000,
    diff: [{ field: 'name', old: 'Старое', new: 'Новое' }],
    ...over,
})

describe('CompanyHistoryWidget', () => {
    it('пустая история', () => {
        render(<CompanyHistoryWidget events={[]} />)
        expect(screen.getByText('История')).toBeInTheDocument()
        expect(screen.getByText('Нет записей истории')).toBeInTheDocument()
    })

    it('группирует события по дате и показывает автора', () => {
        render(<CompanyHistoryWidget events={[event()]} />)
        expect(screen.getByText('Компания изменена')).toBeInTheDocument()
        expect(screen.getByText('Мария Иванова')).toBeInTheDocument()
        expect(screen.getByText('Обновлены реквизиты')).toBeInTheDocument()
    })

    it('раскрывает diff по клику', async () => {
        const user = userEvent.setup()
        render(<CompanyHistoryWidget events={[event()]} />)
        await user.click(screen.getAllByRole('button', { name: /Развернуть|Свернуть/ })[0])
        expect(screen.getByText('Изменения:')).toBeInTheDocument()
        expect(screen.getByText('Старое')).toBeInTheDocument()
        expect(screen.getByText(/→\s*Новое/)).toBeInTheDocument()
    })
})
