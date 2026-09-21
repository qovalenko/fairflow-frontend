import classNames from '@/utils/classNames'
import ScrollBar from '@/components/ui/ScrollBar'
import Logo from '@/components/template/Logo'
import { APP_DISPLAY_NAME } from '@/constants/app.constant'
import VerticalMenuContent from '@/components/template/VerticalMenuContent'
import Spinner from '@/components/ui/Spinner'
import { useThemeStore } from '@/store/themeStore'
import { useSessionUser } from '@/store/authStore'
import { useRouteKeyStore } from '@/store/routeKeyStore'
import { useNavigationConfigWithState } from '@/utils/hooks/useNavigationConfig'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import appConfig from '@/configs/app.config'
import { Link } from 'react-router'
import type { ReactNode } from 'react'
import {
    SIDE_NAV_WIDTH,
    SIDE_NAV_COLLAPSED_WIDTH,
    SIDE_NAV_CONTENT_GUTTER,
    HEADER_HEIGHT,
    LOGO_X_GUTTER,
} from '@/constants/theme.constant'
import type { Mode } from '@/@types/theme'
import { qa, type QaAttributes } from '@/shared/qa'

type SideNavProps = {
    translationSetup?: boolean
    background?: boolean
    className?: string
    contentClass?: string
    mode?: Mode
    /** false = коллапсы (Портфель, Организация, Проекты) как раскрывающиеся разделы с подменю */
    simplifyCollapse?: boolean
}

const sideNavStyle = {
    width: SIDE_NAV_WIDTH,
    minWidth: SIDE_NAV_WIDTH,
}

const sideNavCollapseStyle = {
    width: SIDE_NAV_COLLAPSED_WIDTH,
    minWidth: SIDE_NAV_COLLAPSED_WIDTH,
}

const SideNav = ({
    translationSetup = appConfig.activeNavTranslation,
    background = true,
    className,
    contentClass,
    mode,
    simplifyCollapse = true,
}: SideNavProps) => {
    const defaultMode = useThemeStore((state) => state.mode)
    const direction = useThemeStore((state) => state.direction)
    const sideNavCollapse = useThemeStore(
        (state) => state.layout.sideNavCollapse,
    )

    const currentRouteKey = useRouteKeyStore((state) => state.currentRouteKey)

    const userAuthority = useSessionUser((state) => state.user.authority)

    const {
        tree: navigationTree,
        isLoading: navLoading,
        error: navError,
        isEmpty: navEmpty,
    } = useNavigationConfigWithState()
    const resolvedProjectId = useResolvedProjectId()

    return (
        <div
            style={sideNavCollapse ? sideNavCollapseStyle : sideNavStyle}
            className={classNames(
                'side-nav',
                background && 'side-nav-bg',
                !sideNavCollapse && 'side-nav-expand',
                className,
            )}
            {...qa('host.sidebar')}
        >
            <Link
                to={appConfig.authenticatedEntryPath}
                className="side-nav-header flex flex-col justify-center"
                style={{ height: HEADER_HEIGHT }}
            >
                <div
                    className={classNames(
                        'flex items-center gap-2',
                        sideNavCollapse && 'justify-center',
                        sideNavCollapse
                            ? SIDE_NAV_CONTENT_GUTTER
                            : LOGO_X_GUTTER,
                    )}
                >
                    <Logo
                        imgClass="max-h-10"
                        mode={mode || defaultMode}
                        type={sideNavCollapse ? 'streamline' : 'full'}
                        className={classNames(
                            sideNavCollapse && 'ltr:ml-[11.5px] ltr:mr-[11.5px]',
                            !sideNavCollapse && 'shrink-0',
                        )}
                    />
                    {!sideNavCollapse && (
                        <span
                            className={classNames(
                                'font-semibold text-base truncate',
                                mode === 'dark'
                                    ? 'text-gray-100'
                                    : 'text-gray-900 dark:text-gray-100',
                            )}
                        >
                            {APP_DISPLAY_NAME}
                        </span>
                    )}
                </div>
            </Link>
            <div className={classNames('side-nav-content', contentClass)}>
                <ScrollBar style={{ height: '100%' }} direction={direction}>
                    {navLoading ? (
                        <SideNavMenuState collapsed={sideNavCollapse} {...qa('host.sidebar.loading')}>
                            <Spinner size={20} />
                            {!sideNavCollapse && <span>Загрузка меню…</span>}
                        </SideNavMenuState>
                    ) : navError ? (
                        <SideNavMenuState collapsed={sideNavCollapse} {...qa('host.sidebar.error')}>
                            {!sideNavCollapse && (
                                <span className="text-center">
                                    Не удалось загрузить меню модулей
                                </span>
                            )}
                        </SideNavMenuState>
                    ) : navEmpty ? (
                        <SideNavMenuState collapsed={sideNavCollapse} {...qa('host.sidebar.empty')}>
                            {!sideNavCollapse && (
                                <span className="text-center">
                                    Нет доступных модулей в проекте
                                </span>
                            )}
                        </SideNavMenuState>
                    ) : (
                        <VerticalMenuContent
                            collapsed={sideNavCollapse}
                            navigationTree={navigationTree}
                            routeKey={currentRouteKey}
                            direction={direction}
                            translationSetup={translationSetup}
                            userAuthority={userAuthority || []}
                            simplifyCollapse={simplifyCollapse}
                            hasProject={Boolean(resolvedProjectId)}
                        />
                    )}
                </ScrollBar>
            </div>
        </div>
    )
}

/** Loading / error / empty placeholder shown in place of the menu tree. */
const SideNavMenuState = ({
    collapsed,
    children,
    ...rest
}: {
    collapsed: boolean
    children: ReactNode
} & QaAttributes) => (
    <div
        className={classNames(
            'flex flex-col items-center gap-2 text-sm text-gray-500 dark:text-gray-400',
            collapsed ? 'px-2 py-4' : 'px-4 py-6',
        )}
        role="status"
        aria-live="polite"
        {...rest}
    >
        {children}
    </div>
)

export default SideNav
