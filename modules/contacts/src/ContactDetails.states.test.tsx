import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'
import type { Contact } from '@/@types/crm'

const apiGetContact = vi.fn()
const apiGetDeals = vi.fn()
const apiGetActivities = vi.fn()
const apiGetContactHistory = vi.fn()
const apiDeleteContact = vi.fn()
const apiFindContactDuplicates = vi.fn()
const toastPush = vi.fn()
const navigate = vi.fn()

let permissions = new Set([
    'contacts:read',
    'contacts:write',
    'contacts:delete',
    'contacts:manage',
])

vi.mock('@/services/CrmService', () => ({
    apiGetContact: (...args: unknown[]) => apiGetContact(...args),
    apiGetDeals: (...args: unknown[]) => apiGetDeals(...args),
    apiGetActivities: (...args: unknown[]) => apiGetActivities(...args),
    apiGetContactHistory: (...args: unknown[]) => apiGetContactHistory(...args),
    apiDeleteContact: (...args: unknown[]) => apiDeleteContact(...args),
    apiFindContactDuplicates: (...args: unknown[]) => apiFindContactDuplicates(...args),
}))

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/utils/hooks/useCompanyNames', () => ({
    default: () => ({ isLoading: false, companyName: () => undefined }),
}))
vi.mock('@/utils/hooks/useDocumentsModuleEnabled', () => ({ default: () => false }))
vi.mock('@/utils/hooks/useWorkspaceRole', () => ({
    default: () => ({ projects: [{ id: 'p1', role: 'manager' }] }),
}))
vi.mock('@/store/authStore', () => ({
    useSessionUser: (selector: (s: { user: { userId: string } }) => unknown) =>
        selector({ user: { userId: 'u1' } }),
}))
vi.mock('@/components/shared/documents/DocumentsTab', () => ({ default: () => null }))
vi.mock('@/components/shared/HostSlot', () => ({ default: () => null }))
vi.mock('@/components/ui/toast', () => ({ default: { push: (...a: unknown[]) => toastPush(...a) } }))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useParams: () => ({ id: 'c1' }),
        useNavigate: () => navigate,
    }
})

const { default: ContactDetails } = await import('./ContactDetails')

const contact: Contact = {
    id: 'c1',
    firstName: 'Иван',
    lastName: 'Иванов',
    phone: '+70000000000',
    email: 'ivan@example.com',
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
}

const renderDetails = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/contacts/c1']}>
                <ContactDetails />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('ContactDetails — экранные состояния', () => {
    beforeEach(() => {
        permissions = new Set([
            'contacts:read',
            'contacts:write',
            'contacts:delete',
            'contacts:manage',
        ])
        navigate.mockReset()
        toastPush.mockReset()
        apiGetContact.mockReset().mockResolvedValue(contact)
        apiGetDeals.mockReset().mockResolvedValue({ list: [], total: 0 })
        apiGetActivities.mockReset().mockResolvedValue({ list: [], total: 0 })
        apiGetContactHistory.mockReset().mockResolvedValue({ items: [] })
        apiDeleteContact.mockReset().mockResolvedValue({ ok: true })
        apiFindContactDuplicates.mockReset().mockResolvedValue({ candidates: [] })
    })

    it('без contacts:read — «Карточка контакта недоступна»', () => {
        permissions = new Set(['contacts:write'])
        renderDetails()
        expect(screen.getByText('Карточка контакта недоступна')).toBeInTheDocument()
        expect(apiGetContact).not.toHaveBeenCalled()
    })

    it('loading — карточка ещё не показана', () => {
        apiGetContact.mockImplementation(() => new Promise(() => {}))
        renderDetails()
        expect(screen.queryByText('Иван Иванов')).not.toBeInTheDocument()
        expect(screen.queryByText('Контакт не найден')).not.toBeInTheDocument()
    })

    it('с данными — имя контакта на карточке', async () => {
        renderDetails()
        expect(await screen.findByText('Иван Иванов')).toBeInTheDocument()
    })

    it('ошибка загрузки — «Не удалось загрузить контакт» и «Повторить»', async () => {
        apiGetContact.mockRejectedValue({ response: { status: 500, data: {} } })
        renderDetails()
        expect(await screen.findByText('Не удалось загрузить контакт')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('контакт не найден — «Контакт не найден» и возврат к списку', async () => {
        apiGetContact.mockRejectedValue({ response: { status: 404, data: {} } })
        renderDetails()
        expect(await screen.findByText('Контакт не найден')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Вернуться к списку' }))
        expect(navigate).toHaveBeenCalledWith('/contacts')
    })
})
