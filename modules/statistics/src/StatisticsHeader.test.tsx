/**
 * StatisticsHeader — период, диапазон, scope, partial, обновление (EL-DASH-1..4).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import StatisticsHeader from './StatisticsHeader'

vi.mock('@fairflow/shared-ui', () => ({
    Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

describe('StatisticsHeader', () => {
    const baseProps = {
        title: 'Дашборд',
        period: 'month' as const,
        onPeriodChange: vi.fn(),
        range: { from: '', to: '' },
        onRangeChange: vi.fn(),
        rangeIncomplete: false,
        asOf: Date.parse('2026-08-20T14:30:00'),
        partial: false,
        scopeLevel: 'all' as const,
        onRefresh: vi.fn(),
        isRefreshing: false,
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('показывает заголовок, scope и метку asOf', () => {
        render(<StatisticsHeader {...baseProps} />)
        expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeInTheDocument()
        expect(screen.getByText(/смотрю: все данные проекта/)).toBeInTheDocument()
        expect(screen.getByText(/данные на 14:30/)).toBeInTheDocument()
    })

    it('смена периода вызывает onPeriodChange', () => {
        render(<StatisticsHeader {...baseProps} />)
        fireEvent.change(screen.getByRole('combobox'), {
            target: { value: 'quarter' },
        })
        expect(baseProps.onPeriodChange).toHaveBeenCalledWith('quarter')
    })

    it('period=custom показывает поля дат и предупреждение при неполном диапазоне', () => {
        render(
            <StatisticsHeader
                {...baseProps}
                period="custom"
                range={{ from: '2026-08-01', to: '' }}
                rangeIncomplete
            />,
        )
        expect(screen.getByLabelText('Начало периода')).toBeInTheDocument()
        expect(screen.getByLabelText('Конец периода')).toBeInTheDocument()
        expect(
            screen.getByText(/укажите обе даты диапазона/i),
        ).toBeInTheDocument()
    })

    it('изменение начала custom-периода вызывает onRangeChange', () => {
        render(
            <StatisticsHeader
                {...baseProps}
                period="custom"
                range={{ from: '2026-08-01', to: '2026-08-10' }}
            />,
        )
        fireEvent.change(screen.getByLabelText('Начало периода'), {
            target: { value: '2026-08-02' },
        })
        expect(baseProps.onRangeChange).toHaveBeenCalledWith({
            from: '2026-08-02',
            to: '2026-08-10',
        })
    })

    it('изменение конца custom-периода вызывает onRangeChange', () => {
        render(
            <StatisticsHeader
                {...baseProps}
                period="custom"
                range={{ from: '2026-08-01', to: '2026-08-10' }}
            />,
        )
        fireEvent.change(screen.getByLabelText('Конец периода'), {
            target: { value: '2026-08-20' },
        })
        expect(baseProps.onRangeChange).toHaveBeenCalledWith({
            from: '2026-08-01',
            to: '2026-08-20',
        })
    })

    it('partial=true показывает бейдж частичных данных', () => {
        render(<StatisticsHeader {...baseProps} partial />)
        expect(screen.getByText(/частичные данные/)).toBeInTheDocument()
    })

    it('«Обновить» вызывает onRefresh и блокируется при isRefreshing', () => {
        const { rerender } = render(<StatisticsHeader {...baseProps} />)
        fireEvent.click(screen.getByRole('button', { name: /обновить/i }))
        expect(baseProps.onRefresh).toHaveBeenCalledTimes(1)

        rerender(<StatisticsHeader {...baseProps} isRefreshing />)
        expect(screen.getByRole('button', { name: /обновить/i })).toBeDisabled()
    })

    it('рендерит дополнительные контролы через children', () => {
        render(
            <StatisticsHeader {...baseProps}>
                <button type="button">Экспорт</button>
            </StatisticsHeader>,
        )
        expect(screen.getByRole('button', { name: 'Экспорт' })).toBeInTheDocument()
    })
})
