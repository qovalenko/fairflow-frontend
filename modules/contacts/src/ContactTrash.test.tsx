import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { Contact } from '@/@types/crm'

/**
 * TODO-372 — корзина была зашита на `pageIndex: 0, pageSize: 100`: всё, что
 * дальше сотой записи, пользователь не видел и восстановить не мог, хотя
 * сервер отдаёт честный total (`ListTrash`), а клиент уже принимает
 * pageIndex/pageSize.
 */
const apiGetTrashedContacts = vi.fn()
const apiRestoreContact = vi.fn()
const navigate = vi.fn()

let permissions = new Set(['contacts:read', 'contacts:write'])

vi.mock('react-router', () => ({ useNavigate: () => navigate }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetTrashedContacts: (...a: unknown[]) => apiGetTrashedContacts(...a),
    apiRestoreContact: (...a: unknown[]) => apiRestoreContact(...a),
}))

import ContactTrash from './ContactTrash'

const renderTrash = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <ContactTrash />
        </SWRConfig>,
    )

const trashed = (n: number): Contact[] =>
    Array.from({ length: n }, (_, i) => ({
        id: `t${i}`,
        firstName: 'Иван',
        lastName: `Удалённый${i}`,
        phone: '',
        email: `t${i}@example.com`,
        createdAt: 0,
        updatedAt: 0,
        deletedAt: 1_700_000_000,
    }))

describe('ContactTrash — пагинация (TODO-372)', () => {
    beforeEach(() => {
        permissions = new Set(['contacts:read', 'contacts:write'])
        navigate.mockReset()
        apiRestoreContact.mockReset()
        apiGetTrashedContacts.mockResolvedValue({ list: trashed(25), total: 137 })
    })

    it('запрашивает первую страницу и показывает полный total, а не длину страницы', async () => {
        renderTrash()

        await waitFor(() =>
            expect(apiGetTrashedContacts).toHaveBeenCalledWith({
                projectId: 'p1',
                pageIndex: 0,
                pageSize: 25,
            }),
        )
        expect(await screen.findByText('Всего: 137')).toBeInTheDocument()
    })

    it('переход на следующую страницу перезапрашивает сервер со сдвигом', async () => {
        renderTrash()
        await screen.findByText('Всего: 137')

        fireEvent.click(screen.getByText('2'))

        await waitFor(() =>
            expect(apiGetTrashedContacts).toHaveBeenCalledWith({
                projectId: 'p1',
                pageIndex: 1,
                pageSize: 25,
            }),
        )
    })
})

describe('ContactTrash — восстановление', () => {
    beforeEach(() => {
        permissions = new Set(['contacts:read', 'contacts:write'])
        navigate.mockReset()
        apiRestoreContact.mockReset()
        apiGetTrashedContacts.mockResolvedValue({
            list: [
                {
                    id: 't0',
                    firstName: 'Иван',
                    lastName: 'Удалённый0',
                    phone: '',
                    email: 't0@example.com',
                    createdAt: 0,
                    updatedAt: 0,
                    deletedAt: 1_700_000_000,
                },
            ],
            total: 1,
        })
        apiRestoreContact.mockResolvedValue({ contact: { id: 't0' } })
    })

    it('успешное восстановление ведёт на карточку контакта', async () => {
        renderTrash()
        await screen.findByText('Иван Удалённый0')

        fireEvent.click(screen.getByRole('button', { name: 'Восстановить' }))

        await waitFor(() =>
            expect(apiRestoreContact).toHaveBeenCalledWith('t0', undefined, { projectId: 'p1' }),
        )
        expect(navigate).toHaveBeenCalledWith('/contacts/t0')
    })

    it('коллизия ключа — диалог и восстановление без email/телефона', async () => {
        const trashedContact = {
            id: 't0',
            firstName: 'Иван',
            lastName: 'Удалённый0',
            phone: '+70000000001',
            email: 't0@example.com',
            createdAt: 0,
            updatedAt: 0,
            deletedAt: 1_700_000_000,
        }
        apiRestoreContact
            .mockResolvedValueOnce({
                outcome: 'collision',
                collision: {
                    candidates: [
                        {
                            contactId: 'c-active',
                            displayName: 'Активный Контакт',
                            maskedValue: 'a***@example.com',
                        },
                    ],
                    options: ['clear_keys'],
                },
            })
            .mockResolvedValueOnce({ contact: { id: 't0' } })

        renderTrash()
        await screen.findByText('Иван Удалённый0')
        fireEvent.click(screen.getByRole('button', { name: 'Восстановить' }))

        expect(await screen.findByText('Ключ занят активным контактом')).toBeInTheDocument()
        expect(screen.getByText(/Активный Контакт/)).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Восстановить без email/телефона' }))

        await waitFor(() =>
            expect(apiRestoreContact).toHaveBeenCalledWith('t0', { collisionResolution: 'clear_keys' }, {
                projectId: 'p1',
            }),
        )
        expect(navigate).toHaveBeenCalledWith('/contacts/t0')
    })
})
