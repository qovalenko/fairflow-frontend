/**
 * WidgetBoundary — EL-WF-3: падение одного виджета не роняет экран (ST-8).
 */
import { render, screen, fireEvent } from '@testing-library/react'
import WidgetBoundary from './WidgetBoundary'

function Boom(): null {
    throw new Error('chart render failed')
}

describe('WidgetBoundary', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('при ошибке дочернего компонента показывает безопасный fallback', () => {
        render(
            <WidgetBoundary label="Воронка">
                <Boom />
            </WidgetBoundary>,
        )
        expect(screen.getByText('Виджет временно недоступен')).toBeInTheDocument()
        expect(screen.getByText(/данные в безопасности/i)).toBeInTheDocument()
        expect(console.error).toHaveBeenCalled()
    })

    it('«Повторить» сбрасывает состояние ошибки', () => {
        let shouldThrow = true
        const MaybeBoom = () => {
            if (shouldThrow) throw new Error('fail once')
            return <div data-testid="recovered">OK</div>
        }

        render(
            <WidgetBoundary>
                <MaybeBoom />
            </WidgetBoundary>,
        )
        expect(screen.getByText('Виджет временно недоступен')).toBeInTheDocument()

        shouldThrow = false
        fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))
        expect(screen.getByTestId('recovered')).toBeInTheDocument()
    })

    it('без ошибки рендерит children', () => {
        render(
            <WidgetBoundary>
                <span data-testid="child">content</span>
            </WidgetBoundary>,
        )
        expect(screen.getByTestId('child')).toBeInTheDocument()
    })
})
