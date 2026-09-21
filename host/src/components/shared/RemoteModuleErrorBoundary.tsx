import { Component, type ReactNode } from 'react'
import { Card, Button } from '@fairflow/shared-ui'
import { qa } from '@/shared/qa'

interface Props {
    children: ReactNode
    moduleName?: string
}

interface State {
    hasError: boolean
}

class RemoteModuleErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false }

    static getDerivedStateFromError(): State {
        return { hasError: true }
    }

    componentDidCatch(error: Error, info: { componentStack?: string }) {
        console.error(
            '[remote-module] failed to render',
            this.props.moduleName ?? 'unknown',
            error,
            info.componentStack,
        )
    }

    render() {
        if (this.state.hasError) {
            return (
                <Card>
                    <div
                        className="p-8 text-center space-y-3"
                        {...qa('host.remoteError.fallback', {
                            module: this.props.moduleName ?? 'unknown',
                        })}
                    >
                        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                            Модуль временно недоступен
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Не удалось загрузить раздел. Попробуйте обновить страницу.
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                            Ваши данные в безопасности — сбой затронул только отображение
                            раздела.
                        </p>
                        <span {...qa('host.remoteError.reload')}>
                            <Button
                                variant="solid"
                                onClick={() => {
                                    this.setState({ hasError: false })
                                    window.location.reload()
                                }}
                            >
                                Обновить
                            </Button>
                        </span>
                    </div>
                </Card>
            )
        }

        return this.props.children
    }
}

export default RemoteModuleErrorBoundary
