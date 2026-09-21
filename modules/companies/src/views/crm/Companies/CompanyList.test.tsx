import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'

const apiGetCompanies = vi.fn()
const apiGetMembers = vi.fn()
const apiCreateCompany = vi.fn()
const apiExportCompanies = vi.fn()
const toastPush = vi.fn()
const navigate = vi.fn()

let projectId: string | null = 'proj-1'
let permissions = new Set(['companies:read', 'companies:write', 'companies:export', 'companies:import'])

vi.mock('@/services/CrmService', () => ({
    apiGetCompanies: (...a: unknown[]) => apiGetCompanies(...a),
    apiGetMembers: (...a: unknown[]) => apiGetMembers(...a),
    apiCreateCompany: (...a: unknown[]) => apiCreateCompany(...a),
    apiFindCompanyDuplicates: vi.fn(async () => ({ candidates: [] })),
    apiDeleteCompany: vi.fn(),
    apiRestoreCompany: vi.fn(),
    apiExportCompanies: (...a: unknown[]) => apiExportCompanies(...a),
}))
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => projectId }))
vi.mock('@/utils/hooks/useDepartmentOptions', () => ({
    default: () => ({ options: [], unavailable: false }),
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => permissions.has(`${subject}:${action}`),
}))
vi.mock('@/store/authStore', () => ({
    useSessionUser: (selector: (s: { user: { userId: string } }) => unknown) =>
        selector({ user: { userId: 'u1' } }),
}))
vi.mock('@/components/template/EntityCreateDrawer', () => ({ default: () => null }))
vi.mock('@/components/ui/toast', () => ({ default: { push: (...a: unknown[]) => toastPush(...a) } }))
vi.mock('@/components/ui/Tooltip', () => ({
    default: ({ title, children }: { title: ReactNode; children: ReactNode }) => (
        <span title={typeof title === 'string' ? title : undefined}>{children}</span>
    ),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useNavigate: () => navigate }
})

const { default: CompanyList } = await import('./CompanyList')

