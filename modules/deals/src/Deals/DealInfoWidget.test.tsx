import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Deal } from '@/@types/crm'
import DealInfoWidget from './DealInfoWidget'

const deal = (over: Partial<Deal> = {}): Deal => ({
    id: 'd1',
    name: 'Сделка',
    amount: 100_000,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Новая',
    companyId: 'co1',
    companyName: 'ООО Ромашка',
    contactId: 'c1',
    contactName: 'Иван Иванов',
    productName: 'CRM Pro',
    source: 'Сайт',
    notes: 'Важный клиент',
    lostReason: 'Дорого',
    createdAt: 1_700_000_000,
    expectedCloseDate: 1_710_000_000,
    closedAt: 1_720_000_000,
    updatedAt: 0,
    ...over,
})

describe('DealInfoWidget', () => {
    it('пустые участники — «Нет данных»', () => {
        render(
            <DealInfoWidget
                deal={deal({
                    companyName: undefined,
                    contactName: undefined,
                    productName: undefined,
                })}
            />,
        )

        expect(screen.getByText('Нет данных')).toBeInTheDocument()
    })

    it('рендерит участников, даты, источник, заметку и причину проигрыша', () => {
        const onCompanyClick = vi.fn()
        const onContactClick = vi.fn()
        const onEditNotes = vi.fn()

        render(
            <DealInfoWidget
                deal={deal()}
                onCompanyClick={onCompanyClick}
                onContactClick={onContactClick}
                onEditNotes={onEditNotes}
            />,
        )

        expect(screen.getByText('ООО Ромашка')).toBeInTheDocument()
        expect(screen.getByText('Иван Иванов')).toBeInTheDocument()
        expect(screen.getByText('CRM Pro')).toBeInTheDocument()
        expect(screen.getByText('Сайт')).toBeInTheDocument()
        expect(screen.getByText('Важный клиент')).toBeInTheDocument()
        expect(screen.getByText('Дорого')).toBeInTheDocument()
        expect(screen.getByText(/Создана:/)).toBeInTheDocument()
        expect(screen.getByText(/Ожидаемое закрытие:/)).toBeInTheDocument()
        expect(screen.getByText(/Закрыта:/)).toBeInTheDocument()

        fireEvent.click(screen.getByText('ООО Ромашка'))
        fireEvent.click(screen.getByText('Иван Иванов'))
        fireEvent.click(screen.getByLabelText('Изменить заметку'))

        expect(onCompanyClick).toHaveBeenCalledWith('co1')
        expect(onContactClick).toHaveBeenCalledWith('c1')
        expect(onEditNotes).toHaveBeenCalled()
    })
})
