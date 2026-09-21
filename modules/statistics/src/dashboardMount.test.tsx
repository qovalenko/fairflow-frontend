/**
 * FR-STAT-170 — mount-points dashboard.kpi / dashboard.widget / dashboard.list.
 */
import { MemoryRouter } from 'react-router'
import { render, screen, fireEvent, act } from '@testing-library/react'
import DashboardKpiMount from './mount-points/DashboardKpiMount'
import DashboardChartsMount from './mount-points/DashboardChartsMount'
import DashboardListsMount from './mount-points/DashboardListsMount'
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
    Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    AdaptiveCard: ({ children }: { children?: React.ReactNode }) => (
        <div>{children}</div>
    ),
}))
vi.mock('react-apexcharts', () => ({
    default: ({
        options,
    }: {
        options?: {
            chart?: {
                events?: {
                    dataPointSelection?: (
                        e: unknown,
                        ctx: unknown,
                        cfg: { dataPointIndex: number },
                    ) => void
                }
            }
        }
    }) => (
        <button
            type="button"
            data-testid="chart"
            onClick={() =>
                options?.chart?.events?.dataPointSelection?.(null, null, {
                    dataPointIndex: 0,
                })
            }
        >
            chart
        </button>
    ),
}))

const dashboardData = (
    over: Partial<DashboardData> = {},
): DashboardData =>
    ({
        asOf: 1,
        statistics: [
            { key: 'deals_in_progress', label: 'Сделки в работе', value: 4 },
        ],
        dealsByStage: [{ stageId: 'st1', stageName: 'Новая', count: 2 }],
        dealsBySource: [{ source: 'Сайт', sourceKey: 'site', count: 1 }],
        topManagers: [
            {
                name: 'Иван',
                ownerId: 'u1',
                deals: 2,
                amount: 20000,
                conversion: 10,
            },
        ],
        overdueActivities: [{ id: 'a1', title: 'Звонок', type: 'call' }],
        upcomingActivities: [],
        stalledDeals: [{ id: 'd1', name: 'Сделка', amount: 1000 }],
        overdueTotal: 1,
        upcomingTotal: 0,
        stalledTotal: 1,
        ...over,
    }) as DashboardData

const makeState = (over: Partial<StatisticsState> = {}): StatisticsState => ({
    isInitialLoading: false,
    isRefreshing: false,
    error: null,
    data: dashboardData(),
    asOf: 1,
    partial: false,
    scopeLevel: 'all',
    noProject: false,
    canRead: true,
    canExport: true,
    enabledModules: ['statistics', 'deals', 'activities'],
    period: 'month',
    setPeriod: vi.fn(),
    range: { from: '', to: '' },
    setRange: vi.fn(),
    rangeIncomplete: false,
    refresh: vi.fn(),
    projectId: 'p1',
    ...over,
})

const renderMount = async (
    ui: React.ReactElement,
    state: StatisticsState,
    url = '/dashboard',
) => {
    stub.navigate.mockReset()
    stub.state.current = state
    await act(async () => {
        render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>)
    })
}

describe('Dashboard mount-points — loading / пусто', () => {
    it('KPI mount не рендерится при первичной загрузке', async () => {
        await renderMount(
            <DashboardKpiMount />,
            makeState({ isInitialLoading: true, data: null }),
        )
        expect(screen.queryByText('Сделки в работе')).not.toBeInTheDocument()
    })

    it('Charts mount скрыт без модуля deals', async () => {
        await renderMount(
            <DashboardChartsMount />,
            makeState({ enabledModules: ['statistics', 'activities'] }),
        )
        expect(screen.queryByText('Воронка продаж')).not.toBeInTheDocument()
    })

    it('Lists mount скрыт без activities/deals/managers', async () => {
        await renderMount(
            <DashboardListsMount />,
            makeState({
                enabledModules: ['statistics'],
                data: dashboardData({ topManagers: [] }),
            }),
        )
        expect(screen.queryByText('Просроченные')).not.toBeInTheDocument()
    })
})

describe('Dashboard mount-points — с данными', () => {
    it('KPI mount показывает метрику', async () => {
        await renderMount(<DashboardKpiMount />, makeState())
        expect(screen.getByText('Сделки в работе')).toBeInTheDocument()
    })

    it('Charts mount рисует воронку и источники', async () => {
        await renderMount(<DashboardChartsMount />, makeState())
        expect(screen.getByText('Воронка продаж')).toBeInTheDocument()
        expect(screen.getByText('Сделки по источникам')).toBeInTheDocument()
    })

    it('Lists mount показывает просроченные активности и зависшие сделки', async () => {
        await renderMount(<DashboardListsMount />, makeState())
        expect(screen.getByText('Просроченные')).toBeInTheDocument()
        expect(screen.getByText(/Звонок/)).toBeInTheDocument()
        expect(screen.getByText('Зависшие сделки')).toBeInTheDocument()
    })
})

describe('Dashboard mount-points — drill', () => {
    it('клик по воронке ведёт на сделки со stageId', async () => {
        await renderMount(<DashboardChartsMount />, makeState())
        fireEvent.click(screen.getAllByTestId('chart')[0]!)
        expect(stub.navigate).toHaveBeenCalledWith('/deals?stageId=st1')
    })

    it('клик по менеджеру ведёт на сделки с assigneeId', async () => {
        await renderMount(<DashboardListsMount />, makeState())
        fireEvent.click(screen.getByText('Иван'))
        expect(stub.navigate).toHaveBeenCalledWith('/deals?assigneeId=u1')
    })

    it('клик по просроченной активности открывает карточку', async () => {
        await renderMount(<DashboardListsMount />, makeState())
        fireEvent.click(screen.getByText(/Звонок/))
        expect(stub.navigate).toHaveBeenCalledWith('/activities/a1')
    })
})
