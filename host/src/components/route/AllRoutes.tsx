import { lazy, Suspense } from 'react'
import ProtectedRoute from './ProtectedRoute'
import PublicRoute from './PublicRoute'
import AuthorityGuard from './AuthorityGuard'
import PermissionRouteGuard from './PermissionRouteGuard'
import AppRoute from './AppRoute'
import PageContainer from '@/components/template/PageContainer'
import RemoteModuleErrorBoundary from '@/components/shared/RemoteModuleErrorBoundary'
import { protectedRoutes, publicRoutes } from '@/configs/routes.config'
import { useAuth } from '@/auth'
import { Routes, Route } from 'react-router'
import type { LayoutType } from '@/@types/theme'

const Home = lazy(() => import('@/views/Home'))
const NotFound = lazy(() => import('@/views/others/NotFound'))

interface ViewsProps {
    pageContainerType?: 'default' | 'gutterless' | 'contained'
    layout?: LayoutType
}

type AllRoutesProps = ViewsProps

const AllRoutes = (props: AllRoutesProps) => {
    const { user } = useAuth()

    const publicNonRoot = publicRoutes.filter((r) => r.path !== '/')

    return (
        <Routes>
            {/* Public routes (non-root) wrapped in PublicRoute guard */}
            <Route element={<PublicRoute />}>
                {publicNonRoot.map((route) => (
                    <Route
                        key={route.path}
                        path={route.path}
                        element={
                            <AppRoute
                                routeKey={route.key}
                                component={route.component}
                                {...route.meta}
                            />
                        }
                    />
                ))}
            </Route>

            {/* Protected routes */}
            <Route path="/" element={<ProtectedRoute />}>
                {/* "/" for authenticated → Home dispatcher */}
                <Route
                    index
                    element={
                        <Suspense fallback={null}>
                            <Home />
                        </Suspense>
                    }
                />
                {protectedRoutes.map((route, index) => (
                        <Route
                            key={route.key + index}
                            path={route.path}
                            element={
                                <AuthorityGuard
                                    userAuthority={user.authority}
                                    authority={route.authority}
                                >
                                    <PermissionRouteGuard
                                        requires={route.meta?.requires}
                                    >
                                    <PageContainer {...props} {...route.meta}>
                                        {/* Изолируем маршрутный ремоут: недоступный
                                            remoteEntry.js/manifest не роняет host белым
                                            экраном, а показывает fallback (#14). */}
                                        <RemoteModuleErrorBoundary
                                            moduleName={route.key}
                                        >
                                            <AppRoute
                                                routeKey={route.key}
                                                component={route.component}
                                                {...route.meta}
                                            />
                                        </RemoteModuleErrorBoundary>
                                    </PageContainer>
                                    </PermissionRouteGuard>
                                </AuthorityGuard>
                            }
                        />
                    ))}
                {/* Catch-all: любой нераспознанный путь (включая /imports/:id)
                    → ST-9 «Страница не найдена» вместо белого экрана (U1/F2-import). */}
                <Route
                    path="*"
                    element={
                        <PageContainer {...props}>
                            <Suspense
                                fallback={null}
                            >
                                <NotFound />
                            </Suspense>
                        </PageContainer>
                    }
                />
            </Route>
        </Routes>
    )
}

export default AllRoutes
