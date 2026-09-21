import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'

/**
 * Гейт слияния компаний (TODO-110 / TODO-153, FR-MCOM-8).
 *
 * Регресс, который пинуется, — «домен умеет, а до пользователя не доходит» в
 * чистом виде: gateway гейтит `POST /companies/merge` и `/companies/merge/preview`
 * ключом `companies:manage` (@RequirePermission, см. сторожевой тест
 * backend/gateway/src/bff/v1-data-bff.companies.spec.ts), а фронт спрашивал
 * `companies:execute`. Действия `execute` у субъекта `companies` в каталоге прав
 * нет (backend/shared/src/module-registry.ts: actions = read|write|delete|manage|
 * export|import), поэтому в проекцию allowed[] такой ключ не попадает НИКОГДА —
 * fail-closed usePermission отдавал false всем ролям, включая владельца проекта,
 * и кнопка «Объединить дубль» с экраном /companies/merge были скрыты у всех.
 *
 * Инвариант, который держит этот тест: ни один гейт модуля не спрашивает
 * `companies:execute`, а merge-UI появляется ровно при `companies:manage` —
 * симметрично сторожевому тесту gateway.
 */
const canMock = vi.fn<(subject: string, action: string) => boolean>()

vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'proj-1' }))
vi.mock('@/utils/hooks/useDepartmentOptions', () => ({
    default: () => ({ options: [], unavailable: false }),
}))
vi.mock('@/utils/hooks/usePermission', () => ({ default: () => canMock }))
vi.mock('@/store/authStore', () => ({
    useSessionUser: (selector: (s: { user: { userId: string } }) => unknown) =>
        selector({ user: { userId: 'u1' } }),
}))
vi.mock('@/components/ui/toast', () => ({ default: { push: vi.fn() } }))
vi.mock('@/components/shared/documents/DocumentsTab', () => ({ default: () => null }))
vi.mock('@/components/template/EntityCreateDrawer', () => ({ default: () => null }))
vi.mock('@/components/ui/Tooltip', () => ({
    default: ({ title, children }: { title: ReactNode; children: ReactNode }) => (
        <span title={typeof title === 'string' ? title : undefined}>{children}</span>
    ),
}))

const company = {
    id: 'c1',
    name: 'ООО Ромашка',
    inn: '7700000001',
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_000,
}

vi.mock('@/services/CrmService', () => ({
    apiGetCompanies: vi.fn(async () => ({ list: [], total: 0 })),
    apiGetCompany: vi.fn(async () => company),
    apiGetCompanyCard: vi.fn(async () => ({ company, stats: {} })),
    apiGetMembers: vi.fn(async () => []),
    apiFindCompanyDuplicates: vi.fn(async () => ({ candidates: [] })),
    apiPreviewCompanyMerge: vi.fn(async () => ({ conflicts: [], relations: {} })),
    apiMergeCompanies: vi.fn(),
    apiCreateCompany: vi.fn(),
    apiDeleteCompany: vi.fn(),
    apiRestoreCompany: vi.fn(),
    apiReassignCompanyOwner: vi.fn(),
    apiExportCompanies: vi.fn(),
    apiGetContacts: vi.fn(),
    apiGetDeals: vi.fn(),
    apiGetOrders: vi.fn(),
    apiGetActivities: vi.fn(),
    apiGetCompanyHistory: vi.fn(),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useParams: () => ({ id: 'c1' }), useNavigate: () => vi.fn() }
})

const { default: CompanyList } = await import('./CompanyList')
const { default: CompanyDetails } = await import('./CompanyDetails')
const { default: CompanyMerge } = await import('./CompanyMerge')

const renderIn = (node: ReactNode, path = '/companies') =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
        </SWRConfig>,
    )

/** Ровно тот набор ключей, что проецирует PDP для роли-владельца проекта. */
const catalogueOnly = (subject: string, action: string) =>
    subject === 'companies' &&
    ['read', 'write', 'delete', 'manage', 'export', 'import'].includes(action)

describe('[fe-companies] TODO-110/153: merge гейтится ключом из каталога прав', () => {
    beforeEach(() => {
        canMock.mockReset()
    })

    it('ни один гейт модуля не спрашивает companies:execute', async () => {
        canMock.mockImplementation(catalogueOnly)

        renderIn(<CompanyList />)
        renderIn(<CompanyDetails />)
        renderIn(<CompanyMerge />, '/companies/merge?master=c1&loser=c2')
        await screen.findAllByText('ООО Ромашка')

        const asked = canMock.mock.calls.map(([subject, action]) => `${subject}:${action}`)
        expect(asked).not.toContain('companies:execute')
        expect(asked.filter((k) => k.startsWith('companies.merge'))).toEqual([])
        expect(asked).toContain('companies:manage')
    }, 15000)

    it('владельцу (есть companies:manage) merge-UI виден', async () => {
        canMock.mockImplementation(catalogueOnly)

        renderIn(<CompanyDetails />)

        expect(await screen.findByRole('button', { name: /Объединить дубль/ })).toBeInTheDocument()
    })

    it('роли без companies:manage экран слияния отдаёт заглушку', () => {
        canMock.mockImplementation((subject, action) => subject === 'companies' && action === 'read')

        renderIn(<CompanyMerge />, '/companies/merge?master=c1&loser=c2')

        expect(screen.getByText('Раздел недоступен')).toBeInTheDocument()
    })
})
