import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SWRConfig } from 'swr'
import type { Contact } from '@/@types/crm'

const apiGetCompanyContacts = vi.fn()
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
    apiGetCompanyContacts: (...a: unknown[]) => apiGetCompanyContacts(...a),
}))

import CompanyCardContactsTab from './CompanyCardContactsTab'

const contact = (id: string): Contact => ({
    id,
    firstName: 'Иван',
    lastName: 'Иванов',
    phone: '+70000000000',
    email: `${id}@example.com`,
    companyLinks: [{ companyId: 'co1', role: 'CEO', isPrimary: true }],
    createdAt: 0,
    updatedAt: 0,
})

const renderTab = (companyId = 'co1') =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <CompanyCardContactsTab companyId={companyId} />
        </SWRConfig>,
    )

describe('CompanyCardContactsTab', () => {
    beforeEach(() => {
        permissions = new Set(['contacts:read'])
        apiGetCompanyContacts.mockReset()
        navigate.mockClear()
    })

    it('loading — список ещё не показан', () => {
        apiGetCompanyContacts.mockImplementation(() => new Promise(() => {}))
        renderTab()
        expect(screen.getByText('Контакты компании')).toBeInTheDocument()
        expect(screen.queryByText('Нет связанных контактов.')).not.toBeInTheDocument()
        expect(screen.queryByText(/Не удалось загрузить контакты/)).not.toBeInTheDocument()
    })

    it('без contacts:read показывает заглушку и не грузит список', () => {
        permissions = new Set()

        renderTab()

        expect(screen.getByText(/Контакты недоступны/)).toBeInTheDocument()
        expect(apiGetCompanyContacts).not.toHaveBeenCalled()
    })

    it('пустой список — «Нет связанных контактов»', async () => {
        apiGetCompanyContacts.mockResolvedValue({ list: [], total: 0 })

        renderTab()

        expect(await screen.findByText('Нет связанных контактов.')).toBeInTheDocument()
    })

    it('ошибка API — сообщение об ошибке', async () => {
        apiGetCompanyContacts.mockRejectedValue(new Error('500'))

        renderTab()

        expect(await screen.findByText(/Не удалось загрузить контакты/)).toBeInTheDocument()
    })

    it('рендерит контакты с ролью и переход в карточку', async () => {
        apiGetCompanyContacts.mockResolvedValue({
            list: [contact('c1')],
            total: 1,
            truncated: true,
        })

        renderTab()

        expect(await screen.findByText('Иван Иванов')).toBeInTheDocument()
        expect(screen.getByText(/CEO · основной/)).toBeInTheDocument()
        expect(screen.getByText(/Показана часть списка/)).toBeInTheDocument()

        fireEvent.click(screen.getByText('Иван Иванов'))
        expect(navigate).toHaveBeenCalledWith('/contacts/c1')
    })

    it('«Все контакты» ведёт в список', async () => {
        apiGetCompanyContacts.mockResolvedValue({ list: [contact('c1')], total: 1 })

        renderTab()
        await screen.findByText('Иван Иванов')

        fireEvent.click(screen.getByRole('button', { name: 'Все контакты' }))
        expect(navigate).toHaveBeenCalledWith('/contacts')
    })
})
