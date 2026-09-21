import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'

const apiGetDeal = vi.fn()
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
vi.mock('@/services/CrmService', () => ({
    apiGetDeal: (...a: unknown[]) => apiGetDeal(...a),
}))

const { default: DealCompanySidebar } = await import('./DealCompanySidebar')

describe('DealCompanySidebar', () => {
    beforeEach(() => {
        canReadCompanies = true
        navigate.mockReset()
        apiGetDeal.mockReset().mockResolvedValue({
            id: 'd1',
            name: 'Сделка',
            companyId: 'c1',
            companyName: 'ООО Ромашка',
        })
    })

    it('без права companies:read не рендерится', () => {
        canReadCompanies = false
        const { container } = render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter>
                    <DealCompanySidebar dealId="d1" />
                </MemoryRouter>
            </SWRConfig>,
        )
        expect(container.firstChild).toBeNull()
    })

    it('показывает компанию сделки и переходит в карточку', async () => {
        const user = userEvent.setup()
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter>
                    <DealCompanySidebar dealId="d1" />
                </MemoryRouter>
            </SWRConfig>,
        )
        expect(await screen.findByText('ООО Ромашка')).toBeInTheDocument()
        await user.click(screen.getByText('ООО Ромашка'))
        expect(navigate).toHaveBeenCalledWith('/companies/c1')
    })

    it('без companyId — «Компания не указана»', async () => {
        apiGetDeal.mockResolvedValue({ id: 'd1', name: 'Сделка' })
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter>
                    <DealCompanySidebar dealId="d1" />
                </MemoryRouter>
            </SWRConfig>,
        )
        expect(await screen.findByText('Компания не указана')).toBeInTheDocument()
    })
})
