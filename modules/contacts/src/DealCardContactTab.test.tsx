import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { Contact, Deal } from '@/@types/crm'

const apiGetContact = vi.fn()
const apiGetDeal = vi.fn()
const navigate = vi.fn()

let permissions = new Set<string>()

vi.mock('react-router', () => ({
    useNavigate: () => navigate,
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetContact: (...a: unknown[]) => apiGetContact(...a),
    apiGetDeal: (...a: unknown[]) => apiGetDeal(...a),
}))

import DealCardContactTab from './DealCardContactTab'

const contact: Contact = {
    id: 'c1',
    firstName: 'Иван',
    lastName: 'Иванов',
    phone: '+70000000000',
    email: 'ivan@example.com',
    position: 'CEO',
    createdAt: 0,
    updatedAt: 0,
}

const deal: Deal = {
    id: 'd1',
    name: 'Сделка',
    amount: 1,
    currency: 'RUB',
    pipelineId: 'pl1',
    stageId: 's1',
    stageName: 'Новая',
    contactId: 'c1',
    createdAt: 0,
    updatedAt: 0,
}

const renderTab = (props: { dealId?: string; contactId?: string } = { dealId: 'd1' }) =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <DealCardContactTab {...props} />
        </SWRConfig>,
    )

describe('DealCardContactTab', () => {
    beforeEach(() => {
        permissions = new Set(['contacts:read'])
        apiGetContact.mockReset()
        apiGetDeal.mockReset()
        navigate.mockClear()
        apiGetContact.mockResolvedValue(contact)
        apiGetDeal.mockResolvedValue(deal)
    })

    it('loading — контакт ещё не показан', () => {
        apiGetContact.mockImplementation(() => new Promise(() => {}))
        renderTab({ contactId: 'c1' })
        expect(screen.getByText('Контакт сделки')).toBeInTheDocument()
        expect(screen.queryByText('Иван Иванов')).not.toBeInTheDocument()
        expect(screen.queryByText(/Не удалось загрузить контакт/)).not.toBeInTheDocument()
    })

    it('без contacts:read — заглушка', () => {
        permissions = new Set()

        renderTab({ contactId: 'c1' })

        expect(screen.getByText(/Контакт недоступен/)).toBeInTheDocument()
        expect(apiGetContact).not.toHaveBeenCalled()
    })

    it('без contactId — «Сделка без связанного контакта»', async () => {
        apiGetDeal.mockResolvedValue({ ...deal, contactId: undefined })

        renderTab({ dealId: 'd1' })

        expect(await screen.findByText(/Сделка без связанного контакта/)).toBeInTheDocument()
        expect(apiGetDeal).toHaveBeenCalled()
        expect(apiGetContact).not.toHaveBeenCalled()
    })

    it('contactId напрямую — грузит контакт без deal', async () => {
        renderTab({ contactId: 'c1' })

        await waitFor(() =>
            expect(apiGetContact).toHaveBeenCalledWith('c1', { projectId: 'p1' }),
        )
        expect(apiGetDeal).not.toHaveBeenCalled()
        expect(await screen.findByText('Иван Иванов')).toBeInTheDocument()
    })

    it('«Открыть карточку» ведёт на /contacts/:id', async () => {
        renderTab({ contactId: 'c1' })
        await screen.findByText('Иван Иванов')

        fireEvent.click(screen.getByRole('button', { name: 'Открыть карточку' }))
        expect(navigate).toHaveBeenCalledWith('/contacts/c1')
    })

    it('ошибка загрузки контакта', async () => {
        apiGetContact.mockRejectedValue(new Error('404'))

        renderTab({ contactId: 'c1' })

        expect(await screen.findByText(/Не удалось загрузить контакт/)).toBeInTheDocument()
    })
})
