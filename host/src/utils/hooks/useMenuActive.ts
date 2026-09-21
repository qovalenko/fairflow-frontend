/* eslint-disable @typescript-eslint/no-explicit-any */
// eslint-disable  @typescript-eslint/no-explicit-any
import { useMemo } from 'react'
import isPlainObject from 'lodash/isPlainObject'
import type { NavigationTree } from '@/@types/navigation'

interface NavInfo extends NavigationTree {
    parentKey?: string
}

/** routeKey совпадает с nav (точное или routeKey — потомок nav) */
const isRouteMatching = (navKey: string | undefined, routeKey: string): boolean =>
    !!navKey &&
    (routeKey === navKey || routeKey.startsWith(navKey + '.'))

const getRouteInfo = (
    navTree: NavInfo | NavInfo[],
    key: string,
): NavInfo | undefined => {
    if (!Array.isArray(navTree)) {
        const node = navTree as NavInfo
        if (!node.key) return undefined
        if (node.key === key || isRouteMatching(node.key, key)) {
            // при совпадении по префиксу ищем более точное совпадение в детях (чтобы routeKey "portfolio.deals.list" давал activedRoute = portfolio.deals, а не portfolio)
            if (node.key !== key && node.subMenu?.length) {
                const childMatch = getRouteInfo(node.subMenu, key)
                if (childMatch) return childMatch
            }
            return node
        }
    }
    let activedRoute: NavInfo | undefined
    let isIncludeActivedRoute = false
    for (const p in navTree) {
        if (
            p !== 'icon' &&
            // eslint-disable-next-line no-prototype-builtins
            navTree.hasOwnProperty(p) &&
            typeof (navTree as any)[p] === 'object'
        ) {
            const child = (navTree as any)[p]
            const hasSubMenu = isPlainObject(child) && child.subMenu?.length > 0
            const childMatches = hasSubMenu && child.subMenu.some(
                (el: NavInfo) => el.key === key || isRouteMatching(el.key, key),
            )
            if (childMatches) {
                isIncludeActivedRoute = true
            }

            activedRoute = getRouteInfo(child, key)

            if (activedRoute) {
                if (isIncludeActivedRoute) {
                    activedRoute.parentKey = child.key
                }
                return activedRoute
            }
        }
    }
    return activedRoute
}

const findNestedRoute = (navTree: NavigationTree[], key: string): boolean => {
    const found = navTree.find((node) => {
        return node.key === key || isRouteMatching(node.key, key)
    })
    if (found) {
        return true
    }
    return navTree.some((c) => findNestedRoute(c.subMenu ?? [], key))
}

const getTopRouteKey = (
    navTree: NavigationTree[],
    key: string,
): NavigationTree => {
    let foundNav = {} as NavigationTree
    navTree.forEach((nav) => {
        if (findNestedRoute([nav], key)) {
            foundNav = nav
        }
    })
    return foundNav
}

function useMenuActive(navTree: NavigationTree[], key: string) {
    const activedRoute = useMemo(() => {
        const route = getRouteInfo(navTree, key)
        return route
    }, [navTree, key])

    const includedRouteTree = useMemo(() => {
        const included = getTopRouteKey(navTree, key)
        return included
    }, [navTree, key])

    return { activedRoute, includedRouteTree }
}

export default useMenuActive
