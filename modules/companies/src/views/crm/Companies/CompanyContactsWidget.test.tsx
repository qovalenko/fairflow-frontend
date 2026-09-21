import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CompanyContactsWidget from './CompanyContactsWidget'
import type { Contact } from '@/@types/crm'

const contact = (over: Partial<Contact> = {}): Contact => ({
    id: 'ct1',
    firstName: 'Иван',
    lastName: 'Петров',
    phone: '+7 999 111-22-33',
    email: 'ivan@example.com',
    position: 'Директор',
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

describe('CompanyContactsWidget', () => {
    it('пустой список — «Нет контактов»', () => {
        render(<CompanyContactsWidget contacts={[]} />)
        expect(screen.getByText('Контакты')).toBeInTheDocument()
        expect(screen.getByText('Нет контактов')).toBeInTheDocument()
    })

    it('рендерит контакт с телефоном и email', () => {
        render(<CompanyContactsWidget contacts={[contact()]} />)
        expect(screen.getByText(/Иван Петров/)).toBeInTheDocument()
        expect(screen.getByText('Директор')).toBeInTheDocument()
        expect(screen.getByText('+7 999 111-22-33')).toBeInTheDocument()
        expect(screen.getByText('ivan@example.com')).toBeInTheDocument()
    })

    it('клик по строке и кнопка «Добавить контакт»', async () => {
        const user = userEvent.setup()
        const onContactClick = vi.fn()
        const onAddContact = vi.fn()
        render(
            <CompanyContactsWidget
                contacts={[contact()]}
                onContactClick={onContactClick}
                onAddContact={onAddContact}
            />,
        )
        await user.click(screen.getByText(/Иван Петров/))
        expect(onContactClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'ct1' }))
        await user.click(screen.getByLabelText('Добавить контакт'))
        expect(onAddContact).toHaveBeenCalled()
    })
})
