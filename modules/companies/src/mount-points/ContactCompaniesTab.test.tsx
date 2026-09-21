import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'

const apiGetContact = vi.fn()
const navigate = vi.fn()
let canReadCompanies = true

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useNavigate: () => navigate }
})
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'proj-1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: (subject: string, action: string) =>
        subject === 'companies' && action === 'read' ? canReadCompanies : false,
}))
vi.mock('@/utils/hooks/useCompanyNames', () => ({
    default: () => ({
        companyName: (id: string) => (id === 'c1' ? 'ООО Ромашка' : undefined),
    }),
}))
vi.mock('@/services/CrmService', () => ({
    apiGetContact: (...a: unknown[]) => apiGetContact(...a),
}))

const { default: ContactCompaniesTab } = await import('./ContactCompaniesTab')

describe('ContactCompaniesTab', () => {
    beforeEach(() => {
        canReadCompanies = true
        navigate.mockReset()
        apiGetContact.mockReset().mockResolvedValue({
            id: 'ct1',
            firstName: 'Иван',
            lastName: 'Петров',
            companyIds: ['c1', 'c2'],
            createdAt: 0,
            updatedAt: 0,
        })
    })

    it('без права companies:read — заглушка', () => {
        canReadCompanies = false
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter>
                    <ContactCompaniesTab contactId="ct1" />
                </MemoryRouter>
            </SWRConfig>,
        )
        expect(screen.getByText('Нет доступа к компаниям')).toBeInTheDocument()
    })

    it('показывает связанные компании и переходит в карточку', async () => {
        const user = userEvent.setup()
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter>
                    <ContactCompaniesTab contactId="ct1" />
                </MemoryRouter>
            </SWRConfig>,
        )
        expect(await screen.findByText('ООО Ромашка')).toBeInTheDocument()
        await user.click(screen.getByText('ООО Ромашка'))
        expect(navigate).toHaveBeenCalledWith('/companies/c1')
    })

    it('пустой список связей', async () => {
        apiGetContact.mockResolvedValue({
            id: 'ct1',
            firstName: 'Иван',
            lastName: 'Петров',
            createdAt: 0,
            updatedAt: 0,
        })
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter>
                    <ContactCompaniesTab contactId="ct1" />
                </MemoryRouter>
            </SWRConfig>,
        )
        expect(await screen.findByText('Нет связанных компаний')).toBeInTheDocument()
    })
})
