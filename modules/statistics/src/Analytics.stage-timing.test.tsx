/**
 * SCR-STATISTICS-ANALYTICS — срез stage_timing (FR-MSTAT-17, scope=all).
 */
import { MemoryRouter } from 'react-router'
import { render, screen, act } from '@testing-library/react'
import Analytics from './Analytics'
import type { StatisticsState } from './statistics.shared'

const stub = vi.hoisted(() => ({
    state: { current: null as unknown as StatisticsState },
    navigate: vi.fn(),
}))

vi.mock('./statistics.shared', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./statistics.shared')>()
    return { ...actual, useStatistics: () => stub.state.current }
})
vi.mock('@/services/CrmService', () => ({
    apiExportStatistics: vi.fn(),
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => () => true,
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useNavigate: () => stub.navigate }
})
vi.mock('@fairflow/shared-ui', () => ({
    Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
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

const makeState = (over: Partial<StatisticsState> = {}): StatisticsState => ({
    isInitialLoading: false,
    isRefreshing: false,
    error: null,
    data: { asOf: 1 } as StatisticsState['data'],
    asOf: 1,
    partial: false,
    scopeLevel: 'all',
    noProject: false,
    canRead: true,
    canExport: true,
    enabledModules: ['statistics', 'deals'],
    period: 'month',
    setPeriod: vi.fn(),
    range: { from: '', to: '' },
    setRange: vi.fn(),
    rangeIncomplete: false,
    refresh: vi.fn(),
    projectId: 'p1',
    ...over,
})

const renderAnalytics = async (url: string, state: StatisticsState) => {
    stub.state.current = state
    await act(async () => {
        render(
            <MemoryRouter initialEntries={[url]}>
                <Analytics />
            </MemoryRouter>,
        )
    })
}

describe('Analytics — срез «Время на стадии»', () => {
    it('показывает таблицу среднего времени по стадиям', async () => {
        await renderAnalytics(
            '/statistics?slice=stage_timing',
            makeState({
                data: {
                    asOf: 1,
                    stageDurations: [
                        {
                            stageId: 's1',
                            label: 'Квалификация',
                            transitionCount: 10,
                            avgDurationMs: 7_200_000,
                        },
                    ],
                } as StatisticsState['data'],
            }),
        )

        expect(screen.getByText('Среднее время на стадии')).toBeInTheDocument()
        expect(screen.getByText('Квалификация')).toBeInTheDocument()
        expect(screen.getByText('10')).toBeInTheDocument()
        expect(screen.getByText('2.0')).toBeInTheDocument()
    })

    it('пустой stageDurations → «Нет данных»', async () => {
        await renderAnalytics(
            '/statistics?slice=stage_timing',
            makeState({
                data: {
                    asOf: 1,
                    stageDurations: [],
                } as unknown as StatisticsState['data'],
            }),
        )

        expect(screen.getByText('Нет данных')).toBeInTheDocument()
    })

    it('order_types с данными рисует chart', async () => {
        await renderAnalytics(
            '/statistics?slice=order_types',
            makeState({
                enabledModules: ['statistics', 'orders'],
                data: {
                    asOf: 1,
                    orderTypes: [
                        {
                            orderTypeId: 't1',
                            orderTypeName: 'Подписка',
                            count: 3,
                        },
                    ],
                } as StatisticsState['data'],
            }),
        )

        expect(screen.getByText('Продажи по типам')).toBeInTheDocument()
        expect(screen.getByTestId('chart')).toBeInTheDocument()
    })
})
