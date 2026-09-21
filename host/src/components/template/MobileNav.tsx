import { useState, useEffect, Suspense, lazy } from 'react'
import classNames from 'classnames'
import Drawer from '@/components/ui/Drawer'
import NavToggle from '@/components/shared/NavToggle'
import { DIR_RTL } from '@/constants/theme.constant'
import { APP_DISPLAY_NAME } from '@/constants/app.constant'
import withHeaderItem, { WithHeaderItemProps } from '@/utils/hoc/withHeaderItem'
import useResponsive from '@/utils/hooks/useResponsive'
import {
    useNavigationConfigWithState,
} from '@/utils/hooks/useNavigationConfig'
import Loading from '@/components/shared/Loading'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import appConfig from '@/configs/app.config'
import { useThemeStore } from '@/store/themeStore'
import { useRouteKeyStore } from '@/store/routeKeyStore'
import { useSessionUser } from '@/store/authStore'
import { qa } from '@/shared/qa'

const VerticalMenuContent = lazy(
    () => import('@/components/template/VerticalMenuContent'),
)

type MobileNavToggleProps = {
    toggled?: boolean
}

type MobileNavProps = {
    translationSetup?: boolean
}

const MobileNavToggle = withHeaderItem<
    MobileNavToggleProps & WithHeaderItemProps
>(NavToggle)

const MobileNav = ({
    translationSetup = appConfig.activeNavTranslation,
}: MobileNavProps) => {
    const [isOpen, setIsOpen] = useState(false)
    const { larger } = useResponsive()

    useEffect(() => {
        if (larger.lg && isOpen) setIsOpen(false)
    }, [larger.lg, isOpen])

    const handleOpenDrawer = () => {
        setIsOpen(true)
    }

    const handleDrawerClose = () => {
        setIsOpen(false)
    }

    const direction = useThemeStore((state) => state.direction)
    const currentRouteKey = useRouteKeyStore((state) => state.currentRouteKey)

    const userAuthority = useSessionUser((state) => state.user.authority)

    const { tree: navigationTree, isLoading: navLoading } =
        useNavigationConfigWithState()
    const resolvedProjectId = useResolvedProjectId()

    return (
        <>
            <div className="text-2xl" onClick={handleOpenDrawer} {...qa('host.sidebar.mobileToggle')}>
                <MobileNavToggle toggled={isOpen} />
            </div>
            <Drawer
                title={APP_DISPLAY_NAME}
                isOpen={isOpen}
                bodyClass={classNames('p-0')}
                width={330}
                placement={direction === DIR_RTL ? 'right' : 'left'}
                onClose={handleDrawerClose}
                onRequestClose={handleDrawerClose}
            >
                <Suspense fallback={<></>}>
                    {isOpen &&
                        (navLoading ? (
                            <div className="flex justify-center p-6">
                                <Loading loading={true} />
                            </div>
                        ) : (
                            <VerticalMenuContent
                                collapsed={false}
                                navigationTree={navigationTree}
                                routeKey={currentRouteKey}
                                userAuthority={userAuthority as string[]}
                                direction={direction}
                                translationSetup={translationSetup}
                                simplifyCollapse={false}
                                hasProject={Boolean(resolvedProjectId)}
                                onMenuItemClick={handleDrawerClose}
                            />
                        ))}
                </Suspense>
            </Drawer>
        </>
    )
}

export default MobileNav
