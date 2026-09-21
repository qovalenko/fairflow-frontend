import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import Reports from './Reports'
import {
    apiListReports,
    apiGetReport,
    apiRunReport,
    apiDeleteReport,
} from '@/services/ReportsService'

const navigateMock = vi.hoisted(() => vi.fn())
const permissions = vi.hoisted(() => ({
    read: true,
    export: true,
    manage: true,
}))
const enabledModules = vi.hoisted(() => ({
    value: ['deals', 'contacts', 'activities', 'companies'],
}))
const visibilityScope = vi.hoisted(() => ({ level: 'all' as string }))

vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useNavigate: () => navigateMock }
})
vi.mock('@/services/ReportsService', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/services/ReportsService')>()
    return {
        ...actual,
        apiListReports: vi.fn(),
        apiGetReport: vi.fn(),
        apiRunReport: vi.fn(),
        apiDeleteReport: vi.fn(),
        apiExportReport: vi.fn(),
        downloadExport: vi.fn(),
    }
})
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => 'p1' }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) => {
        if (subject === 'reports' && action === 'read') return permissions.read
        if (subject === 'reports' && action === 'export') return permissions.export
        if (subject === 'reports' && action === 'manage') return permissions.manage
        return false
    },
}))
vi.mock('@/utils/hooks/usePermissionStatus', () => ({
    useVisibilityScope: () => visibilityScope,
}))
vi.mock('@/store/projectStore', () => ({
    useProjectStore: (selector: (s: unknown) => unknown) =>
        selector({ currentProject: { id: 'p1', enabledModules: enabledModules.value } }),
    getEnabledModules: () => enabledModules.value,
}))
vi.mock('@/store/themeStore', () => ({
    useThemeStore: (selector: (s: { mode: string }) => unknown) => selector({ mode: 'light' }),
}))
vi.mock('react-apexcharts', () => ({ default: () => <div data-testid="apex-chart" /> }))
vi.mock('@/components/ui/toast', () => ({ default: { push: vi.fn() } }))
vi.mock('./DrillDownPanel', () => ({
    default: ({ open }: { open: boolean }) =>
        open ? <div data-testid="drill-panel">drill</div> : null,
}))

const listMock = vi.mocked(apiListReports)
const getMock = vi.mocked(apiGetReport)
const runMock = vi.mocked(apiRunReport)
const deleteMock = vi.mocked(apiDeleteReport)

const builtin = (presetKey: string, id = `rep-${presetKey}`) => ({
    id,
    projectId: 'p1',
    name: `Отчёт ${presetKey}`,
    kind: 'builtin',
    presetKey,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
})

const custom = (id: string, name: string) => ({
    id,
    projectId: 'p1',
    name,
    kind: 'custom',
    visibility: 'personal' as const,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
})

const runResult = (overrides: Record<string, unknown> = {}) => ({
    reportId: 'rep-sales',
    reportName: 'По продажам',
    generatedAt: 1_700_000_000_000,
    cards: [{ key: 'total', label: 'Выручка', value: 1_500_000, isCurrency: true }],
    chart: {
        type: 'bar',
        categories: ['Янв', 'Фев'],
        series: [{ name: 'Сумма', data: [100, 200] }],
    },
    table: {
        columns: [{ key: 'stage', label: 'Стадия' }, { key: 'count', label: 'Кол-во', numeric: true }],
        rows: [{ stage: 'Won', count: 5 }],
    },
    drillable: true,
    primaryDimension: 'stage_id',
    ...overrides,
})

const renderReports = (route = '/reports') =>
    render(
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
            <MemoryRouter initialEntries={[route]}>
                <Reports />
            </MemoryRouter>
        </SWRConfig>,
    )

