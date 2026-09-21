import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'

const apiGetOrder = vi.fn()
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
    apiGetOrder: (...a: unknown[]) => apiGetOrder(...a),
}))

const { default: OrderCompanyTab } = await import('./OrderCompanyTab')

describe('OrderCompanyTab', () => {
    beforeEach(() => {
        canReadCompanies = true
        navigate.mockReset()
        apiGetOrder.mockReset().mockResolvedValue({
            id: 'o1',
            number: 'ORD-1',
            companyId: 'c1',
            companyName: 'ООО Ромашка',
        })
    })

    it('без права companies:read — заглушка', () => {
        canReadCompanies = false
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter>
                    <OrderCompanyTab orderId="o1" />
                </MemoryRouter>
            </SWRConfig>,
        )
        expect(screen.getByText('Нет доступа к компаниям')).toBeInTheDocument()
    })

    it('показывает компанию продажи', async () => {
        const user = userEvent.setup()
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter>
                    <OrderCompanyTab orderId="o1" />
                </MemoryRouter>
            </SWRConfig>,
        )
        expect(await screen.findByText('ООО Ромашка')).toBeInTheDocument()
        await user.click(screen.getByText('ООО Ромашка'))
        expect(navigate).toHaveBeenCalledWith('/companies/c1')
    })

    it('без companyId — empty-state', async () => {
        apiGetOrder.mockResolvedValue({ id: 'o1', number: 'ORD-1' })
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter>
                    <OrderCompanyTab orderId="o1" />
                </MemoryRouter>
            </SWRConfig>,
        )
        expect(await screen.findByText('Компания не указана')).toBeInTheDocument()
    })
})
