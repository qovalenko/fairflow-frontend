import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'
import type { Contact } from '@/@types/crm'

const apiGetContact = vi.fn()
const navigate = vi.fn()

let permissions = new Set(['contacts:read', 'contacts:write'])

vi.mock('@/services/CrmService', () => ({
    apiGetContact: (...args: unknown[]) => apiGetContact(...args),
    apiUpdateContact: vi.fn(),
    apiGetCompanies: () => Promise.resolve({ list: [] }),
    apiGetMembers: () => Promise.resolve([]),
    apiGetDealSources: () => Promise.resolve([]),
    apiReassignContacts: vi.fn(),
    apiGetDepartments: () => Promise.resolve([]),
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useParams: () => ({ id: 'c1' }),
        useNavigate: () => navigate,
    }
})

const { default: ContactEdit } = await import('./ContactEdit')

const contact: Contact = {
    id: 'c1',
    firstName: 'Иван',
    lastName: 'Иванов',
    phone: '+70000000000',
    email: 'ivan@example.com',
    createdAt: 0,
    updatedAt: 0,
}

const renderEdit = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/contacts/c1/edit']}>
                <ContactEdit />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('ContactEdit — экранные состояния', () => {
    beforeEach(() => {
        permissions = new Set(['contacts:read', 'contacts:write'])
        navigate.mockReset()
        apiGetContact.mockReset().mockResolvedValue(contact)
    })

    it('без contacts:read — «Контакт недоступен»', () => {
        permissions = new Set(['contacts:write'])
        renderEdit()
        expect(screen.getByText('Контакт недоступен')).toBeInTheDocument()
        expect(apiGetContact).not.toHaveBeenCalled()
    })

    it('без contacts:write — «Редактирование недоступно»', () => {
        permissions = new Set(['contacts:read'])
        renderEdit()
        expect(screen.getByText('Редактирование недоступно')).toBeInTheDocument()
    })

    it('loading — форма ещё не показана', () => {
        apiGetContact.mockImplementation(() => new Promise(() => {}))
        renderEdit()
        expect(screen.queryByDisplayValue('Иван')).not.toBeInTheDocument()
        expect(screen.queryByText('Контакт не найден')).not.toBeInTheDocument()
    })

    it('с данными — форма заполнена из контакта', async () => {
        renderEdit()
        expect(await screen.findByDisplayValue('Иван')).toBeInTheDocument()
        expect(screen.getByDisplayValue('Иванов')).toBeInTheDocument()
    })

    it('ошибка загрузки — «Повторить»', async () => {
        apiGetContact.mockRejectedValue({ response: { status: 500, data: {} } })
        renderEdit()
        expect(await screen.findByText(/Не удалось загрузить контакт/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('контакт не найден — возврат к списку', async () => {
        apiGetContact.mockRejectedValue({ response: { status: 404, data: {} } })
        renderEdit()
        expect(await screen.findByText('Контакт не найден')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Вернуться к списку' }))
        expect(navigate).toHaveBeenCalledWith('/contacts')
    })
})