const renderList = () =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={['/companies']}>
                <CompanyList />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('CompanyList — состояния экрана', () => {
    beforeEach(() => {
        projectId = 'proj-1'
        permissions = new Set(['companies:read', 'companies:write', 'companies:export', 'companies:import'])
        navigate.mockReset()
        toastPush.mockReset()
        apiCreateCompany.mockReset().mockResolvedValue({ id: 'new', name: 'Новая' })
        apiExportCompanies.mockReset().mockResolvedValue({
            blob: new Blob(['name\n'], { type: 'text/csv' }),
            filename: 'companies.csv',
            count: 1,
            truncated: false,
        })
        URL.createObjectURL = vi.fn(() => 'blob:stub')
        URL.revokeObjectURL = vi.fn()
        apiGetCompanies.mockReset().mockResolvedValue({ list: [], total: 0 })
        apiGetMembers.mockReset().mockResolvedValue([])
    })

    it('без companies:read показывает заглушку доступа', () => {
        permissions = new Set()
        renderList()
        expect(screen.getByText('Раздел недоступен')).toBeInTheDocument()
    })

    it('без выбранного проекта просит выбрать проект', () => {
        projectId = null
        renderList()
        expect(screen.getByText('Проект не выбран')).toBeInTheDocument()
    })

    it('пустой список — CTA создать или импортировать', async () => {
        renderList()
        expect(await screen.findByText('Компаний ещё нет')).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: 'Создать компанию' }).length).toBeGreaterThan(0)
    })

    it('ошибка загрузки — retry', async () => {
        apiGetCompanies.mockRejectedValueOnce(new Error('fail')).mockResolvedValue({
            list: [{ id: 'c1', name: 'ООО Тест', createdAt: 0, updatedAt: 0 }],
            total: 1,
        })
        renderList()
        expect(await screen.findByText('Не удалось загрузить список компаний')).toBeInTheDocument()
        await userEvent.setup().click(screen.getByRole('button', { name: 'Повторить' }))
        expect(await screen.findByText('ООО Тест')).toBeInTheDocument()
    })

    it('фильтр без результатов предлагает сброс', async () => {
        apiGetCompanies.mockImplementation((params: { query?: string }) =>
            Promise.resolve(
                params.query
                    ? { list: [], total: 0 }
                    : {
                          list: [{ id: 'c1', name: 'ООО Тест', createdAt: 0, updatedAt: 0 }],
                          total: 1,
                      },
            ),
        )
        const user = userEvent.setup()
        renderList()
        await screen.findByText('ООО Тест')
        await user.type(screen.getByPlaceholderText(/Поиск по названию/), 'zzz')
        expect(await screen.findByText('Ничего не найдено')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
        await waitFor(() =>
            expect(apiGetCompanies).toHaveBeenCalledWith(
                expect.objectContaining({ query: '', projectId: 'proj-1' }),
            ),
        )
    }, 15000)

    it('hiddenByPolicy — предупреждение о скрытых компаниях', async () => {
        apiGetCompanies.mockResolvedValue({
            list: [{ id: 'c1', name: 'Видимая', createdAt: 0, updatedAt: 0 }],
            total: 1,
            hiddenByPolicy: 5,
        })
        renderList()
        expect(await screen.findByText(/Ещё 5 компаний скрыто/)).toBeInTheDocument()
    })

    it('loading — таблица в состоянии загрузки', async () => {
        apiGetCompanies.mockImplementation(() => new Promise(() => {}))
        renderList()
        expect(screen.getByText('Компании')).toBeInTheDocument()
        expect(screen.queryByText('Компаний ещё нет')).not.toBeInTheDocument()
        await waitFor(() =>
            expect(apiGetCompanies).toHaveBeenCalledWith(
                expect.objectContaining({ projectId: 'proj-1' }),
            ),
        )
    })

    it('с данными — строки таблицы и переход в карточку', async () => {
        apiGetCompanies.mockResolvedValue({
            list: [
                { id: 'c1', name: 'ООО Альфа', createdAt: 0, updatedAt: 0 },
                { id: 'c2', name: 'ООО Бета', createdAt: 0, updatedAt: 0 },
            ],
            total: 2,
        })
        const user = userEvent.setup()
        renderList()
        expect(await screen.findByText('ООО Альфа')).toBeInTheDocument()
        expect(screen.getByText('ООО Бета')).toBeInTheDocument()
        await user.click(screen.getByText('ООО Альфа'))
        expect(navigate).toHaveBeenCalledWith('/companies/c1')
    })

    it('создание компании через drawer', async () => {
        const user = userEvent.setup()
        renderList()
        await user.click(within(screen.getByTitle('Создать компанию')).getByRole('button'))
        expect(screen.getByPlaceholderText('Введите название компании')).toBeInTheDocument()
        await user.type(screen.getByPlaceholderText('Введите название компании'), 'ООО Новая')
        await user.click(screen.getByRole('button', { name: 'Создать' }))
        expect(apiCreateCompany).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'ООО Новая' }),
            { projectId: 'proj-1' },
        )
        expect(toastPush).toHaveBeenCalledWith('Компания создана')
    })

    it('bulk merge — две выбранные компании ведут на /companies/merge', async () => {
        permissions = new Set([
            'companies:read',
            'companies:write',
            'companies:manage',
        ])
        apiGetCompanies.mockResolvedValue({
            list: [
                { id: 'c1', name: 'ООО Альфа', createdAt: 0, updatedAt: 0 },
                { id: 'c2', name: 'ООО Бета', createdAt: 0, updatedAt: 0 },
            ],
            total: 2,
        })
        const user = userEvent.setup()
        const { container } = renderList()
        await screen.findByText('ООО Альфа')
        const checkboxes = container.querySelectorAll('input[type="checkbox"]')
        await user.click(checkboxes[1]!)
        await user.click(checkboxes[2]!)
        await user.click(within(screen.getByTitle('Объединить дубли (выбрано 2)')).getByRole('button'))
        expect(navigate).toHaveBeenCalledWith('/companies/merge?master=c1&loser=c2')
    })
})
