import { render, screen, fireEvent } from '@testing-library/react'
import {
    asArray,
    drillBase,
    drillTo,
    formatAsOf,
    rangeToEpochMs,
    scopeLabel,
    scopeSeesTeam,
    WidgetEmpty,
    WidgetPartial,
    WidgetMore,
    WidgetListFooter,
    ErrorScreen,
    NoPermissionScreen,
    NoProjectScreen,
    RangePromptScreen,
} from './statistics.shared'

vi.mock('@fairflow/shared-ui', () => ({
    Card: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

describe('statistics.shared — хелперы', () => {
    it('asArray принимает массив и { list }', () => {
        expect(asArray([1, 2])).toEqual([1, 2])
        expect(asArray({ list: ['a'] })).toEqual(['a'])
        expect(asArray(null)).toEqual([])
    })

    it('drillBase добавляет /p/:pid только когда pid передан', () => {
        expect(drillBase(undefined, '/deals')).toBe('/deals')
        expect(drillBase('p1', '/deals')).toBe('/p/p1/deals')
    })

    it('drillTo эмитит только непустые параметры', () => {
        expect(drillTo('/deals', { stageId: 's1', source: '' })).toBe(
            '/deals?stageId=s1',
        )
        expect(drillTo('/orders', {})).toBe('/orders')
    })

    it('rangeToEpochMs валидирует диапазон', () => {
        const ms = rangeToEpochMs({ from: '2026-08-01', to: '2026-08-15' })
        expect(ms).not.toBeNull()
        expect(ms!.from).toBeLessThan(ms!.to)
        expect(rangeToEpochMs({ from: '2026-08-20', to: '2026-08-01' })).toBeNull()
        expect(rangeToEpochMs({ from: '', to: '' })).toBeNull()
    })

    it('formatAsOf форматирует epoch ms и ISO', () => {
        expect(formatAsOf(Date.parse('2026-08-20T09:05:00'))).toBe(
            'данные на 09:05',
        )
        expect(formatAsOf('2026-08-20T09:05:00')).toBe('данные на 09:05')
        expect(formatAsOf(null)).toBeNull()
    })

    it('scopeLabel / scopeSeesTeam', () => {
        expect(scopeLabel('only_own')).toBe('мои данные')
        expect(scopeLabel(undefined)).toBeNull()
        expect(scopeSeesTeam('own_and_subordinates')).toBe(true)
        expect(scopeSeesTeam('only_own')).toBe(false)
    })
})

describe('statistics.shared — UI-заглушки', () => {
    it('WidgetEmpty с title и hint', () => {
        render(<WidgetEmpty title="Пусто" hint="Подсказка" />)
        expect(screen.getByText('Пусто')).toBeInTheDocument()
        expect(screen.getByText('Подсказка')).toBeInTheDocument()
    })

    it('WidgetPartial вызывает onRetry', () => {
        const onRetry = vi.fn()
        render(<WidgetPartial onRetry={onRetry} />)
        fireEvent.click(screen.getByRole('button', { name: 'Обновить' }))
        expect(onRetry).toHaveBeenCalled()
    })

    it('WidgetMore скрыт при count <= 0', () => {
        const { container } = render(<WidgetMore count={0} onClick={vi.fn()} />)
        expect(container).toBeEmptyDOMElement()
        render(<WidgetMore count={3} onClick={vi.fn()} />)
        expect(screen.getByText('+ ещё 3')).toBeInTheDocument()
    })

    it('WidgetListFooter: label или +N', () => {
        render(<WidgetListFooter more={0} onClick={vi.fn()} label="Показать все" />)
        expect(screen.getByText('Показать все →')).toBeInTheDocument()
    })

    it('ErrorScreen / NoPermission / NoProject / RangePrompt', () => {
        const retry = vi.fn()
        render(<ErrorScreen onRetry={retry} />)
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        expect(retry).toHaveBeenCalled()

        render(<NoPermissionScreen />)
        expect(screen.getByText('Раздел недоступен')).toBeInTheDocument()

        render(<NoProjectScreen />)
        expect(screen.getByText('Проект не выбран')).toBeInTheDocument()

        render(<RangePromptScreen />)
        expect(screen.getByText('Выберите диапазон')).toBeInTheDocument()
    })
})
