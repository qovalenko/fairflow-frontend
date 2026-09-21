import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import type { Contact } from '@/@types/crm'

/**
 * TODO-168 — связанные активности в карточке контакта.
 *
 * Раньше карточка тянула ВЕСЬ список активностей (`pageSize: 1000`, без
 * projectId), а нужные отбирала на клиенте по `activity.contactId`. Gateway
 * режет страницу до 100 (`parsePageSize`), поэтому в проекте с >100
 * активностей часть активностей контакта до карточки просто не доезжала.
 *
 * Контракт серверного фильтра у GET /v1/activities — пара
 * `linkEntityType`/`linkEntityId` (`crm-bff.controller.ts#listActivities`);
 * домен кладёт её предикатом в Mongo (`activity.service.ts#list`).
 *
 * TODO-370 — читательский гейт: сервер требует `contacts:read`.
 */
const apiGetActivities = vi.fn()
const apiGetDeals = vi.fn()
const apiGetContact = vi.fn()

let permissions = new Set(['contacts:read', 'contacts:write'])

vi.mock('react-router', () => ({
    useParams: () => ({ id: 'c1' }),
    useNavigate: () => vi.fn(),
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/utils/hooks/useCompanyNames', () => ({
    default: () => ({ isLoading: false, companyName: () => undefined }),
}))
vi.mock('@/components/shared/documents/DocumentsTab', () => ({ default: () => null }))
const apiUnmergeContact = vi.fn()

vi.mock('@/services/CrmService', () => ({
    apiGetContact: (...a: unknown[]) => apiGetContact(...a),
    apiGetDeals: (...a: unknown[]) => apiGetDeals(...a),
    apiGetActivities: (...a: unknown[]) => apiGetActivities(...a),
    apiGetContactHistory: () => Promise.resolve({ items: [] }),
    apiDeleteContact: vi.fn(),
    apiFindContactDuplicates: vi.fn(),
    apiUnmergeContact: (...a: unknown[]) => apiUnmergeContact(...a),
}))

import { SWRConfig } from 'swr'

import ContactDetails from './ContactDetails'

const contact: Contact = {
    id: 'c1',
    firstName: 'Иван',
    lastName: 'Иванов',
    phone: '+70000000000',
    email: 'ivan@example.com',
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
}

describe('ContactDetails — связанные активности (TODO-168)', () => {
    beforeEach(() => {
        permissions = new Set(['contacts:read', 'contacts:write'])
        apiGetContact.mockResolvedValue(contact)
        apiGetDeals.mockResolvedValue({ list: [], total: 0 })
        apiGetActivities.mockResolvedValue({
            list: [
                {
                    id: 'a1',
                    type: 'task',
                    title: 'Позвонить Ивану',
                    status: 'planned',
                    dueDate: 1_700_000_000,
                    // Плоского contactId в ответе может не быть вовсе — состав
                    // определяет сервер, клиент повторно НЕ фильтрует.
                },
            ],
            total: 1,
        })
    })

    it('запрашивает активности серверным фильтром по контакту, а не весь список', async () => {
        render(<ContactDetails />)

        await waitFor(() => expect(apiGetActivities).toHaveBeenCalled())
        expect(apiGetActivities).toHaveBeenCalledWith({
            projectId: 'p1',
            linkEntityType: 'contact',
            linkEntityId: 'c1',
            pageSize: 100,
        })
    })

    it('показывает активность, пришедшую от сервера, без клиентской перефильтрации', async () => {
        render(<ContactDetails />)

        expect(await screen.findByText('Позвонить Ивану')).toBeInTheDocument()
    })

    it('без contacts:read рисует экран «нет доступа» и не ходит в API (TODO-370)', async () => {
        permissions = new Set(['contacts:write'])

        render(<ContactDetails />)

        expect(await screen.findByText(/Карточка контакта недоступна/)).toBeInTheDocument()
        expect(apiGetContact).not.toHaveBeenCalled()
        expect(apiGetActivities).not.toHaveBeenCalled()
    })
})

/**
 * TODO-161 — «Отменить слияние». RPC UnmergeContact и маршрут
 * POST /v1/contacts/:id/unmerge существовали, но точки входа в UI не было ни
 * одной: тень слияния не видна ни в списке, ни в корзине (TODO-175), поэтому id
 * донора пользователю взять неоткуда. Домен отдаёт доноров в карточке мастера.
 */
describe('ContactDetails — откат слияния (TODO-161)', () => {
    // Кэш SWR живёт в модуле и переживает render: без своего провайдера карточка
    // по ключу `/v1/contacts/c1` пришла бы из предыдущего describe (без слияний).
    const renderCard = () =>
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <ContactDetails />
            </SWRConfig>,
        )

    const merged: Contact = {
        ...contact,
        mergedSources: [
            {
                id: 'src-1',
                firstName: 'Пётр',
                lastName: 'Петров',
                email: 'petr@example.com',
                mergedAt: 1_700_000_000,
                unmergeUntil: 1_700_000_000 + 30 * 24 * 60 * 60,
            },
        ],
    }

    beforeEach(() => {
        permissions = new Set(['contacts:read', 'contacts:write', 'contacts:manage'])
        apiGetContact.mockResolvedValue(merged)
        apiGetDeals.mockResolvedValue({ list: [], total: 0 })
        apiGetActivities.mockResolvedValue({ list: [], total: 0 })
        apiUnmergeContact.mockReset()
        apiUnmergeContact.mockResolvedValue({ ...contact, id: 'src-1' })
    })

    it('показывает донора слияния и зовёт unmerge по его id после подтверждения', async () => {
        renderCard()

        expect(await screen.findByText('Петров Пётр')).toBeInTheDocument()
        const buttons = await screen.findAllByRole('button', { name: /Отменить слияние/ })
        fireEvent.click(buttons[0])

        // Подтверждение: действие разрушительное, одним кликом не делается.
        const confirm = await screen.findAllByRole('button', { name: /Отменить слияние/ })
        fireEvent.click(confirm[confirm.length - 1])

        await waitFor(() =>
            expect(apiUnmergeContact).toHaveBeenCalledWith('src-1', { projectId: 'p1' }),
        )
    })

    it('без contacts:manage откат не запускается (шлюз требует это право)', async () => {
        permissions = new Set(['contacts:read', 'contacts:write', 'contacts:delete'])

        renderCard()

        const button = await screen.findByRole('button', { name: /Отменить слияние/ })
        expect(button.className).toContain('cursor-not-allowed')
        fireEvent.click(button)

        // Ни диалога подтверждения, ни запроса: гейт FE — UX, сервер всё равно откажет.
        expect(screen.getAllByRole('button', { name: /Отменить слияние/ })).toHaveLength(1)
        expect(apiUnmergeContact).not.toHaveBeenCalled()
    })

    it('без слияний блока в карточке нет', async () => {
        apiGetContact.mockResolvedValue(contact)

        renderCard()

        await waitFor(() => expect(apiGetContact).toHaveBeenCalled())
        expect(screen.queryByText('Слитые контакты')).not.toBeInTheDocument()
    })
})
