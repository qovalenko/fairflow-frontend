import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Contact } from '@/@types/crm'
import { useGlobalEntityDrawer } from '@/store/globalEntityDrawerStore'
import ContactHeaderWidget from './ContactHeaderWidget'

vi.mock('@/components/ui/Tooltip', () => ({
    default: ({ title, children }: { title?: string; children: React.ReactNode }) => (
        <span title={title}>{children}</span>
    ),
}))

const contact: Contact = {
    id: 'c1',
    firstName: 'Иван',
    lastName: 'Иванов',
    phone: '+7 999 000-00-00',
    email: 'ivan@example.com',
    position: 'Директор',
    tags: ['vip'],
    source: 'Сайт',
    assigneeId: 'u1',
    assigneeName: 'Пётр Петров',
    createdAt: 0,
    updatedAt: 0,
}

describe('ContactHeaderWidget', () => {
    it('показывает имя, контакты и метки', () => {
        render(<ContactHeaderWidget contact={contact} fullName="Иванов Иван" />)

        expect(screen.getByText('Иванов Иван')).toBeInTheDocument()
        expect(screen.getByText('Директор')).toBeInTheDocument()
        expect(screen.getByText('+7 999 000-00-00')).toBeInTheDocument()
        expect(screen.getByText('ivan@example.com')).toBeInTheDocument()
        expect(screen.getByText('vip')).toBeInTheDocument()
        expect(screen.getByText('Сайт')).toBeInTheDocument()
        expect(screen.getByText('Пётр Петров')).toBeInTheDocument()
    })

    it('кнопки действий вызывают переданные колбэки', () => {
        const onEdit = vi.fn()
        const onDelete = vi.fn()
        const onMerge = vi.fn()

        render(
            <ContactHeaderWidget
                contact={contact}
                fullName="Иванов Иван"
                onEdit={onEdit}
                onDelete={onDelete}
                onMerge={onMerge}
            />,
        )

        fireEvent.click(screen.getByLabelText('Редактировать'))
        fireEvent.click(screen.getByLabelText('Удалить'))
        fireEvent.click(screen.getByLabelText('Слить дубль'))

        expect(onEdit).toHaveBeenCalledTimes(1)
        expect(onDelete).toHaveBeenCalledTimes(1)
        expect(onMerge).toHaveBeenCalledTimes(1)
    })

    it('клик по ответственному открывает глобальный drawer пользователя', () => {
        useGlobalEntityDrawer.getState().close()
        const open = vi.spyOn(useGlobalEntityDrawer.getState(), 'open')

        render(<ContactHeaderWidget contact={contact} fullName="Иванов Иван" />)

        fireEvent.click(screen.getByText('Пётр Петров'))
        expect(open).toHaveBeenCalledWith('user', 'u1')
    })
})
