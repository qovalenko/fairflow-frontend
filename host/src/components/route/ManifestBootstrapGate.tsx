import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { Button, Card } from '@fairflow/shared-ui'
import Loading from '@/components/shared/Loading'
import { isAuthShellRoute } from '@/utils/authShellRoute'

declare global {
    interface Window {
        __MF_MANIFEST_READY__?: Promise<{ remotes?: Record<string, string> }>
        __MF_MANIFEST_FAILED__?: boolean
    }
}

/**
 * TODO-511 — explicit degradation when `/fe-manifest.json` cannot be loaded.
 */
export default function ManifestBootstrapGate({ children }: { children: ReactNode }) {
    const location = useLocation()
    const [ready, setReady] = useState(false)
    const [failed, setFailed] = useState(false)
    const authShellRoute = isAuthShellRoute(location.pathname)

    useEffect(() => {
        const promise = window.__MF_MANIFEST_READY__
        if (!promise) {
            setReady(true)
            return
        }
        promise
            .then((manifest) => {
                const empty = !manifest?.remotes || Object.keys(manifest.remotes).length === 0
                setFailed(Boolean(window.__MF_MANIFEST_FAILED__) || empty)
            })
            .catch(() => setFailed(true))
            .finally(() => setReady(true))
    }, [])

    if (!ready) {
        return (
            <div className="flex flex-auto flex-col h-[100vh]">
                <Loading loading />
            </div>
        )
    }

    // Pre-auth host screens (sign-in, bootstrap, forced logout) must not depend on MF manifest.
    if (failed && authShellRoute) {
        return <>{children}</>
    }

    if (failed) {
        return (
            <div className="flex min-h-screen items-center justify-center p-6">
                <Card className="max-w-lg w-full p-8 text-center space-y-4">
                    <h1 className="text-lg font-semibold">Не удалось загрузить модули</h1>
                    <p className="text-sm text-gray-500">
                        Манифест микрофронтендов недоступен. Оболочка работает в ограниченном
                        режиме — перезагрузите страницу или обратитесь к администратору.
                    </p>
                    <Button variant="solid" onClick={() => window.location.reload()}>
                        Обновить
                    </Button>
                </Card>
            </div>
        )
    }

    return <>{children}</>
}
