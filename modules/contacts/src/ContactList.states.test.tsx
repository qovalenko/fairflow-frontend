import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'

const apiGetContacts = vi.fn()
const apiGetCompanies = vi.fn()
const apiGetMembers = vi.fn()
const navigate = vi.fn()

let permissions = new Set([
    'contacts:read',
    'contacts:write',
    'contacts:export',
    'contacts:import',
])

vi.mock('@/services/CrmService', () => ({
    apiGetContacts: (...a: unknown[]) => apiGetContacts(...a),
    apiGetCompanies: (...a: unknown[]) => apiGetCompanies(...a),
    apiGetMembers: (...a: unknown[]) => apiGetMembers(...a),
    apiGetDealSources: () => Promise.resolve([]),
    apiCreateContact: vi.fn(),
    apiFindContactDuplicates: vi.fn(),
    apiExportContacts: vi.fn(),
    apiReassignContactsFromOwner: vi.fn(),
    newIdempotencyKey: () => 'key-1',
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/useDepartmentOptions', () => ({
    default: () => ({ options: [], unavailable: false }),
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/components/template/EntityCreateDrawer', () => ({ default: () => null }))
vi.mock('@/components/ui/Tooltip', () => ({
    default: ({ title, children }: { title: ReactNode; children: ReactNode }) => (
        <span title={typeof title === 'string' ? title : undefined}>{children}</span>
    ),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useNavigate: () => navigate,
        Link: ({ children, to }: { children: ReactNode; to: string }) => (
            <a href={to}>{children}</a>
        ),
    }
})

const { default: ContactList } = await import('./ContactList')

const renderList = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/contacts']}>
                <ContactList />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('ContactList — состояния экрана', () => {
    beforeEach(() => {
        permissions = new Set([
            'contacts:read',
            'contacts:write',
            'contacts:export',
            'contacts:import',
        ])
        apiGetContacts.mockReset().mockResolvedValue({ list: [], total: 0 })
        apiGetCompanies.mockReset().mockResolvedValue({ list: [], total: 0 })
        apiGetMembers.mockReset().mockResolvedValue([])
    })

    it('loading — заголовок виден, пустой список и ошибка ещё нет', () => {
        apiGetContacts.mockImplementation(() => new Promise(() => {}))
        renderList()
        expect(screen.getByRole('heading', { name: 'Контакты' })).toBeInTheDocument()
        expect(screen.queryByText('Контактов ещё нет')).not.toBeInTheDocument()
        expect(screen.queryByText('Не удалось загрузить контакты')).not.toBeInTheDocument()
    })

    it('без contacts:read — «Раздел «Контакты» недоступен»', () => {
        permissions = new Set(['contacts:write'])
        renderList()
        expect(screen.getByText(/Раздел «Контакты» недоступен/)).toBeInTheDocument()
        expect(apiGetContacts).not.toHaveBeenCalled()
    })

    it('с данными — контакт в таблице', async () => {
        apiGetContacts.mockResolvedValue({
            list: [
                {
                    id: 'c1',
                    firstName: 'Иван',
                    lastName: 'Иванов',
                    phone: '',
                    email: 'i@example.com',
                    createdAt: 0,
                    updatedAt: 0,
                },
            ],
            total: 1,
        })
        renderList()
        expect(await screen.findByText('Иван Иванов')).toBeInTheDocument()
    })

    it('пустой список — CTA создать контакт', async () => {
        renderList()
        expect(await screen.findByText('Контактов ещё нет')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Создать контакт' })).toBeInTheDocument()
    })

    it('ошибка загрузки — «Повторить» перезапрашивает список', async () => {
        apiGetContacts
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValue({
                list: [
                    {
                        id: 'c1',
                        firstName: 'Иван',
                        lastName: 'Иванов',
                        phone: '',
                        email: 'i@example.com',
                        createdAt: 0,
                        updatedAt: 0,
                    },
                ],
                total: 1,
            })
        const user = userEvent.setup()
        renderList()
        expect(await screen.findByText('Не удалось загрузить контакты')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Повторить' }))
        await waitFor(() => expect(apiGetContacts).toHaveBeenCalledTimes(2))
        expect(await screen.findByText('Иван Иванов')).toBeInTheDocument()
    })

    it('пустой результат фильтра — «Ничего не найдено» и сброс', async () => {
        apiGetContacts.mockImplementation((params: { query?: string }) =>
            Promise.resolve(
                params.query
                    ? { list: [], total: 0 }
                    : {
                          list: [
                              {
                                  id: 'c1',
                                  firstName: 'Иван',
                                  lastName: 'Иванов',
                                  phone: '',
                                  email: 'i@example.com',
                                  createdAt: 0,
                                  updatedAt: 0,
                              },
                          ],
                          total: 1,
                      },
            ),
        )
        const user = userEvent.setup()
        renderList()
        await screen.findByText('Иван Иванов')
        await user.type(screen.getByPlaceholderText('Поиск...'), 'zzz')
        expect(await screen.findByText('Ничего не найдено')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
        await waitFor(() =>
            expect(apiGetContacts).toHaveBeenCalledWith(
                expect.objectContaining({ query: '', projectId: 'p1' }),
            ),
        )
    }, 15_000)
})
