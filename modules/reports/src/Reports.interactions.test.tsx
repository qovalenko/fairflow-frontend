import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { SWRConfig } from 'swr'
import Reports from './Reports'
import {
    apiListReports,
    apiGetReport,
    apiRunReport,
    apiDeleteReport,
    apiExportReport,
    downloadExport,
} from '@/services/ReportsService'
import toast from '@/components/ui/toast'

const navigateMock = vi.hoisted(() => vi.fn())
const permissions = vi.hoisted(() => ({
    read: true,
    export: true,
    manage: true,
}))
const enabledModules = vi.hoisted(() => ({
    value: ['deals', 'contacts', 'activities', 'companies'],
}))

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
    useVisibilityScope: () => ({ level: 'all' }),
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
const exportMock = vi.mocked(apiExportReport)
const downloadMock = vi.mocked(downloadExport)
const toastMock = vi.mocked(toast)

const builtin = (presetKey: string, id = `rep-${presetKey}`) => ({
    id,
    projectId: 'p1',
    name: `Отчёт ${presetKey}`,
    kind: 'builtin',
    presetKey,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
})

const custom = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    id,
    projectId: 'p1',
    name,
    kind: 'custom',
    visibility: 'personal' as const,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...extra,
})

const emptyRun = () => ({
    reportId: 'rep-sales',
    reportName: 'По продажам',
    generatedAt: 1_700_000_000_000,
    cards: [{ key: 'x', label: 'X', value: 0 }],
    chart: { type: 'bar', categories: [], series: [{ name: 'S', data: [] }] },
    table: { columns: [], rows: [] },
})

