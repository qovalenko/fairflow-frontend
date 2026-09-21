/**
 * DashboardWidgets — виджеты дашборда/аналитики: гейтинг, пустые состояния, drill.
 */
import { MemoryRouter } from 'react-router'
import { render, screen, fireEvent } from '@testing-library/react'
import {
    remainingCount,
    hasComparableBase,
    KpiRow,
    FunnelWidget,
    SourcesWidget,
    ActivityListWidget,
    StalledWidget,
    ManagersWidget,
    DepartmentsWidget,
} from './DashboardWidgets'

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
    default: () => <div data-testid="chart" />,
}))

const navigate = vi.fn()
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return { ...actual, useNavigate: () => navigate }
})

describe('DashboardWidgets — remainingCount / hasComparableBase', () => {
    it('remainingCount считает от total, а не от длины списка', () => {
        expect(remainingCount(17, 5, 5)).toBe(12)
        expect(remainingCount(undefined, 5, 5)).toBe(0)
        expect(remainingCount(0, 5, 5)).toBe(0)
    })

    it('hasComparableBase требует previousValue > 0', () => {
        expect(hasComparableBase(5)).toBe(true)
        expect(hasComparableBase(0)).toBe(false)
        expect(hasComparableBase(undefined)).toBe(false)
    })
})

describe('KpiRow', () => {
    beforeEach(() => navigate.mockReset())

    it('без deals/orders → «Нет KPI»', () => {
        render(
            <MemoryRouter>
                <KpiRow
                    statistics={[{ key: 'deals', label: 'Сделки', value: 1 }]}
                    enabledModules={['statistics']}
                />
            </MemoryRouter>,
        )
        expect(screen.getByText('Нет KPI')).toBeInTheDocument()
    })

    it('KPI с deals рендерится и drill ведёт на /deals', () => {
        render(
            <MemoryRouter>
                <KpiRow
                    statistics={[
                        { key: 'deals_in_progress', label: 'Сделки в работе', value: 4 },
                    ]}
                    enabledModules={['deals']}
                />
            </MemoryRouter>,
        )
        fireEvent.click(screen.getByText('Сделки в работе').parentElement!.parentElement!)
        expect(navigate).toHaveBeenCalledWith('/deals')
    })
})

describe('FunnelWidget / SourcesWidget', () => {
    it('FunnelWidget скрыт без модуля deals', () => {
        const { container } = render(
            <FunnelWidget data={[]} enabledModules={['statistics']} />,
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('FunnelWidget пустой → подсказка создать сделку', () => {
        render(<FunnelWidget data={[]} enabledModules={['deals']} />)
        expect(screen.getByText(/Создайте первую сделку/i)).toBeInTheDocument()
    })

    it('SourcesWidget с данными рисует chart', () => {
        render(
            <SourcesWidget
                data={[{ source: 'Сайт', sourceKey: 'site', count: 2 }]}
                enabledModules={['deals']}
            />,
        )
        expect(screen.getByTestId('chart')).toBeInTheDocument()
    })
})

describe('ActivityListWidget / StalledWidget', () => {
    it('ActivityListWidget показывает строки и footer', () => {
        const onDrillAll = vi.fn()
        render(
            <ActivityListWidget
                title="Просроченные"
                items={[
                    { id: 'a1', title: 'Звонок', type: 'call' },
                ] as never}
                limit={5}
                total={10}
                enabledModules={['activities']}
                onDrillItem={vi.fn()}
                onDrillAll={onDrillAll}
            />,
        )
        expect(screen.getByText(/Звонок/)).toBeInTheDocument()
        fireEvent.click(screen.getByText('+ ещё 9'))
        expect(onDrillAll).toHaveBeenCalled()
    })

    it('StalledWidget без onDrillAll показывает неактивный остаток', () => {
        render(
            <StalledWidget
                items={[{ id: 'd1', name: 'Сделка', amount: 50000 }] as never}
                total={8}
                enabledModules={['deals']}
                onDrillItem={vi.fn()}
            />,
        )
        const footer = screen.getByText('+ ещё 7')
        expect(footer.closest('button')).toBeDisabled()
    })
})

describe('ManagersWidget / DepartmentsWidget — scope gating', () => {
    it('ManagersWidget скрыт при scope only_own', () => {
        const { container } = render(
            <ManagersWidget
                data={[{ name: 'Иван', deals: 1, amount: 1000, conversion: 10 }]}
                enabledModules={['deals']}
                scopeLevel="only_own"
            />,
        )
        expect(container).toBeEmptyDOMElement()
    })

    it('ManagersWidget с scope all показывает таблицу', () => {
        render(
            <ManagersWidget
                data={[
                    {
                        name: 'Иван',
                        ownerId: 'u1',
                        deals: 2,
                        amount: 20000,
                        conversion: 15,
                    },
                ]}
                enabledModules={['deals']}
                scopeLevel="all"
                onDrill={vi.fn()}
            />,
        )
        expect(screen.getByText('Топ менеджеров')).toBeInTheDocument()
        expect(screen.getByText('Иван')).toBeInTheDocument()
    })

    it('DepartmentsWidget рендерит строки отделов', () => {
        render(
            <DepartmentsWidget
                data={[
                    {
                        departmentId: 'dep1',
                        name: 'Продажи',
                        deals: 5,
                        amount: 500000,
                        avgCheck: 100000,
                        managersCount: 3,
                    },
                ]}
                enabledModules={['deals']}
                scopeLevel="all"
            />,
        )
        expect(screen.getByText('Продажи')).toBeInTheDocument()
        expect(screen.getByText('3')).toBeInTheDocument()
    })
})
