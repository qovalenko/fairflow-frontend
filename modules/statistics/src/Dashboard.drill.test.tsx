/**
 * SCR-STATISTICS-DASHBOARD — адреса drill'а и единица индикатора роста.
 *
 * 1) TODO-504: `growthRate` приезжает ДОЛЕЙ ((value−previous)/previous, домен
 *    `reports.service.ts#kpiCell` → proto `growth_rate` → BFF `growthRate`).
 *    Экран печатал долю как проценты («▲ +0.25%» вместо «▲ +25%»).
 * 2) Drill-база: префикс `/p/:pid` допустим только там, где он есть в URL.
 *    В host'е маршрутов `/p/:pid/deals|orders|activities` НЕТ вовсе
 *    (`routes.config.ts` знает `/p/:pid` и `/p/:pid/settings[...]`), поэтому
 *    ссылка, собранная от projectId из store, уводила в catch-all «Страница не
 *    найдена». Под standalone-сборкой pid в URL реально бывает
 *    (`StandaloneModuleApp`: `/p/:pid<modulePath>/*`) — там префикс сохраняем.
 *
 * Границы мокаем (`useStatistics`, UI-kit, apexcharts, `useNavigate`), сами
 * виджеты — настоящие: предмет проверки в том, ЧТО отрисовано и КУДА уводит.
 */
import { MemoryRouter, Routes, Route } from 'react-router'
import { render, screen, act, fireEvent } from '@testing-library/react'
import Dashboard from './Dashboard'
import { formatGrowthRate } from './DashboardWidgets'
import type { StatisticsState } from './statistics.shared'
import type { DashboardData } from '@/@types/crm'

const stub = vi.hoisted(() => ({
    state: { current: null as unknown as StatisticsState },
    navigate: vi.fn(),
}))

vi.mock('./statistics.shared', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./statistics.shared')>()
    return { ...actual, useStatistics: () => stub.state.current }
})
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useNavigate: () => stub.navigate }
})
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => () => true,
}))
vi.mock('@fairflow/shared-ui', () => ({
    Card: ({ children }: { children?: React.ReactNode }) => (
        <div>{children}</div>
    ),
    Container: ({ children }: { children?: React.ReactNode }) => (
        <div>{children}</div>
    ),
    AdaptiveCard: ({ children }: { children?: React.ReactNode }) => (
        <div>{children}</div>
    ),
}))
vi.mock('react-apexcharts', () => ({
    default: () => <div data-testid="chart" />,
}))

const kpi = (
    key: string,
    label: string,
    value: number,
    growthRate?: number,
    /**
     * База сравнения. Задавать ЯВНО везде, где проверяется индикатор роста:
     * он рисуется только при `previousValue > 0` (см. `hasComparableBase`),
     * поэтому без базы тест формата смотрел бы на скрытую подпись.
     */
    previousValue?: number,
) =>
    ({
        key,
        label,
        value,
        growthRate,
        previousValue,
    }) as DashboardData['statistics'][number]

const makeState = (data: Partial<DashboardData>): StatisticsState => ({
    isInitialLoading: false,
    isRefreshing: false,
    error: null,
    data: {
        statistics: [],
        dealsByStage: [],
        dealsTimeline: [],
        topManagers: [],
        recentDeals: [],
        overdueActivities: [],
        upcomingActivities: [],
        ...data,
    } as DashboardData,
    asOf: 1,
    partial: false,
    scopeLevel: 'all',
    noProject: false,
    canRead: true,
    canExport: true,
    enabledModules: ['statistics', 'deals', 'orders', 'activities'],
    period: 'month',
    setPeriod: vi.fn(),
    range: { from: '', to: '' },
    setRange: vi.fn(),
    rangeIncomplete: false,
    refresh: vi.fn(),
    // Проект в store есть ВСЕГДА — именно из него раньше собирался префикс.
    projectId: 'p1',
})

/**
 * @param entry  адрес в браузере
 * @param path   маршрут, которым он матчится (host: `/dashboard`,
 *               standalone: `/p/:pid/dashboard`)
 */
const renderDashboard = async (
    data: Partial<DashboardData>,
    entry = '/dashboard',
    path = '/dashboard',
) => {
    stub.navigate.mockReset()
    stub.state.current = makeState(data)
    await act(async () => {
        render(
            <MemoryRouter initialEntries={[entry]}>
                <Routes>
                    <Route path={path} element={<Dashboard />} />
                </Routes>
            </MemoryRouter>,
        )
    })
}

/** Кликабельная обёртка KPI-ячейки: подпись → flex-колонка → onClick-div. */
const kpiCellByLabel = (label: string) =>
    screen.getByText(label).parentElement!.parentElement!

