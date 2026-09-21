/**
 * SCR-STATISTICS-DASHBOARD — индикатор «+ ещё N» у усечённых списков (TODO-498).
 *
 * Домен режет каждый список дашборда лимитом (просроченные/предстоящие/зависшие
 * ≤5), поэтому подпись, считавшая остаток как «длина массива − показано», была
 * тождественным нулём и не появлялась НИКОГДА. Полный размер среза приезжает
 * отдельными полями ответа (`overdueTotal`/`upcomingTotal`/`stalledTotal`) —
 * здесь зафиксировано, что виджеты читают именно их, а без них остаются на
 * прежнем поведении (никаких выдуманных чисел).
 *
 * Границы мокаем: `useStatistics` (SWR/API), UI-kit, apexcharts. Виджеты и сам
 * экран — настоящие: предмет проверки в том, ЧТО отрисовано.
 */
import { MemoryRouter } from 'react-router'
import { render, screen, act } from '@testing-library/react'
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

/** Активности/сделки ровно в том виде, в каком их отдаёт усечённый список BFF. */
const activities = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: `a-${i}`,
        title: `Активность ${i}`,
        type: 'task',
    })) as unknown as DashboardData['overdueActivities']

const deals = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
        id: `d-${i}`,
        name: `Сделка ${i}`,
        amount: 1000,
    })) as unknown as DashboardData['stalledDeals']

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
    enabledModules: ['statistics', 'deals', 'activities'],
    period: 'month',
    setPeriod: vi.fn(),
    range: { from: '', to: '' },
    setRange: vi.fn(),
    rangeIncomplete: false,
    refresh: vi.fn(),
    projectId: 'p1',
})

const renderDashboard = async (data: Partial<DashboardData>) => {
    stub.state.current = makeState(data)
    await act(async () => {
        render(
            <MemoryRouter initialEntries={['/p/p1/dashboard']}>
                <Dashboard />
            </MemoryRouter>,
        )
    })
}

describe('Dashboard — «+ ещё N» у усечённых списков (TODO-498)', () => {
    it('остаток считается от полного размера среза, а не от усечённого списка', async () => {
        await renderDashboard({
            overdueActivities: activities(5),
            overdueTotal: 17,
            upcomingActivities: activities(5),
            upcomingTotal: 9,
        })

        // 17 − 5 = 12 и 9 − 5 = 4. По длине массива обе подписи были бы «Все: …».
        expect(screen.getByText('+ ещё 12')).toBeInTheDocument()
        expect(screen.getByText('+ ещё 4')).toBeInTheDocument()
    })

    it('зависшие сделки: остаток виден и без ссылки «показать все»', async () => {
        // Серверного фильтра «залипшие» нет, ссылку экран не даёт — но честный
        // остаток пользователю показать обязаны (кнопка неактивна).
        await renderDashboard({ stalledDeals: deals(5), stalledTotal: 8 })

        const footer = screen.getByText('+ ещё 3')
        expect(footer).toBeInTheDocument()
        expect(footer.closest('button')).toBeDisabled()
    })

    it('срез уместился в лимит → остатка нет (ссылка «показать все»)', async () => {
        await renderDashboard({
            overdueActivities: activities(3),
            overdueTotal: 3,
        })

        expect(screen.queryByText(/\+ ещё/)).not.toBeInTheDocument()
        expect(screen.getByText('Все: просроченные →')).toBeInTheDocument()
    })

    it('ответ без *Total (старый gateway) → прежнее поведение, а не выдуманное число', async () => {
        await renderDashboard({ overdueActivities: activities(5) })

        expect(screen.queryByText(/\+ ещё/)).not.toBeInTheDocument()
    })

    it('total меньше уже присланного списка не занижает остаток', async () => {
        await renderDashboard({ overdueActivities: activities(5), overdueTotal: 0 })

        expect(screen.queryByText(/\+ ещё/)).not.toBeInTheDocument()
        expect(screen.getByText('Все: просроченные →')).toBeInTheDocument()
    })
})