const runResult = (overrides: Record<string, unknown> = {}) => ({
    reportId: 'rep-sales',
    reportName: 'По продажам',
    generatedAt: 1_700_000_000_000,
    cards: [{ key: 'total', label: 'Выручка', value: 1_500_000, isCurrency: true }],
    chart: {
        type: 'bar',
        categories: ['Янв'],
        series: [{ name: 'Сумма', data: [100] }],
    },
    table: {
        columns: [{ key: 'stage', label: 'Стадия' }, { key: 'count', label: 'Кол-во', numeric: true }],
        rows: [{ stage: 'Won', count: 5, stage_id: 'won' }],
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

describe('Reports — взаимодействия и дополнительные состояния', () => {
    beforeEach(() => {
        navigateMock.mockReset()
        toastMock.push.mockReset()
        permissions.read = true
        permissions.export = true
        permissions.manage = true
        enabledModules.value = ['deals', 'contacts', 'activities', 'companies']
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
        exportMock.mockResolvedValue({ blob: new Blob(), filename: 'report.csv' } as never)
        downloadMock.mockImplementation(() => {})
        window.confirm = vi.fn(() => true)
    })

    it('ST-4: активный фильтр и пустой результат → EmptyFilterState', async () => {
        const user = userEvent.setup()
        runMock.mockResolvedValue(emptyRun() as never)
        renderReports()
        await screen.findByText('Отчёты')
        await user.type(screen.getByPlaceholderText('ID воронки (опц.)'), 'pipe-1')
        expect(
            await screen.findByText('Ничего не найдено по заданным фильтрам.'),
        ).toBeInTheDocument()
    })

    it('ошибка run (не 409) → ErrorState с «Повторить»', async () => {
        runMock.mockRejectedValue(
            Object.assign(new Error('fail'), {
                response: { data: { error: { message: 'Run упал' } } },
            }),
        )
        renderReports()
        expect(await screen.findByText('Run упал')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
    })

    it('пресет не засеян на бэке → честное EmptyDataState вкладки', async () => {
        const user = userEvent.setup()
        listMock.mockResolvedValue({ list: [builtin('sales')], total: 1 } as never)
        renderReports()
        await user.click(await screen.findByRole('tab', { name: 'По воронке' }))
        expect(
            await screen.findByText('Отчёт «По воронке» ещё не готов для этого проекта.'),
        ).toBeInTheDocument()
    })

    it('экспорт CSV → скачивание и toast «Файл готов»', async () => {
        const user = userEvent.setup()
        renderReports()
        await screen.findByText('Выручка')
        await user.click(screen.getByRole('button', { name: 'Экспорт' }))
        await waitFor(() => expect(exportMock).toHaveBeenCalled())
        expect(downloadMock).toHaveBeenCalled()
        expect(toastMock.push).toHaveBeenCalledWith('Файл готов')
    })

    it('ST-11: без reports:export кнопка «Экспорт» скрыта', async () => {
        permissions.export = false
        renderReports()
        await screen.findByText('Выручка')
        expect(screen.queryByRole('button', { name: 'Экспорт' })).not.toBeInTheDocument()
    })

    it('переключение на таблицу и drill по строке открывает панель', async () => {
        const user = userEvent.setup()
        renderReports()
        await screen.findByText('Выручка')
        await user.click(screen.getByRole('button', { name: 'Таблица' }))
        expect(await screen.findByText('Won')).toBeInTheDocument()
        await user.click(screen.getByText('Won'))
        expect(screen.getByTestId('drill-panel')).toBeInTheDocument()
    })

    it('?custom=id — ошибка загрузки custom-отчёта', async () => {
        getMock.mockRejectedValue(
            Object.assign(new Error('404'), {
                response: { data: { error: { message: 'Отчёт удалён' } } },
            }),
        )
        renderReports('/reports?custom=missing')
        expect(await screen.findByText('Отчёт удалён')).toBeInTheDocument()
    })

    it('удаление custom-отчёта из каталога после подтверждения', async () => {
        const user = userEvent.setup()
        renderReports()
        await screen.findByText('Мой отчёт')
        await user.click(screen.getByRole('button', { name: 'Удалить' }))
        await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('c1', { projectId: 'p1' }))
        expect(toastMock.push).toHaveBeenCalledWith('Отчёт удалён')
    })

    it('пустой каталог custom при manage → подсказка конструктора', async () => {
        listMock.mockResolvedValue({
            list: [
                builtin('sales'),
                builtin('funnel'),
                builtin('clients'),
                builtin('activity'),
                builtin('sources'),
                builtin('by_managers'),
            ],
            total: 6,
        } as never)
        renderReports()
        expect(
            await screen.findByText(/Сохранённых отчётов пока нет/),
        ).toBeInTheDocument()
    })

    it('пагинация агрегатов: «Вперёд» запрашивает следующую страницу', async () => {
        const user = userEvent.setup()
        runMock.mockResolvedValue(
            runResult({
                aggregatePagination: {
                    pageIndex: 0,
                    pageSize: 25,
                    totalGroups: 60,
                },
            }) as never,
        )
        renderReports()
        await screen.findByText('Выручка')
        await user.click(screen.getByRole('button', { name: 'Таблица' }))
        expect(await screen.findByText(/Группы 1–25 из 60/)).toBeInTheDocument()
        await user.click(await screen.findByRole('button', { name: 'Вперёд' }))
        await waitFor(() =>
            expect(
                runMock.mock.calls.some(
                    (c) =>
                        (c[1] as { params?: { pageIndex?: number } })?.params?.pageIndex === 1,
                ),
            ).toBe(true),
        )
    })

    it('каталог: метка «Личный» для personal visibility', async () => {
        listMock.mockResolvedValue({
            list: [
                builtin('sales'),
                builtin('funnel'),
                builtin('clients'),
                builtin('activity'),
                builtin('sources'),
                builtin('by_managers'),
                custom('c1', 'Личный отчёт', { visibility: 'personal' }),
            ],
            total: 7,
        } as never)
        renderReports()
        expect(await screen.findByText(/Личный ·/)).toBeInTheDocument()
    })

    it('каталог: описание custom-отчёта видно в строке', async () => {
        listMock.mockResolvedValue({
            list: [
                builtin('sales'),
                builtin('funnel'),
                builtin('clients'),
                builtin('activity'),
                builtin('sources'),
                builtin('by_managers'),
                custom('c2', 'Отчёт с описанием', {
                    visibility: 'project',
                    description: 'Еженедельная сводка',
                }),
            ],
            total: 7,
        } as never)
        renderReports()
        expect(await screen.findByText(/Еженедельная сводка ·/)).toBeInTheDocument()
    })
})
