/**
 * SCR-STATISTICS-DASHBOARD — экранные состояния ST-1/3/6/10/19 + refetch overlay.
 */
import { MemoryRouter } from 'react-router'
import { render, screen, act, fireEvent } from '@testing-library/react'
import Dashboard from './Dashboard'
import type { StatisticsState } from './statistics.shared'
import type { DashboardData } from '@/@types/crm'

const stub = vi.hoisted(() => ({
    state: { current: null as unknown as StatisticsState },
}))

vi.mock('./statistics.shared', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./statistics.shared')>()
    return { ...actual, useStatistics: () => stub.state.current }
})
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({
    default: () => stub.state.current?.projectId ?? 'p1',
}))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => () => true,
}))
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
    data: null,
    asOf: null,
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

const renderDashboard = async (state: StatisticsState) => {
    stub.state.current = state
    await act(async () => {
        render(
            <MemoryRouter initialEntries={['/dashboard']}>
                <Dashboard />
            </MemoryRouter>,
        )
    })
}

describe('Dashboard — экранные состояния', () => {
    it('ST-19: проект не выбран', async () => {
        await renderDashboard(makeState({ noProject: true, projectId: undefined }))
        expect(screen.getByText('Проект не выбран')).toBeInTheDocument()
    })

    it('ST-10: нет права statistics:read', async () => {
        await renderDashboard(makeState({ canRead: false }))
        expect(screen.getByText('Раздел недоступен')).toBeInTheDocument()
    })

    it('period=custom без диапазона → подсказка выбрать даты', async () => {
        await renderDashboard(makeState({ rangeIncomplete: true, period: 'custom' }))
        expect(screen.getByText('Выберите диапазон')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeInTheDocument()
    })

    it('ST-1: первичная загрузка — skeleton, не белый экран', async () => {
        await renderDashboard(makeState({ isInitialLoading: true }))
        expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    })

    it('ST-6: ошибка загрузки + «Повторить»', async () => {
        const refresh = vi.fn()
        await renderDashboard(
            makeState({ error: new Error('network'), refresh, data: null }),
        )
        expect(screen.getByText('Не удалось загрузить')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        expect(refresh).toHaveBeenCalled()
    })

    it('ST-3: пустой ответ — per-widget WidgetEmpty вместо фейка', async () => {
        await renderDashboard(
            makeState({
                data: {
                    statistics: [],
                    dealsByStage: [],
                    dealsBySource: [],
                    overdueActivities: [],
                    upcomingActivities: [],
                    stalledDeals: [],
                } as unknown as DashboardData,
            }),
        )
        expect(screen.getByText('Создайте первую сделку в модуле Сделки.')).toBeInTheDocument()
        expect(screen.getByText('Нет данных об источниках за период.')).toBeInTheDocument()
    })

    it('ST-2: фоновый refetch затемняет контент', async () => {
        await renderDashboard(
            makeState({
                isRefreshing: true,
                data: {
                    statistics: [
                        { key: 'deals', label: 'Сделки в работе', value: 3 },
                    ],
                    dealsByStage: [],
                    overdueActivities: [],
                    upcomingActivities: [],
                    stalledDeals: [],
                } as unknown as DashboardData,
            }),
        )
        expect(document.querySelector('.opacity-60')).toBeTruthy()
        expect(screen.getByText('Сделки в работе')).toBeInTheDocument()
    })
})
