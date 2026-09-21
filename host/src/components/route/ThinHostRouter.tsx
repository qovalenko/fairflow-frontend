import { useEffect, useMemo } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router'

type RedirectRouteConfig = {
    title: string
    modulePath: string
    envUrl?: string
}

const redirectRoutes: RedirectRouteConfig[] = [
    {
        title: 'Statistics',
        modulePath: '/statistics',
        envUrl: import.meta.env.VITE_STANDALONE_STATISTICS_URL,
    },
    {
        title: 'Contacts',
        modulePath: '/contacts',
        envUrl: import.meta.env.VITE_STANDALONE_CONTACTS_URL,
    },
    {
        title: 'Companies',
        modulePath: '/companies',
        envUrl: import.meta.env.VITE_STANDALONE_COMPANIES_URL,
    },
    {
        title: 'Deals',
        modulePath: '/deals',
        envUrl: import.meta.env.VITE_STANDALONE_DEALS_URL,
    },
    {
        title: 'Orders',
        modulePath: '/orders',
        envUrl: import.meta.env.VITE_STANDALONE_ORDERS_URL,
    },
    {
        title: 'Activities',
        modulePath: '/activities',
        envUrl: import.meta.env.VITE_STANDALONE_ACTIVITIES_URL,
    },
    {
        title: 'Products',
        modulePath: '/products',
        envUrl: import.meta.env.VITE_STANDALONE_PRODUCTS_URL,
    },
    {
        title: 'Reports',
        modulePath: '/reports',
        envUrl: import.meta.env.VITE_STANDALONE_REPORTS_URL,
    },
    {
        title: 'Documents',
        modulePath: '/documents',
        envUrl: import.meta.env.VITE_STANDALONE_DOCUMENTS_URL,
    },
    {
        title: 'Automation',
        modulePath: '/automation',
        envUrl: import.meta.env.VITE_STANDALONE_AUTOMATION_URL,
    },
]

const resolveModuleTarget = (modulePath: string, envUrl?: string): URL => {
    if (envUrl?.trim()) {
        return new URL(envUrl.trim(), window.location.origin)
    }
    return new URL(modulePath, window.location.origin)
}

type ModuleRedirectProps = {
    title: string
    modulePath: string
    envUrl?: string
}

const ModuleRedirect = ({ title, modulePath, envUrl }: ModuleRedirectProps) => {
    const location = useLocation()

    const targetHref = useMemo(() => {
        const moduleTarget = resolveModuleTarget(modulePath, envUrl)
        const tail = location.pathname.startsWith(modulePath)
            ? location.pathname.slice(modulePath.length)
            : ''
        const normalizedTail = tail.startsWith('/') ? tail : tail ? `/${tail}` : ''
        const basePath = moduleTarget.pathname.endsWith('/')
            ? moduleTarget.pathname.slice(0, -1)
            : moduleTarget.pathname
        const destinationPath = `${basePath}${normalizedTail}`
        return `${moduleTarget.origin}${destinationPath}${location.search}${location.hash}`
    }, [envUrl, location.hash, location.pathname, location.search, modulePath])

    const currentHref = useMemo(
        () => `${window.location.origin}${location.pathname}${location.search}${location.hash}`,
        [location.hash, location.pathname, location.search],
    )
    const canRedirect = targetHref !== currentHref

    useEffect(() => {
        if (canRedirect) {
            window.location.assign(targetHref)
        }
    }, [canRedirect, targetHref])

    if (canRedirect) return null

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-8">
            <div className="mx-auto max-w-[960px] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    Standalone URL не настроен
                </h1>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    Для модуля <span className="font-semibold">{title}</span> host не знает внешний
                    адрес standalone и попадает в self-redirect.
                </p>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                    Установите env-переменную для модуля (например, `VITE_STANDALONE_LANDING_URL`)
                    и перезапустите host.
                </p>
                <div className="mt-4">
                    <Link
                        to="/"
                        className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                        Назад к launcher
                    </Link>
                </div>
            </div>
        </div>
    )
}

const loginUrl =
    import.meta.env.VITE_STANDALONE_LOGIN_URL?.trim() ||
    `${window.location.origin}/auth/signin`

const LoginRedirect = () => {
    useEffect(() => {
        window.location.assign(loginUrl)
    }, [])

    return null
}

const ThinHostRouter = () => {
    return (
        <Routes>
            <Route
                path="/"
                element={
                    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-8">
                        <div className="mx-auto max-w-[960px] rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
                            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                                Host Thin Router Mode
                            </h1>
                            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                Host работает как launchpad и перенаправляет в standalone
                                микрофронты.
                            </p>
                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {redirectRoutes.map((route) => (
                                    <Link
                                        key={route.modulePath}
                                        to={route.modulePath}
                                        className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    >
                                        {route.title}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                }
            />
            {redirectRoutes.map((route) => (
                <Route
                    key={route.modulePath}
                    path={`${route.modulePath}/*`}
                    element={
                        <ModuleRedirect
                            title={route.title}
                            modulePath={route.modulePath}
                            envUrl={route.envUrl}
                        />
                    }
                />
            ))}
            <Route path="/auth/*" element={<LoginRedirect />} />
            <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
    )
}

export default ThinHostRouter
