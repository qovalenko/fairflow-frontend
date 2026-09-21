import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Contact } from '@/@types/crm'
import ContactInfoWidget from './ContactInfoWidget'

const baseContact = (over: Partial<Contact> = {}): Contact => ({
    id: 'c1',
    firstName: 'Иван',
    lastName: 'Иванов',
    phone: '+70000000000',
    email: 'ivan@example.com',
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_100,
    ...over,
})

describe('ContactInfoWidget', () => {
    it('показывает компании, заметки и теги', () => {
        render(
            <ContactInfoWidget
                contact={baseContact({
                    companies: [{ id: 'co1', name: 'ООО Ромашка', role: 'CEO' }],
                    notes: 'VIP-клиент',
                    tags: ['vip', 'b2b'],
                })}
            />,
        )

        expect(screen.getByText('Информация о контакте')).toBeInTheDocument()
        expect(screen.getByText('ООО Ромашка')).toBeInTheDocument()
        expect(screen.getByText('CEO')).toBeInTheDocument()
        expect(screen.getByText('VIP-клиент')).toBeInTheDocument()
        expect(screen.getByText('vip')).toBeInTheDocument()
    })

    it('предупреждает об осиротевших companyId', () => {
        render(
            <ContactInfoWidget
                contact={baseContact({ orphanedCompanyIds: ['co-deleted'] })}
            />,
        )

        expect(screen.getByText(/Связь с удалённой компанией/)).toBeInTheDocument()
        expect(screen.getByText(/co-deleted/)).toBeInTheDocument()
    })

    it('клик по компании вызывает onCompanyClick', () => {
        const onCompanyClick = vi.fn()

        render(
            <ContactInfoWidget
                contact={baseContact({
                    companies: [{ id: 'co1', name: 'ООО Ромашка' }],
                })}
                onCompanyClick={onCompanyClick}
            />,
        )

        fireEvent.click(screen.getByText('ООО Ромашка'))
        expect(onCompanyClick).toHaveBeenCalledWith('co1')
    })

    it('кнопка редактирования заметки вызывает onEditNotes', () => {
        const onEditNotes = vi.fn()

        render(
            <ContactInfoWidget
                contact={baseContact({ notes: 'Важно' })}
                onEditNotes={onEditNotes}
            />,
        )

        fireEvent.click(screen.getByLabelText('Изменить заметку'))
        expect(onEditNotes).toHaveBeenCalledTimes(1)
    })
})
