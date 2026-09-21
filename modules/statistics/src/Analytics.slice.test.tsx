/**
 * SCR-STATISTICS-ANALYTICS — активный срез в URL (TODO-496) + отсутствие
 * клиентского фоллбека источников (TODO-506).
 *
 * Границы мокаем: `useStatistics` (SWR/API), UI-kit, apexcharts. Виджеты и сам
 * экран — настоящие: предмет проверки в том, ЧТО отрисовано и что уехало в URL.
 */
import { MemoryRouter, useLocation } from 'react-router'
import { render, screen, act } from '@testing-library/react'
import Analytics from './Analytics'
import type { StatisticsState } from './statistics.shared'

const stub = vi.hoisted(() => ({
    state: { current: null as unknown as StatisticsState },
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

type Overrides = Partial<StatisticsState> & {
    data?: StatisticsState['data']
}

const makeState = (over: Overrides = {}): StatisticsState => ({
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
    enabledModules: ['statistics', 'deals', 'orders'],
    period: 'month',
    setPeriod: vi.fn(),
    range: { from: '', to: '' },
    setRange: vi.fn(),
    rangeIncomplete: false,
    refresh: vi.fn(),
    projectId: 'p1',
    ...over,
})

const Search = () => {
    const { search } = useLocation()
    return <span data-testid="search">{search}</span>
}

const renderAnalytics = async (url: string, state: StatisticsState) => {
    stub.state.current = state
    await act(async () => {
        render(
            <MemoryRouter initialEntries={[url]}>
                <Analytics />
                <Search />
            </MemoryRouter>,
        )
    })
}

describe('Analytics — активный срез в URL (TODO-496)', () => {
    it('без параметра открывается срез по умолчанию', async () => {
        await renderAnalytics('/statistics', makeState())
        expect(screen.getByText('Динамика сделок')).toBeInTheDocument()
        expect(screen.getByTestId('search').textContent).toBe('')
    })

    it('ссылка ?slice= восстанавливает срез (F5/шаринг)', async () => {
        await renderAnalytics('/statistics?slice=funnel', makeState())
        expect(screen.getByText('Воронка продаж')).toBeInTheDocument()
    })

    it('переключение вкладки пишется в URL', async () => {
        await renderAnalytics('/statistics', makeState())
        await act(async () => {
            screen.getByText('Источники').click()
        })
        expect(screen.getByTestId('search').textContent).toBe('?slice=sources')
        expect(screen.getByText('Сделки по источникам')).toBeInTheDocument()
    })

    it('возврат к дефолтному срезу убирает параметр', async () => {
        await renderAnalytics('/statistics?slice=funnel', makeState())
        await act(async () => {
            screen.getByText('Динамика').click()
        })
        expect(screen.getByTestId('search').textContent).toBe('')
    })

    it('чужие параметры (период) при смене среза сохраняются', async () => {
        await renderAnalytics('/statistics?period=quarter', makeState())
        await act(async () => {
            screen.getByText('Воронка').click()
        })
        const search = screen.getByTestId('search').textContent ?? ''
        expect(search).toContain('period=quarter')
        expect(search).toContain('slice=funnel')
    })

    it('недоступный зрителю срез из ссылки чинится в самом URL, а не молча подменяется', async () => {
        // scope < own_and_subordinates → вкладок team/by_department нет; иначе
        // запрос ушёл бы за `team`, а на экране рисовался бы fallback-срез —
        // «нет данных» на пустом месте.
        await renderAnalytics(
            '/statistics?slice=team',
            makeState({ scopeLevel: 'only_own' }),
        )
        expect(screen.getByTestId('search').textContent).toBe('')
        expect(screen.queryByText('Топ менеджеров')).not.toBeInTheDocument()
        expect(screen.getByText('Динамика сделок')).toBeInTheDocument()
    })

    it('пока данные не пришли, срез из ссылки не сбрасывается', async () => {
        // scopeLevel известен только из ответа: сбрасывать `?slice=team` до
        // ответа значило бы ломать валидную ссылку зрителя с широким scope.
        await renderAnalytics(
            '/statistics?slice=team',
            makeState({ data: null, scopeLevel: undefined }),
        )
        expect(screen.getByTestId('search').textContent).toBe('?slice=team')
    })
})

describe('Analytics — срез «Типы продаж» (TODO-272)', () => {
    it('при включённом модуле orders вкладка «Типы продаж» видна', async () => {
        await renderAnalytics('/statistics', makeState())
        expect(screen.getByText('Типы продаж')).toBeInTheDocument()
    })

    it('ссылка ?slice=order_types восстанавливает срез', async () => {
        await renderAnalytics('/statistics?slice=order_types', makeState())
        expect(screen.getByText('Продажи по типам')).toBeInTheDocument()
        expect(screen.getByTestId('search').textContent).toBe('?slice=order_types')
    })

    it('только orders без deals → доступен срез order_types', async () => {
        await renderAnalytics(
            '/statistics',
            makeState({ enabledModules: ['statistics', 'orders'] }),
        )
        expect(screen.getByText('Типы продаж')).toBeInTheDocument()
        expect(screen.queryByText('Нет доступных срезов')).not.toBeInTheDocument()
    })
})

describe('Analytics — источники без клиентского фоллбека (TODO-506)', () => {
    it('пустой dealsBySource даёт честное «нет данных», а не счёт из recentDeals', async () => {
        await renderAnalytics(
            '/statistics?slice=sources',
            makeState({
                data: {
                    asOf: 1,
                    dealsBySource: [],
                    // Даже если список последних сделок непуст — это выборка
                    // последних, а не агрегат за период: считать источники из
                    // него нельзя (и маппер аналитики всё равно шлёт []).
                    recentDeals: [
                        { id: 'd1', source: 'site' },
                        { id: 'd2', source: 'site' },
                    ],
                } as unknown as StatisticsState['data'],
            }),
        )
        expect(
            screen.getByText('Нет данных об источниках за период.'),
        ).toBeInTheDocument()
        expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
    })

    it('реальный агрегат источников рисуется', async () => {
        await renderAnalytics(
            '/statistics?slice=sources',
            makeState({
                data: {
                    asOf: 1,
                    dealsBySource: [
                        { source: 'Сайт', sourceKey: 'site', count: 3 },
                    ],
                } as unknown as StatisticsState['data'],
            }),
        )
        expect(screen.getByTestId('chart')).toBeInTheDocument()
    })
})
