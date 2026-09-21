import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { Contact } from '@/@types/crm'
import type { ContactLinks } from '@/services/CrmService'

const apiGetContact = vi.fn()
const apiGetContactLinks = vi.fn()
const apiMergeContacts = vi.fn()
const navigate = vi.fn()
let keySeq = 0

let permissions = new Set<string>()
let searchParams = new URLSearchParams('source=c-src&target=c-tgt')

vi.mock('react-router', () => ({
    useNavigate: () => navigate,
    useSearchParams: () => [searchParams],
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
const notifyError = vi.fn()
vi.mock('./contactsUi', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    notifyError: (m: string) => notifyError(m),
    notifySuccess: vi.fn(),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetContact: (...a: unknown[]) => apiGetContact(...a),
    apiGetContactLinks: (...a: unknown[]) => apiGetContactLinks(...a),
    apiMergeContacts: (...a: unknown[]) => apiMergeContacts(...a),
    newIdempotencyKey: () => `key-${++keySeq}`,
}))

import ContactMerge from './ContactMerge'

const contact = (id: string, over: Partial<Contact> = {}): Contact => ({
    id,
    firstName: id === 'c-src' ? 'Пётр' : 'Иван',
    lastName: id === 'c-src' ? 'Петров' : 'Иванов',
    phone: '+70000000001',
    email: `${id}@example.com`,
    createdAt: 0,
    updatedAt: 0,
    ...over,
})

const links = (): ContactLinks => ({
    deals: [{ id: 'd1', title: 'Сделка' }],
    orders: [],
    activities: [],
    documents: [],
    companies: [],
})

const renderMerge = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <ContactMerge />
        </SWRConfig>,
    )

describe('ContactMerge — гейты и параметры (TODO-370, FR-MCON-10)', () => {
    beforeEach(() => {
        permissions = new Set(['contacts:read', 'contacts:manage'])
        searchParams = new URLSearchParams('source=c-src&target=c-tgt')
        apiGetContact.mockImplementation((id: string) => Promise.resolve(contact(id)))
        apiGetContactLinks.mockResolvedValue(links())
        apiMergeContacts.mockReset()
        keySeq = 0
        notifyError.mockClear()
        navigate.mockClear()
    })

    it('без contacts:read показывает экран «Слияние недоступно» и не грузит карточки', () => {
        permissions = new Set(['contacts:manage'])

        renderMerge()

        expect(screen.getByText('Слияние недоступно')).toBeInTheDocument()
        expect(apiGetContact).not.toHaveBeenCalled()
    })

    it('без contacts:manage показывает fallback «Запросите слияние у руководителя»', () => {
        permissions = new Set(['contacts:read'])

        renderMerge()

        expect(screen.getByText(/Слияние требует роли Manager/)).toBeInTheDocument()
        expect(screen.getByText(/Запросите слияние у руководителя/)).toBeInTheDocument()
        // SWR-ключи с canRead уже могли дернуть GET — UI всё равно не даёт слить.
        expect(screen.queryByRole('button', { name: 'Слить' })).not.toBeInTheDocument()
    })

    it('без двух разных id показывает «Не выбраны два разных контакта»', () => {
        searchParams = new URLSearchParams('source=c1&target=c1')

        renderMerge()

        expect(screen.getByText(/Не выбраны два разных контакта/)).toBeInTheDocument()
    })
})

describe('ContactMerge — загрузка, ошибка, слияние', () => {
    beforeEach(() => {
        permissions = new Set(['contacts:read', 'contacts:manage'])
        searchParams = new URLSearchParams('source=c-src&target=c-tgt')
        apiGetContact.mockImplementation((id: string) => Promise.resolve(contact(id)))
        apiGetContactLinks.mockResolvedValue(links())
        apiMergeContacts.mockResolvedValue(contact('c-tgt'))
        keySeq = 0
        notifyError.mockClear()
        navigate.mockClear()
    })

    it('loading — карточки ещё не показаны', () => {
        apiGetContact.mockImplementation(() => new Promise(() => {}))
        renderMerge()
        expect(screen.getByText('Слияние дублей')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Слить' })).not.toBeInTheDocument()
        expect(screen.queryByText(/Один из контактов недоступен/)).not.toBeInTheDocument()
    })

    it('после загрузки показывает оба контакта и кнопку «Слить»', async () => {
        renderMerge()

        expect(await screen.findByText('Пётр Петров')).toBeInTheDocument()
        expect(screen.getByText('Иван Иванов')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Слить' })).toBeInTheDocument()
    })

    it('ошибка загрузки — экран с «Повторить»', async () => {
        apiGetContact.mockRejectedValueOnce(new Error('404'))

        renderMerge()

        expect(await screen.findByText(/Один из контактов недоступен/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('«Слить» вызывает apiMergeContacts и переходит в карточку master', async () => {
        renderMerge()
        await screen.findByText('Иван Иванов')

        fireEvent.click(screen.getByRole('button', { name: 'Слить' }))

        await waitFor(() => expect(apiMergeContacts).toHaveBeenCalledTimes(1))
        expect(apiMergeContacts.mock.calls[0][0]).toMatchObject({
            sourceId: 'c-src',
            targetId: 'c-tgt',
        })
        expect(apiMergeContacts.mock.calls[0][2]).toBeTruthy()
        await waitFor(() => expect(navigate).toHaveBeenCalledWith('/contacts/c-tgt'))
    })

    it('TODO-176: повтор «Слить» после ошибки шлёт тот же idempotency-ключ', async () => {
        apiMergeContacts.mockRejectedValueOnce(new Error('timeout'))

        renderMerge()
        await screen.findByText('Иван Иванов')

        fireEvent.click(screen.getByRole('button', { name: 'Слить' }))
        await waitFor(() => expect(apiMergeContacts).toHaveBeenCalledTimes(1))

        fireEvent.click(screen.getByRole('button', { name: 'Слить' }))
        await waitFor(() => expect(apiMergeContacts).toHaveBeenCalledTimes(2))

        const firstKey = apiMergeContacts.mock.calls[0][2]
        expect(apiMergeContacts.mock.calls[1][2]).toBe(firstKey)
    })
})
