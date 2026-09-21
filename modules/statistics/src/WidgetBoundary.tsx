/**
 * SCR-STATISTICS-WIDGET-FALLBACK — EL-WF-3 boundary-fallback (FR-SHELL-5,
 * ST-8). Исключение при рендере одного виджета/врезки не должно ронять весь
 * дашборд: каждый виджет оборачивается этой границей. В host-каркасе слоты
 * `dashboard.*` ловятся `RemoteModuleErrorBoundary`; внутри модуля свои локальные
 * виджеты получают такую же изоляцию.
 *
 * Заметка реализации SCREENS §15: «деградация по слоту, не падение всего экрана».
 */
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { qa } from './qa'

interface WidgetBoundaryProps {
    children: ReactNode
    /** Подпись виджета — для контекста в fallback. */
    label?: string
}

interface WidgetBoundaryState {
    hasError: boolean
}

class WidgetBoundary extends Component<WidgetBoundaryProps, WidgetBoundaryState> {
    state: WidgetBoundaryState = { hasError: false }

    static getDerivedStateFromError(): WidgetBoundaryState {
        return { hasError: true }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // Логируем, но не пробрасываем — экран остаётся цел (FR-SHELL-5).
        // eslint-disable-next-line no-console
        console.error('[statistics] widget render failed:', error, info)
    }

    handleRetry = () => this.setState({ hasError: false })

    render() {
        if (this.state.hasError) {
            return (
                <div
                    className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 py-8 text-center dark:border-gray-600"
                    {...qa('statistics.shared.widgetBoundaryFallback', {
                        label: this.props.label,
                    })}
                >
                    <div className="text-3xl mb-2 opacity-40">🧩</div>
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Виджет временно недоступен
                    </div>
                    <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        данные в безопасности
                    </div>
                    <button
                        type="button"
                        onClick={this.handleRetry}
                        className="mt-2 text-xs text-blue-600 hover:underline"
                        {...qa('statistics.shared.widgetBoundaryRetry', {
                            label: this.props.label,
                        })}
                    >
                        Повторить
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}

export default WidgetBoundary
