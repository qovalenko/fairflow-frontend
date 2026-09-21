import { useState, useEffect, useMemo, Fragment } from 'react'
import Menu from '@/components/ui/Menu'
import VerticalSingleMenuItem from './VerticalSingleMenuItem'
import VerticalCollapsedMenuItem from './VerticalCollapsedMenuItem'
import AuthorityCheck from '@/components/shared/AuthorityCheck'
import { themeConfig } from '@/configs/theme.config'
import {
    NAV_ITEM_TYPE_TITLE,
    NAV_ITEM_TYPE_COLLAPSE,
    NAV_ITEM_TYPE_ITEM,
} from '@/constants/navigation.constant'
import useMenuActive from '@/utils/hooks/useMenuActive'
import useTranslation from '@/utils/hooks/useTranslation'
import { Direction } from '@/@types/theme'
import type { NavigationTree } from '@/@types/navigation'
import type { TraslationFn } from '@/@types/common'

export interface VerticalMenuContentProps {
    collapsed?: boolean
    routeKey: string
    navigationTree?: NavigationTree[]
    onMenuItemClick?: () => void
    direction?: Direction
    translationSetup?: boolean
    userAuthority: string[]
    /** В мобильном меню: коллапсы (Сделки, Продажи) рендерятся как простая ссылка на список */
    simplifyCollapse?: boolean
    /** Если false, пункты с requiresProject отображаются неактивными (не кликабельными) */
    hasProject?: boolean
}

const { MenuGroup } = Menu

const MAX_CASCADE_LEVEL = 2

const VerticalMenuContent = (props: VerticalMenuContentProps) => {
    const {
        collapsed,
        routeKey,
        navigationTree = [],
        onMenuItemClick,
        direction = themeConfig.direction,
        translationSetup,
        userAuthority,
        simplifyCollapse = true,
        hasProject = true,
    } = props

    const { t } = useTranslation(!translationSetup)

    const [defaulExpandKey, setDefaulExpandKey] = useState<string[]>([])

    const { activedRoute } = useMenuActive(navigationTree, routeKey)

    const activeKeys = useMemo(() => {
        const keys: string[] = []
        if (activedRoute?.key) keys.push(activedRoute.key)
        if (activedRoute?.parentKey) keys.push(activedRoute.parentKey)
        if (simplifyCollapse && routeKey) {
            const collectParentKeys = (tree: NavigationTree[]) => {
                tree.forEach((nav) => {
                    if (
                        nav.type === NAV_ITEM_TYPE_COLLAPSE &&
                        nav.key &&
                        routeKey !== nav.key &&
                        (routeKey === nav.key || routeKey.startsWith(nav.key + '.'))
                    ) {
                        keys.push(nav.key)
                    }
                    if (nav.subMenu?.length) {
                        collectParentKeys(nav.subMenu)
                    }
                })
            }
            collectParentKeys(navigationTree)
        }
        return [...new Set(keys)]
    }, [activedRoute, routeKey, simplifyCollapse, navigationTree])

    useEffect(() => {
        if (activedRoute?.parentKey) {
            setDefaulExpandKey([activedRoute?.parentKey])
        }
    }, [activedRoute?.parentKey])

    const handleLinkClick = () => {
        onMenuItemClick?.()
    }

    const renderNavigation = (
        navTree: NavigationTree[],
        cascade: number = 0,
        indent?: boolean,
    ) => {
        const nextCascade = cascade + 1

        return (
            <>
                {navTree.map((nav) => (
                    <Fragment key={nav.key}>
                        {nav.type === NAV_ITEM_TYPE_ITEM && (
                            <VerticalSingleMenuItem
                                key={nav.key}
                                currentKey={activedRoute?.key}
                                parentKeys={defaulExpandKey}
                                nav={nav}
                                sideCollapsed={collapsed}
                                direction={direction}
                                indent={indent}
                                renderAsIcon={collapsed ? true : cascade <= 0}
                                showIcon={true}
                                userAuthority={userAuthority}
                                showTitle={collapsed ? false : cascade <= MAX_CASCADE_LEVEL}
                                t={t as TraslationFn}
                                disabled={!hasProject && !!nav.requiresProject}
                                onLinkClick={handleLinkClick}
                            />
                        )}
                        {nav.type === NAV_ITEM_TYPE_COLLAPSE &&
                            (simplifyCollapse && nav.subMenu?.[0] ? (
                                <VerticalSingleMenuItem
                                    key={nav.key}
                                    currentKey={activedRoute?.key}
                                    parentKeys={defaulExpandKey}
                                    nav={{
                                        ...nav,
                                        path: nav.subMenu[0].path,
                                        type: NAV_ITEM_TYPE_ITEM,
                                    }}
                                    sideCollapsed={collapsed}
                                    direction={direction}
                                    indent={indent}
                                    renderAsIcon={cascade <= 0}
                                    showIcon={true}
                                    userAuthority={userAuthority}
                                    showTitle={collapsed ? cascade >= 1 : cascade <= MAX_CASCADE_LEVEL}
                                    t={t as TraslationFn}
                                    disabled={!hasProject && !!nav.requiresProject}
                                    onLinkClick={handleLinkClick}
                                />
                            ) : (
                                <VerticalCollapsedMenuItem
                                    key={nav.key}
                                    currentKey={activedRoute?.key}
                                    parentKeys={defaulExpandKey}
                                    nav={nav}
                                    sideCollapsed={collapsed}
                                    direction={direction}
                                    indent={nextCascade >= MAX_CASCADE_LEVEL}
                                    dotIndent={nextCascade >= MAX_CASCADE_LEVEL}
                                    renderAsIcon={nextCascade <= 1}
                                    userAuthority={userAuthority}
                                    t={t as TraslationFn}
                                    onLinkClick={onMenuItemClick}
                                >
                                    {nav.subMenu &&
                                        nav.subMenu.length > 0 &&
                                        renderNavigation(
                                            nav.subMenu,
                                            nextCascade,
                                            true,
                                        )}
                                </VerticalCollapsedMenuItem>
                            ))}
                        {nav.type === NAV_ITEM_TYPE_TITLE && (
                            <AuthorityCheck
                                userAuthority={userAuthority}
                                authority={nav.authority}
                            >
                                <MenuGroup
                                    key={nav.key}
                                    label={t(nav.translateKey) || nav.title}
                                >
                                    {nav.subMenu &&
                                        nav.subMenu.length > 0 &&
                                        renderNavigation(
                                            nav.subMenu,
                                            nextCascade,
                                            false,
                                        )}
                                </MenuGroup>
                            </AuthorityCheck>
                        )}
                    </Fragment>
                ))}
            </>
        )
    }

    return (
        <Menu
            className={collapsed ? 'px-2 pb-4' : 'px-4 pb-4'}
            sideCollapsed={collapsed}
            defaultActiveKeys={activeKeys}
            defaultExpandedKeys={defaulExpandKey}
            defaultCollapseActiveKeys={
                activedRoute?.parentKey ? [activedRoute.parentKey] : []
            }
        >
            {renderNavigation(navigationTree, 0)}
        </Menu>
    )
}

export default VerticalMenuContent
