import { Suspense, useEffect, useCallback, useRef } from 'react'
import { useRouteKeyStore } from '@/store/routeKeyStore'
import { useLocation } from 'react-router'
import { useThemeStore } from '@/store/themeStore'
import usePortfolioProjectGuard from '@/utils/hooks/usePortfolioProjectGuard'
import Loading from '@/components/shared/Loading'
import RouteChunkErrorBoundary from '@/components/route/RouteChunkErrorBoundary'
import type { LayoutType } from '@/@types/theme'
import type { ComponentType } from 'react'

const APP_NAME = 'Fairflow'

export type AppRouteProps<T> = {
    component: ComponentType<T>
    routeKey: string
    layout?: LayoutType
    pageTitle?: string
}

const AppRoute = <T extends Record<string, unknown>>({
    component: Component,
    routeKey,
    pageTitle,
    ...props
}: AppRouteProps<T>) => {
    const location = useLocation()
    usePortfolioProjectGuard()

    useEffect(() => {
        document.title = pageTitle ? `${pageTitle} — ${APP_NAME}` : APP_NAME
    }, [location.pathname, pageTitle])

    const layout = useThemeStore((state) => state.layout)
    const setPreviousLayout = useThemeStore((state) => state.setPreviousLayout)
    const setLayout = useThemeStore((state) => state.setLayout)

    const { type: layoutType, previousType: previousLayout } = layout

    const setCurrentRouteKey = useRouteKeyStore(
        (state) => state.setCurrentRouteKey,
    )

    const handleLayoutChange = useCallback(() => {
        setCurrentRouteKey(routeKey)

        if (props.layout && props.layout !== layoutType) {
            setPreviousLayout(layoutType)
            setLayout(props.layout)
        }

        if (!props.layout && previousLayout && layoutType !== previousLayout) {
            setLayout(previousLayout)
            setPreviousLayout('')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.layout, routeKey])

    useEffect(() => {
        handleLayoutChange()
    }, [location, handleLayoutChange])

    const wrapperRef = useRef<HTMLDivElement>(null)
    const isFirstRender = useRef(true)
    useEffect(() => {
        isFirstRender.current = false
    }, [])

    const handleAnimationEnd = useCallback(() => {
        if (wrapperRef.current) {
            wrapperRef.current.style.animation = 'none'
        }
    }, [])

    return (
        <div
            key={location.pathname}
            ref={wrapperRef}
            className={isFirstRender.current ? undefined : 'animate-page-fade-in'}
            onAnimationEnd={handleAnimationEnd}
        >
            <RouteChunkErrorBoundary routeKey={routeKey}>
                <Suspense
                    fallback={<Loading loading className="w-full min-h-[40vh]" />}
                >
                    <Component {...(props as T)} />
                </Suspense>
            </RouteChunkErrorBoundary>
        </div>
    )
}

export default AppRoute
