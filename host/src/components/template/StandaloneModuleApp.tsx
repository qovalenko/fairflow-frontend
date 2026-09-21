import React, { useEffect, useMemo } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router'
import Theme from '@/components/template/Theme'
import { qa, qaWithAlias } from '@/shared/qa'
import { AuthProvider, useAuth } from '@/auth'
import { REDIRECT_URL_KEY } from '@/constants/app.constant'
import appConfig from '@/configs/app.config'
import { useSessionUser, useToken } from '@/store/authStore'

const normalizeBase = (value: string): string => {
    const trimmed = value.trim()
    if (!trimmed) return '/'
    if (trimmed === '/') return '/'
    return trimmed.startsWith('/') ? trimmed.replace(/\/$/, '') : `/${trimmed.replace(/\/$/, '')}`
}

const normalizePath = (value: string): string => {
    const trimmed = value.trim()
    if (!trimmed) return '/'
    if (trimmed === '/') return '/'
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
    return withLeadingSlash.replace(/\/$/, '')
}

const standaloneRootQaId = (modulePath: string): string => {
    const slug = normalizePath(modulePath).replace(/^\//, '').split('/')[0]
    return slug ? `${slug}.standalone.root` : 'host.standalone.root'
}

const readTokenFromHash = (hash: string): string => {
    const value = hash.startsWith('#') ? hash.slice(1) : hash
    if (!value) return ''
    const hashParams = new URLSearchParams(value)
    return (
        hashParams.get('accessToken')?.trim() ||
        hashParams.get('token')?.trim() ||
        hashParams.get('jwt')?.trim() ||
        ''
    )
}

const buildAuthRedirectUrl = (loginUrl: string, targetPath: string): string => {
    if (/^https?:\/\//.test(loginUrl)) {
        const url = new URL(loginUrl)
        url.searchParams.set(REDIRECT_URL_KEY, targetPath)
        return url.toString()
    }
    const separator = loginUrl.includes('?') ? '&' : '?'
    return `${loginUrl}${separator}${REDIRECT_URL_KEY}=${encodeURIComponent(targetPath)}`
}

type StandaloneModuleAppProps = {
    moduleTitle: string
    modulePath: string
    crmUrl?: string
    ModuleComponent: React.ComponentType
}

type StandaloneProtectedRouteProps = {
    loginUrl: string
    crmUrl: string
}

const skipStandaloneAuth = import.meta.env.VITE_STANDALONE_SKIP_AUTH === 'true'
const enableStandaloneLoginRedirect =
    import.meta.env.PROD || import.meta.env.VITE_STANDALONE_LOGIN_REDIRECT === 'true'

const bootstrapStandaloneToken = () => {
    if (skipStandaloneAuth) return
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    const tokenFromSearch =
        url.searchParams.get('accessToken')?.trim() ||
        url.searchParams.get('token')?.trim() ||
        url.searchParams.get('jwt')?.trim() ||
        ''
    const tokenFromHash = readTokenFromHash(url.hash)
    const incomingToken = tokenFromSearch || tokenFromHash
    if (!incomingToken) return

    const { setToken } = useToken()
    setToken(incomingToken)
    useSessionUser.getState().setSessionSignedIn(true)

    url.searchParams.delete('accessToken')
    url.searchParams.delete('token')
    url.searchParams.delete('jwt')

    if (url.hash) {
        const hashValue = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
        const hashParams = new URLSearchParams(hashValue)
        hashParams.delete('accessToken')
        hashParams.delete('token')
        hashParams.delete('jwt')
        const nextHash = hashParams.toString()
        url.hash = nextHash ? `#${nextHash}` : ''
    }

    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

const StandaloneProtectedRoute = ({
    loginUrl,
    crmUrl,
}: StandaloneProtectedRouteProps) => {
    if (skipStandaloneAuth) return <Outlet />

    const { authenticated } = useAuth()
    const location = useLocation()

    const redirectUrl = useMemo(
        () =>
            buildAuthRedirectUrl(
                loginUrl,
                `${location.pathname}${location.search}${location.hash}`,
            ),
        [location.pathname, location.search, location.hash, loginUrl],
    )

    useEffect(() => {
        if (!authenticated && enableStandaloneLoginRedirect) {
            window.location.assign(redirectUrl)
        }
    }, [authenticated, redirectUrl])

    if (!authenticated) {
        if (enableStandaloneLoginRedirect) return null
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900" {...qa('host.standalone.authGate')}>
                <div className="mx-auto w-full max-w-[720px] px-4 py-16">
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 sm:p-8">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            Нужен токен для standalone-режима
                        </h2>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                            Передайте токен в URL (`?accessToken=...` или `#accessToken=...`) и
                            обновите страницу. Внешний редирект на login отключен.
                        </p>
                        <div className="mt-4 flex items-center gap-2">
                            <a
                                href={redirectUrl}
                                className="inline-flex items-center rounded-lg bg-gray-900 dark:bg-gray-100 px-3 py-1.5 text-sm font-medium text-white dark:text-gray-900"
                                {...qa('host.standalone.openLogin')}
                            >
                                Открыть login
                            </a>
                            <a
                                href={crmUrl}
                                className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                {...qa('host.standalone.openCrm')}
                            >
                                Открыть CRM
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    return <Outlet />
}

type StandaloneShellProps = {
    moduleTitle: string
    modulePath: string
    crmUrl: string
    ModuleComponent: React.ComponentType
}

const StandaloneShell = ({
    moduleTitle,
    modulePath,
    crmUrl,
    ModuleComponent,
}: StandaloneShellProps) => {
    const { user, signOut } = useAuth()
    const location = useLocation()
    const normalizedModulePath = normalizePath(modulePath)
    const isProjectScoped = /\/p\/[^/]+/.test(location.pathname)

    return (
        <div
            className="min-h-screen bg-gray-50 dark:bg-gray-900"
            {...qa('host.standalone.shell', {
                module: normalizedModulePath.replace(/^\//, ''),
                scoped: isProjectScoped ? 'pid' : 'global',
            })}
            {...qaWithAlias(
                standaloneRootQaId(normalizedModulePath),
                'host.standalone.shell',
            )}
        >
            <header
                className="sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/90 backdrop-blur"
                {...qa('host.standalone.header')}
            >
                <div className="mx-auto w-full max-w-[1440px] px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Standalone module
                        </div>
                        <div
                            className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate"
                            {...qa('host.standalone.title')}
                        >
                            {moduleTitle}{' '}
                            {location.pathname.startsWith(normalizedModulePath)
                                ? ''
                                : normalizedModulePath}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {user?.userName && (
                            <span className="hidden sm:inline text-sm text-gray-600 dark:text-gray-300">
                                {user.userName}
                            </span>
                        )}
                        <a
                            href={crmUrl}
                            className="inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                            {...qa('host.standalone.openCrm')}
                        >
                            Открыть CRM
                        </a>
                        {!skipStandaloneAuth && (
                            <button
                                type="button"
                                onClick={signOut}
                                className="inline-flex items-center rounded-lg bg-gray-900 dark:bg-gray-100 px-3 py-1.5 text-sm font-medium text-white dark:text-gray-900"
                                {...qa('host.standalone.signOut')}
                            >
                                Выйти
                            </button>
                        )}
                    </div>
                </div>
            </header>
            <main
                className="mx-auto w-full max-w-[1440px] px-4 py-4"
                {...qa('host.standalone.content', {
                    module: normalizedModulePath.replace(/^\//, ''),
                })}
                {...qa('host.standalone.main')}
            >
                <ModuleComponent />
            </main>
        </div>
    )
}

const StandaloneModuleApp = ({
    moduleTitle,
    modulePath,
    crmUrl: crmUrlProp,
    ModuleComponent,
}: StandaloneModuleAppProps) => {
    bootstrapStandaloneToken()

    const normalizedModulePath = normalizePath(modulePath)
    const crmUrl = crmUrlProp?.trim() || import.meta.env.VITE_STANDALONE_CRM_URL?.trim() || '/'
    const loginUrl =
        import.meta.env.VITE_STANDALONE_LOGIN_URL?.trim() ||
        appConfig.unAuthenticatedEntryPath
    const standaloneBasename = normalizeBase(
        import.meta.env.VITE_STANDALONE_BASENAME?.trim() || '/',
    )

    return (
        <Theme>
            <BrowserRouter basename={standaloneBasename}>
                <AuthProvider>
                    <Routes>
                        <Route
                            element={
                                <StandaloneProtectedRoute
                                    loginUrl={loginUrl}
                                    crmUrl={crmUrl}
                                />
                            }
                        >
                            <Route
                                path={`${normalizedModulePath}/*`}
                                element={
                                    <StandaloneShell
                                        moduleTitle={moduleTitle}
                                        modulePath={normalizedModulePath}
                                        crmUrl={crmUrl}
                                        ModuleComponent={ModuleComponent}
                                    />
                                }
                            />
                            <Route
                                path={`/p/:pid${normalizedModulePath}/*`}
                                element={
                                    <StandaloneShell
                                        moduleTitle={moduleTitle}
                                        modulePath={normalizedModulePath}
                                        crmUrl={crmUrl}
                                        ModuleComponent={ModuleComponent}
                                    />
                                }
                            />
                        </Route>
                        <Route path="/" element={<Navigate replace to={normalizedModulePath} />} />
                        <Route
                            path="*"
                            element={<Navigate replace to={normalizedModulePath} />}
                        />
                    </Routes>
                </AuthProvider>
            </BrowserRouter>
        </Theme>
    )
}

export default StandaloneModuleApp
