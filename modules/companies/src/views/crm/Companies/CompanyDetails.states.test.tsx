import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'

const apiGetCompany = vi.fn()
const apiGetCompanyCard = vi.fn()
const apiGetMembers = vi.fn()
const apiDeleteCompany = vi.fn()
const apiRestoreCompany = vi.fn()
const apiFindCompanyDuplicates = vi.fn()
const toastPush = vi.fn()
const navigate = vi.fn()

let permissions = new Set([
    'companies:read',
    'companies:write',
    'companies:delete',
    'companies:manage',
])

vi.mock('@/services/CrmService', () => ({
    apiGetCompany: (...args: unknown[]) => apiGetCompany(...args),
    apiGetCompanyCard: (...args: unknown[]) => apiGetCompanyCard(...args),
    apiGetMembers: (...args: unknown[]) => apiGetMembers(...args),
    apiDeleteCompany: (...args: unknown[]) => apiDeleteCompany(...args),
    apiRestoreCompany: (...args: unknown[]) => apiRestoreCompany(...args),
    apiFindCompanyDuplicates: (...args: unknown[]) => apiFindCompanyDuplicates(...args),
    apiReassignCompanyOwner: vi.fn(),
    apiGetContacts: vi.fn(),
    apiGetDeals: vi.fn(),
    apiGetOrders: vi.fn(),
    apiGetActivities: vi.fn(),
    apiGetCompanyHistory: vi.fn(),
}))

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'proj-1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/utils/hooks/useDocumentsModuleEnabled', () => ({ default: () => false }))
vi.mock('@/components/shared/documents/DocumentsTab', () => ({ default: () => null }))
vi.mock('@/components/template/EntityCreateDrawer', () => ({ default: () => null }))
vi.mock('@/components/ui/toast', () => ({ default: { push: (...a: unknown[]) => toastPush(...a) } }))
vi.mock('@fairflow/shared-ui', () => ({
    CompanyActivitiesWidget: () => null,
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useParams: () => ({ id: 'c1' }),
        useNavigate: () => navigate,
    }
})

const { default: CompanyDetails } = await import('./CompanyDetails')

const company = {
    id: 'c1',
    name: 'ООО Ромашка',
    inn: '7700000001',
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
}

const card = { company, stats: {} }

const renderDetails = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/companies/c1']}>
                <CompanyDetails />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('CompanyDetails — экранные состояния', () => {
    beforeEach(() => {
        permissions = new Set([
            'companies:read',
            'companies:write',
            'companies:delete',
            'companies:manage',
        ])
        navigate.mockReset()
        toastPush.mockReset()
        apiGetCompany.mockReset().mockResolvedValue(company)
        apiGetCompanyCard.mockReset().mockResolvedValue(card)
        apiGetMembers.mockReset().mockResolvedValue([])
        apiDeleteCompany.mockReset().mockResolvedValue({ ok: true })
        apiRestoreCompany.mockReset().mockResolvedValue(company)
        apiFindCompanyDuplicates.mockReset().mockResolvedValue({ candidates: [] })
    })

    it('без companies:read — заглушка «Раздел недоступен»', () => {
        permissions = new Set()
        renderDetails()
        expect(screen.getByText('Раздел недоступен')).toBeInTheDocument()
    })

    it('loading — карточка ещё не показана', () => {
        apiGetCompany.mockImplementation(() => new Promise(() => {}))
        renderDetails()
        expect(screen.queryByText('ООО Ромашка')).not.toBeInTheDocument()
        expect(screen.queryByText('Компания не найдена')).not.toBeInTheDocument()
    })

    it('ошибка загрузки — «Компания не найдена» и возврат к списку', async () => {
        apiGetCompany.mockRejectedValue(new Error('404'))
        const user = userEvent.setup()
        renderDetails()
        expect(await screen.findByText('Компания не найдена')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Вернуться к списку' }))
        expect(navigate).toHaveBeenCalledWith('/companies')
    })

    it('компания в корзине — баннер и восстановление', async () => {
        apiGetCompany.mockResolvedValue({ ...company, deletedAt: 1_700_000_100 })
        const user = userEvent.setup()
        renderDetails()
        expect(await screen.findByText(/Компания находится в корзине/)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Восстановить' }))
        expect(apiRestoreCompany).toHaveBeenCalledWith(
            'c1',
            undefined,
            expect.objectContaining({ projectId: 'proj-1' }),
        )
        expect(toastPush).toHaveBeenCalledWith('Компания восстановлена')
    })

    it('удаление — подтверждение и переход к списку', async () => {
        const user = userEvent.setup()
        renderDetails()
        expect(await screen.findByText('ООО Ромашка')).toBeInTheDocument()
        await user.click(screen.getByLabelText('Удалить'))
        expect(screen.getByText('Удалить компанию?')).toBeInTheDocument()
        const confirmButtons = screen.getAllByRole('button', { name: 'Удалить' })
        await user.click(confirmButtons[confirmButtons.length - 1]!)
        expect(apiDeleteCompany).toHaveBeenCalledWith('c1', { projectId: 'proj-1' })
        expect(toastPush).toHaveBeenCalledWith('Компания перемещена в корзину')
        expect(navigate).toHaveBeenCalledWith('/companies')
    })

    it('merge: дубли в корзине — ссылка «Открыть корзину»', async () => {
        apiFindCompanyDuplicates.mockResolvedValue({
            candidates: [
                { id: 'c2', name: 'Дубль', deleted: true },
                { id: 'c1', name: 'ООО Ромашка' },
            ],
        })
        const user = userEvent.setup()
        renderDetails()
        expect(await screen.findByText('ООО Ромашка')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Объединить дубль' }))
        expect(await screen.findByText(/в корзине/)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Открыть корзину' }))
        expect(navigate).toHaveBeenCalledWith('/companies/trash')
    })
})
