import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'

const apiGetTrashedContacts = vi.fn()
const navigate = vi.fn()

let permissions = new Set(['contacts:read', 'contacts:write'])

vi.mock('@/services/CrmService', () => ({
    apiGetTrashedContacts: (...a: unknown[]) => apiGetTrashedContacts(...a),
    apiRestoreContact: vi.fn(),
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useNavigate: () => navigate }
})

const { default: ContactTrash } = await import('./ContactTrash')

const renderTrash = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/contacts/trash']}>
                <ContactTrash />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('ContactTrash — состояния экрана', () => {
    beforeEach(() => {
        permissions = new Set(['contacts:read', 'contacts:write'])
        navigate.mockReset()
        apiGetTrashedContacts.mockReset().mockResolvedValue({ list: [], total: 0 })
    })

    it('без contacts:read — «Раздел недоступен»', () => {
        permissions = new Set()
        renderTrash()
        expect(screen.getByText('Раздел недоступен')).toBeInTheDocument()
        expect(apiGetTrashedContacts).not.toHaveBeenCalled()
    })

    it('loading — таблица ещё не показана', () => {
        apiGetTrashedContacts.mockImplementation(() => new Promise(() => {}))
        renderTrash()
        expect(screen.queryByText('Корзина пуста')).not.toBeInTheDocument()
        expect(screen.queryByText('Не удалось загрузить корзину')).not.toBeInTheDocument()
    })

    it('с данными — удалённый контакт и кнопка «Восстановить»', async () => {
        apiGetTrashedContacts.mockResolvedValue({
            list: [
                {
                    id: 't1',
                    firstName: 'Пётр',
                    lastName: 'Удалённый',
                    phone: '+70000000001',
                    email: 't1@example.com',
                    createdAt: 0,
                    updatedAt: 0,
                    deletedAt: 1_700_000_000,
                },
            ],
            total: 1,
        })
        renderTrash()
        expect(await screen.findByText('Пётр Удалённый')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Восстановить' })).toBeInTheDocument()
    })

    it('пустая корзина — «Корзина пуста»', async () => {
        renderTrash()
        expect(await screen.findByText('Корзина пуста')).toBeInTheDocument()
    })

    it('ошибка загрузки — «Повторить» перезапрашивает корзину', async () => {
        apiGetTrashedContacts
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValue({ list: [], total: 0 })
        const user = userEvent.setup()
        renderTrash()
        expect(await screen.findByText('Не удалось загрузить корзину')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Повторить' }))
        await waitFor(() => expect(apiGetTrashedContacts).toHaveBeenCalledTimes(2))
        expect(await screen.findByText('Корзина пуста')).toBeInTheDocument()
    })
})
