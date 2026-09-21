/**
 * SCR-STATISTICS-ANALYTICS — экранные состояния + экспорт (ST-7/11/29).
 */
import { MemoryRouter } from 'react-router'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import Analytics from './Analytics'
import type { StatisticsState } from './statistics.shared'

const stub = vi.hoisted(() => ({
    state: { current: null as unknown as StatisticsState },
    exportFn: vi.fn(),
}))

vi.mock('./statistics.shared', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./statistics.shared')>()
    return { ...actual, useStatistics: () => stub.state.current }
})
vi.mock('@/services/CrmService', () => ({
    apiExportStatistics: (...args: unknown[]) => stub.exportFn(...args),
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
    data: {
        asOf: 1,
        sales: [{ bucket: '2026-08', count: 1, amount: 100 }],
    } as StatisticsState['data'],
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

const renderAnalytics = async (state: StatisticsState, url = '/statistics') => {
    stub.state.current = state
    await act(async () => {
        render(
            <MemoryRouter initialEntries={[url]}>
                <Analytics />
            </MemoryRouter>,
        )
    })
}

describe('Analytics — экранные состояния', () => {
    it('ST-19: проект не выбран', async () => {
        await renderAnalytics(makeState({ noProject: true }))
        expect(screen.getByText('Проект не выбран')).toBeInTheDocument()
    })

    it('ST-10: нет права statistics:read', async () => {
        await renderAnalytics(makeState({ canRead: false }))
        expect(screen.getByText('Раздел недоступен')).toBeInTheDocument()
    })

    it('period=custom без диапазона', async () => {
        await renderAnalytics(makeState({ rangeIncomplete: true, period: 'custom' }))
        expect(screen.getByText('Выберите диапазон')).toBeInTheDocument()
    })

    it('ST-1: skeleton при первичной загрузке', async () => {
        await renderAnalytics(makeState({ isInitialLoading: true, data: null }))
        expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    })

    it('ST-6: ошибка + повтор', async () => {
        const refresh = vi.fn()
        await renderAnalytics(
            makeState({ error: new Error('fail'), data: null, refresh }),
        )
        expect(screen.getByText('Не удалось загрузить')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        expect(refresh).toHaveBeenCalled()
    })

    it('нет включённых модулей-источников → «Нет доступных срезов»', async () => {
        await renderAnalytics(makeState({ enabledModules: ['statistics'] }))
        expect(screen.getByText('Нет доступных срезов')).toBeInTheDocument()
    })

    it('scope=all показывает вкладку «Время на стадии»', async () => {
        await renderAnalytics(makeState({ scopeLevel: 'all' }))
        expect(screen.getByText('Время на стадии')).toBeInTheDocument()
    })
})

describe('Analytics — экспорт (FR-MSTAT-22/23)', () => {
    beforeEach(() => {
        stub.exportFn.mockReset()
        URL.createObjectURL = vi.fn(() => 'blob:mock')
        URL.revokeObjectURL = vi.fn()
    })

    it('ST-29: успешный экспорт скачивает файл и показывает toast', async () => {
        stub.exportFn.mockResolvedValue(new Blob(['csv']))
        await renderAnalytics(makeState())

        fireEvent.click(screen.getByRole('button', { name: /экспорт/i }))

        await waitFor(() => {
            expect(screen.getByText(/Файл сформирован/i)).toBeInTheDocument()
        })
        expect(stub.exportFn).toHaveBeenCalledWith(
            expect.objectContaining({ projectId: 'p1', period: 'month', format: 'csv' }),
        )
    })

    it('ST-11: без права export кнопка disabled', async () => {
        await renderAnalytics(makeState({ canExport: false }))
        expect(screen.getByRole('button', { name: /экспорт/i })).toBeDisabled()
    })

    it('ST-7: 403 → сообщение о праве statistics:export', async () => {
        stub.exportFn.mockRejectedValue({ response: { status: 403 } })
        await renderAnalytics(makeState())

        fireEvent.click(screen.getByRole('button', { name: /экспорт/i }))

        await waitFor(() => {
            expect(
                screen.getByText(/Нет права на экспорт/i),
            ).toBeInTheDocument()
        })
    })

    it('custom без диапазона → ошибка до запроса', async () => {
        await renderAnalytics(
            makeState({
                period: 'custom',
                range: { from: '', to: '' },
                rangeIncomplete: false,
            }),
        )
        fireEvent.click(screen.getByRole('button', { name: /экспорт/i }))
        expect(
            screen.getByText(/Укажите обе даты произвольного периода/i),
        ).toBeInTheDocument()
        expect(stub.exportFn).not.toHaveBeenCalled()
    })

    it('можно выбрать JSON и отправить format=json', async () => {
        stub.exportFn.mockResolvedValue(new Blob(['{}']))
        await renderAnalytics(makeState())

        fireEvent.change(screen.getByLabelText('Формат экспорта'), {
            target: { value: 'json' },
        })
        fireEvent.click(screen.getByRole('button', { name: /экспорт/i }))

        await waitFor(() => {
            expect(stub.exportFn).toHaveBeenCalledWith(
                expect.objectContaining({ format: 'json' }),
            )
        })
    })
})