describe('Reports (SCR-REPORTS-MAIN)', () => {
    beforeEach(() => {
        navigateMock.mockReset()
        permissions.read = true
        permissions.export = true
        permissions.manage = true
        enabledModules.value = ['deals', 'contacts', 'activities', 'companies']
        visibilityScope.level = 'all'
        listMock.mockResolvedValue({
            list: [
                builtin('sales'),
                builtin('funnel'),
                builtin('clients'),
                builtin('activity'),
                builtin('sources'),
                builtin('by_managers'),
                custom('c1', 'Мой отчёт'),
            ],
            total: 7,
        } as never)
        runMock.mockResolvedValue(runResult() as never)
        getMock.mockResolvedValue(custom('c-open', 'Открытый custom') as never)
        deleteMock.mockResolvedValue(undefined as never)
        window.confirm = vi.fn(() => true)
    })

    it('ST-10: без reports:read — NoPermissionState', () => {
        permissions.read = false
        renderReports()
        expect(screen.getByText('Нет права reports:read.')).toBeInTheDocument()
    })

    it('ST-6: ошибка списка + «Повторить»', async () => {
        listMock.mockRejectedValue(
            Object.assign(new Error('fail'), {
                response: { data: { error: { message: 'Список упал' } } },
            }),
        )
        renderReports()
        expect(await screen.findByText('Список упал')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('ST-1: skeleton при первичной загрузке списка', () => {
        listMock.mockReturnValue(new Promise(() => {}))
        renderReports()
        expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
    })

    it('ST-3: все модули выключены → NoPresetsState', async () => {
        enabledModules.value = []
        renderReports()
        expect(await screen.findByText('Нет доступных отчётов')).toBeInTheDocument()
    })

    it('данные пресета: KPI, диаграмма и переключатель таблица', async () => {
        renderReports()
        expect(await screen.findByText('Отчёты')).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'По продажам' })).toBeInTheDocument()
        expect(await screen.findByText('Выручка')).toBeInTheDocument()
        expect(screen.getByTestId('apex-chart')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Таблица' })).toBeInTheDocument()
    })

    it('ST-17: модуль-источник выключен в run → ModuleSourceDisabledState', async () => {
        runMock.mockRejectedValue(
            Object.assign(new Error('precond'), {
                response: { status: 409, data: { error: { code: 'FAILED_PRECONDITION' } } },
            }),
        )
        renderReports()
        expect(await screen.findByText('Отчёт недоступен')).toBeInTheDocument()
    })

    it('ST-3 preset: нет данных за период', async () => {
        runMock.mockResolvedValue(
            runResult({
                cards: [{ key: 'x', label: 'X', value: 0 }],
                chart: { type: 'bar', categories: [], series: [{ name: 'S', data: [] }] },
                table: { columns: [], rows: [] },
            }) as never,
        )
        renderReports()
        expect(
            await screen.findByText('Нет данных за период. Добавьте записи в CRM.'),
        ).toBeInTheDocument()
    })

    it('конструктор виден только с reports:manage', async () => {
        permissions.manage = false
        renderReports()
        await screen.findByText('Отчёты')
        expect(screen.queryByRole('button', { name: 'Конструктор' })).not.toBeInTheDocument()
    })

    it('каталог custom-отчётов и открытие deep-link ?custom=', async () => {
        const user = userEvent.setup()
        renderReports()
        expect(await screen.findByText('Сохранённые отчёты')).toBeInTheDocument()
        expect(screen.getByText('Мой отчёт')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Открыть' }))
        expect(navigateMock).toHaveBeenCalledWith('/reports?custom=c1')
    })

    it('?custom=id — загрузка и отображение custom-отчёта', async () => {
        getMock.mockResolvedValue(custom('c-open', 'Открытый custom') as never)
        renderReports('/reports?custom=c-open')
        expect(await screen.findByText('Открытый custom')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Все отчёты' })).toBeInTheDocument()
    })

    it('фильтр воронки + сброс', async () => {
        const user = userEvent.setup()
        renderReports()
        await screen.findByText('Выручка')
        const pipeline = screen.getByPlaceholderText('ID воронки (опц.)')
        await user.type(pipeline, 'pipe-1')
        expect(await screen.findByRole('button', { name: 'Сбросить фильтры' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))
        await waitFor(() => expect(pipeline).toHaveValue(''))
    })

    it('вкладка by_managers: переключатель «Сравнение отделов»', async () => {
        const user = userEvent.setup()
        renderReports()
        await user.click(await screen.findByRole('tab', { name: 'По менеджерам' }))
        await user.click(screen.getByRole('button', { name: 'Сравнение отделов' }))
        await waitFor(() =>
            expect(runMock.mock.calls.some((c) => c[3] === 'depts')).toBe(true),
        )
    })

    it('ST-27: offline — предупреждение об устаревших данных', async () => {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
        renderReports()
        expect(
            await screen.findByText('нет сети, данные могут быть устаревшими'),
        ).toBeInTheDocument()
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    })

    it('вкладка «Мои просрочки» только при visibility only_own', async () => {
        visibilityScope.level = 'only_own'
        renderReports()
        await screen.findByText('Отчёты')
        expect(screen.getByRole('tab', { name: 'Мои просрочки' })).toBeInTheDocument()
    })

    it('вкладка «Мои просрочки» скрыта при visibility all', async () => {
        visibilityScope.level = 'all'
        renderReports()
        await screen.findByText('Отчёты')
        expect(screen.queryByRole('tab', { name: 'Мои просрочки' })).not.toBeInTheDocument()
    })

    it('фильтр менеджеров появляется при >1 опции из Run', async () => {
        runMock.mockResolvedValue(
            runResult({
                managerOptions: [
                    { id: 'm1', name: 'Иванов' },
                    { id: 'm2', name: 'Петров' },
                ],
            }) as never,
        )
        renderReports()
        await screen.findByText('Выручка')
        expect(screen.getByText('Все менеджеры')).toBeInTheDocument()
    })

    it('выбор менеджера сужает прогон отчёта', async () => {
        const user = userEvent.setup()
        runMock.mockResolvedValue(
            runResult({
                managerOptions: [
                    { id: 'm1', name: 'Иванов' },
                    { id: 'm2', name: 'Петров' },
                ],
            }) as never,
        )
        renderReports()
        await screen.findByText('Выручка')
        const inputs = document.querySelectorAll('input.select__input')
        const managerInput = inputs[inputs.length - 1] as HTMLInputElement
        await user.click(managerInput)
        fireEvent.change(managerInput, { target: { value: 'Ив' } })
        await waitFor(() => {
            const option = Array.from(document.querySelectorAll('[role="option"]')).find(
                (el) => el.textContent === 'Иванов',
            )
            expect(option).toBeTruthy()
            fireEvent.click(option!)
        })
        await waitFor(() =>
            expect(
                runMock.mock.calls.some(
                    (c) =>
                        (c[1] as { params?: { managerIds?: string[] } })?.params?.managerIds
                            ?.includes('m1'),
                ),
            ).toBe(true),
        )
        expect(await screen.findByRole('button', { name: 'Сбросить фильтры' })).toBeInTheDocument()
    })
})
