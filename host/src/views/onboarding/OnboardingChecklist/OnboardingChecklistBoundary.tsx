import { Component, type ErrorInfo, type ReactNode } from 'react'
import { qa } from '@/shared/qa'

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
}

/**
 * SCR-ONB-CHECKLIST ST/error boundary — изоляция виджета «Первые шаги» на
 * дашборде (FR-SHELL-5): сбой рендера чек-листа не роняет остальной экран.
 */
class OnboardingChecklistBoundary extends Component<Props, State> {
    state: State = { hasError: false }

    static getDerivedStateFromError(): State {
        return { hasError: true }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('[onboarding-checklist] render failed:', error, info)
    }

    handleRetry = () => this.setState({ hasError: false })

    render() {
        if (this.state.hasError) {
            return (
                <div
                    className="flex flex-col items-center justify-center rounded-lg border border-dashed border-violet-200 py-8 text-center dark:border-violet-900/50"
                    {...qa('host.onboarding.checklist.errorBoundary.fallback')}
                >
                    <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Виджет «Первые шаги» временно недоступен
                    </div>
                    <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        Остальной дашборд работает — данные в безопасности
                    </div>
                    <button
                        type="button"
                        onClick={this.handleRetry}
                        className="mt-2 text-xs text-violet-600 hover:underline dark:text-violet-400"
                        {...qa('host.onboarding.checklist.errorBoundary.retry')}
                    >
                        Повторить
                    </button>
                </div>
            )
        }

        return this.props.children
    }
}

export default OnboardingChecklistBoundary
