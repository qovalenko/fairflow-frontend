import { Component, type ReactNode } from 'react'
import { Button, Card } from '@fairflow/shared-ui'
import Loading from '@/components/shared/Loading'
import { qa } from '@/shared/qa'
import { isChunkLoadError } from '@/utils/isChunkLoadError'

const CHUNK_RELOAD_SESSION_KEY = 'ff.routeChunkAutoReload'

interface Props {
    children: ReactNode
    routeKey?: string
}

interface State {
    hasError: boolean
    chunkLoadError: boolean
    autoReloading: boolean
}

/**
 * Catches lazy-route dynamic import failures (stale chunk hash after deploy).
 * Without a boundary React leaves the shell blank — Suspense does not handle rejections.
 */
class RouteChunkErrorBoundary extends Component<Props, State> {
    state: State = {
        hasError: false,
        chunkLoadError: false,
        autoReloading: false,
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        const chunkLoadError = isChunkLoadError(error)
        return { hasError: true, chunkLoadError }
    }

    componentDidCatch(error: Error, info: { componentStack?: string }) {
        console.error(
            '[route-chunk] failed to load',
            this.props.routeKey ?? 'unknown',
            error,
            info.componentStack,
        )

        if (
            isChunkLoadError(error) &&
            typeof window !== 'undefined' &&
            !sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY)
        ) {
            sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, '1')
            this.setState({ autoReloading: true })
            window.location.reload()
        }
    }

    render() {
        if (this.state.autoReloading) {
            return (
                <div className="flex min-h-[50vh] items-center justify-center">
                    <Loading loading className="w-full" />
                </div>
            )
        }

        if (!this.state.hasError) {
            return this.props.children
        }

        const title = this.state.chunkLoadError
            ? 'Страница устарела'
            : 'Не удалось открыть страницу'

        const description = this.state.chunkLoadError
            ? 'Приложение обновилось, пока вкладка была открыта. Обновите страницу, чтобы загрузить актуальную версию.'
            : 'Произошла ошибка при загрузке экрана. Попробуйте обновить страницу.'

        return (
            <div className="flex min-h-[50vh] items-center justify-center p-6">
                <Card className="max-w-lg w-full p-8 text-center space-y-4">
                    <h1 className="text-lg font-semibold">{title}</h1>
                    <p className="text-sm text-gray-500">{description}</p>
                    <span {...qa('host.routeChunk.reload')}>
                        <Button
                            variant="solid"
                            onClick={() => {
                                sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY)
                                window.location.reload()
                            }}
                        >
                            Обновить страницу
                        </Button>
                    </span>
                </Card>
            </div>
        )
    }
}

export default RouteChunkErrorBoundary
