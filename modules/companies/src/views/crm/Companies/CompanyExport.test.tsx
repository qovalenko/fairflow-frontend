import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'

/**
 * Выгрузка компаний (TODO-158, FR-COMPANIES-240 / FR-MCOM-17).
 *
 * Регресс, который пинуется: серверная ручка `GET /v1/companies/export` есть на
 * gateway (листает домен страницами по 100 под той же visibility/ABAC, что и
 * список, и помечает усечение заголовком `X-Export-Truncated`), но фронт её не
 * вызывал вовсе — CSV собирался в браузере из ВЫДЕЛЕННЫХ строк текущей страницы.
 * То есть «экспорт» физически не мог отдать больше pageSize записей, а серверная
 * пагинация и заголовки усечения не имели ни одного читателя.
 *
 * Держим оба конца: (1) кнопка зовёт сервер и передаёт ровно те же
 * query/фильтры/сортировку, что и таблица (файл обязан совпадать с видимым
 * набором и по составу, и по порядку); (2) признак усечения доезжает до
 * пользователя, а не проглатывается.
 */
const apiExportCompanies = vi.fn()
const toastPush = vi.fn()

vi.mock('@/services/CrmService', () => ({
    apiGetCompanies: vi.fn(async () => ({
        list: [{ id: 'c1', name: 'ООО Ромашка', createdAt: 1, updatedAt: 1 }],
        total: 1,
    })),
    apiGetMembers: vi.fn(async () => []),
    apiExportCompanies: (...args: unknown[]) => apiExportCompanies(...args),
    apiCreateCompany: vi.fn(),
    apiFindCompanyDuplicates: vi.fn(async () => ({ candidates: [] })),
    apiDeleteCompany: vi.fn(),
    apiRestoreCompany: vi.fn(),
}))
vi.mock('@/components/ui/toast', () => ({ default: { push: (...a: unknown[]) => toastPush(...a) } }))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'proj-1' }))
vi.mock('@/utils/hooks/useDepartmentOptions', () => ({
    default: () => ({ options: [], unavailable: false }),
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string) => subject === 'companies',
}))
vi.mock('@/store/authStore', () => ({
    useSessionUser: (selector: (s: { user: { userId: string } }) => unknown) =>
        selector({ user: { userId: 'u1' } }),
}))
vi.mock('@/components/template/EntityCreateDrawer', () => ({ default: () => null }))
vi.mock('@/components/ui/Tooltip', () => ({
    default: ({ title, children }: { title: ReactNode; children: ReactNode }) => (
        <span title={typeof title === 'string' ? title : undefined}>{children}</span>
    ),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useNavigate: () => vi.fn() }
})

const { default: CompanyList } = await import('./CompanyList')

const clickExport = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText('ООО Ромашка')
    const trigger = screen.getByTitle(/Выгрузить CSV/)
    await user.click(within(trigger).getByRole('button'))
}

describe('[fe-companies] TODO-158: выгрузка идёт на сервер', () => {
    beforeEach(() => {
        toastPush.mockReset()
        apiExportCompanies.mockReset().mockResolvedValue({
            blob: new Blob(['name\n'], { type: 'text/csv' }),
            filename: 'companies-2026-08-18.csv',
            count: 250,
            truncated: false,
        })
        // jsdom не реализует object-URL — экспорт только скачивает файл, поэтому
        // достаточно заглушек.
        URL.createObjectURL = vi.fn(() => 'blob:stub')
        URL.revokeObjectURL = vi.fn()
    })

    it('зовёт GET /v1/companies/export с текущими фильтрами и сортировкой', async () => {
        const user = userEvent.setup()
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter initialEntries={['/companies']}>
                    <CompanyList />
                </MemoryRouter>
            </SWRConfig>,
        )
        await screen.findByText('ООО Ромашка')

        const search = screen.getByPlaceholderText(/Поиск по названию/)
        await user.type(search, 'ромаш')
        await clickExport(user)

        expect(apiExportCompanies).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'proj-1', format: 'csv', query: 'ромаш' }),
        )
        expect(toastPush).toHaveBeenCalledWith('Экспортировано: 250')
    }, 15000)

    it('предупреждает, когда gateway пометил выгрузку усечённой', async () => {
        apiExportCompanies.mockResolvedValue({
            blob: new Blob(['name\n'], { type: 'text/csv' }),
            filename: 'companies-2026-08-18.csv',
            count: 10000,
            truncated: true,
        })
        const user = userEvent.setup()
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <MemoryRouter initialEntries={['/companies']}>
                    <CompanyList />
                </MemoryRouter>
            </SWRConfig>,
        )
        await screen.findByText('ООО Ромашка')

        await clickExport(user)

        expect(toastPush).toHaveBeenCalledWith(expect.stringContaining('файл неполный'))
    }, 15000)
})