describe('Индикатор роста KPI — доля, а не проценты (TODO-504)', () => {
    it('formatGrowthRate переводит долю в проценты и округляет', () => {
        expect(formatGrowthRate(0.25)).toBe('▲ +25%')
        expect(formatGrowthRate(1 / 3)).toBe('▲ +33,3%')
        expect(formatGrowthRate(0)).toBe('▲ +0%')
        expect(formatGrowthRate(-0.1)).toBe('▼ -10%')
        // -0 после округления не должен дать «▲ +-0%».
        expect(formatGrowthRate(-0.0004)).toBe('▲ +0%')
    })

    it('KPI-ячейка показывает «▲ +25%», а не долю «▲ +0.25%»', async () => {
        await renderDashboard({
            statistics: [kpi('deals_in_progress', 'Сделки в работе', 5, 0.25, 4)],
        })

        expect(screen.getByText('▲ +25%')).toBeInTheDocument()
        expect(screen.queryByText(/0\.25%/)).not.toBeInTheDocument()
    })

    it('падение периода — «▼ -20%» красным', async () => {
        await renderDashboard({
            statistics: [kpi('deals_in_progress', 'Сделки в работе', 4, -0.2, 5)],
        })

        expect(screen.getByText('▼ -20%')).toBeInTheDocument()
    })

    it('домен не прислал growth_rate → индикатора нет вовсе', async () => {
        await renderDashboard({
            statistics: [kpi('deals_in_progress', 'Сделки в работе', 4)],
        })

        expect(screen.queryByText(/[▲▼]/)).not.toBeInTheDocument()
    })

    // Вторая половина TODO-504: домен кодирует «сравнивать не с чем» нулём
    // (`previous > 0 ? (value − previous)/previous : 0`), и без этой проверки
    // свежий проект получал «▲ +0%» — «роста нет» вместо роста с нуля.
    it('пустое предыдущее окно (previous = 0) → индикатор скрыт, а не «▲ +0%»', async () => {
        await renderDashboard({
            statistics: [kpi('deals_in_progress', 'Сделки в работе', 42, 0, 0)],
        })

        expect(screen.getByText('42')).toBeInTheDocument()
        expect(screen.queryByText(/[▲▼]/)).not.toBeInTheDocument()
    })

    it('старая сборка домена без previous_value → индикатор скрыт', async () => {
        await renderDashboard({
            statistics: [
                kpi('deals_in_progress', 'Сделки в работе', 42, 0, undefined),
            ],
        })

        expect(screen.queryByText(/[▲▼]/)).not.toBeInTheDocument()
    })

    it('честный ноль при непустой базе остаётся «▲ +0%»', async () => {
        await renderDashboard({
            statistics: [kpi('deals_in_progress', 'Сделки в работе', 7, 0, 7)],
        })

        expect(screen.getByText('▲ +0%')).toBeInTheDocument()
    })
})

describe('Drill дашборда ведёт на существующий маршрут', () => {
    it('host (`/dashboard`): KPI-ячейка сделок → `/deals`, без `/p/:pid`', async () => {
        await renderDashboard({
            statistics: [kpi('deals_in_progress', 'Сделки в работе', 5)],
        })

        fireEvent.click(kpiCellByLabel('Сделки в работе'))

        expect(stub.navigate).toHaveBeenCalledWith('/deals')
    })

    it('host: ячейка продаж → `/orders`', async () => {
        await renderDashboard({
            statistics: [kpi('orders_in_progress', 'Продажи в работе', 2)],
        })

        fireEvent.click(kpiCellByLabel('Продажи в работе'))

        expect(stub.navigate).toHaveBeenCalledWith('/orders')
    })

    it('host: «Все: просроченные» → `/activities?overdue=1`', async () => {
        await renderDashboard({
            overdueActivities: [
                { id: 'a-1', title: 'Звонок', type: 'task' },
            ] as unknown as DashboardData['overdueActivities'],
        })

        fireEvent.click(screen.getByText('Все: просроченные →'))

        expect(stub.navigate).toHaveBeenCalledWith('/activities?overdue=1')
    })

    it('standalone (`/p/:pid/dashboard`): префикс из URL сохраняется', async () => {
        await renderDashboard(
            { statistics: [kpi('deals_in_progress', 'Сделки в работе', 5)] },
            '/p/p1/dashboard',
            '/p/:pid/dashboard',
        )

        fireEvent.click(kpiCellByLabel('Сделки в работе'))

        expect(stub.navigate).toHaveBeenCalledWith('/p/p1/deals')
    })
})
