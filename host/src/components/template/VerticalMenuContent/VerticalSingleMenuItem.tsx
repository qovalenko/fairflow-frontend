import Menu from '@/components/ui/Menu'
import AuthorityCheck from '@/components/shared/AuthorityCheck'
import Slot from '@/components/shared/Slot'
import useSlotContributions from '@/utils/hooks/useSlotContributions'
import { qa } from '@/shared/qa'
import VerticalMenuIcon from './VerticalMenuIcon'
import Badge from '@/components/ui/Badge'
import { Link } from 'react-router'
import Dropdown from '@/components/ui/Dropdown'
import type { CommonProps } from '@/@types/common'
import type { Direction } from '@/@types/theme'
import type { NavigationTree } from '@/@types/navigation'

const { MenuItem } = Menu

interface CollapsedItemProps extends CommonProps {
    nav: NavigationTree
    direction?: Direction
    onLinkClick?: (link: { key: string; title: string; path: string }) => void
    t: (
        key: string,
        fallback?: string | Record<string, string | number>,
    ) => string
    renderAsIcon?: boolean
    userAuthority: string[]
    currentKey?: string
    parentKeys?: string[]
    disabled?: boolean
}

interface DefaultItemProps {
    nav: NavigationTree
    onLinkClick?: (link: { key: string; title: string; path: string }) => void
    sideCollapsed?: boolean
    t: (
        key: string,
        fallback?: string | Record<string, string | number>,
    ) => string
    indent?: boolean
    userAuthority: string[]
    showIcon?: boolean
    showTitle?: boolean
    disabled?: boolean
}

interface VerticalMenuItemProps extends CollapsedItemProps, DefaultItemProps {}

const DISABLED_MENU_CLASS = 'opacity-60 cursor-not-allowed pointer-events-none'

const CollapsedItem = ({
    nav,
    children,
    direction: _direction,
    renderAsIcon,
    onLinkClick,
    userAuthority,
    t,
    currentKey,
    disabled,
}: CollapsedItemProps) => {
    const title = t(nav.translateKey, nav.title)
    return (
        <AuthorityCheck userAuthority={userAuthority} authority={nav.authority}>
            {renderAsIcon ? (
                <span title={title} className={disabled ? DISABLED_MENU_CLASS : undefined}>
                    {children}
                </span>
            ) : (
                <Dropdown.Item active={currentKey === nav.key}>
                    {nav.path && !disabled ? (
                        <Link
                            className="h-full w-full flex items-center outline-hidden"
                            to={nav.path}
                            target={nav.isExternalLink ? '_blank' : ''}
                            onClick={() =>
                                onLinkClick?.({
                                    key: nav.key,
                                    title: nav.title,
                                    path: nav.path,
                                })
                            }
                        >
                            <span>{t(nav.translateKey, nav.title)}</span>
                        </Link>
                    ) : (
                        <span className={disabled ? DISABLED_MENU_CLASS : undefined}>
                            {t(nav.translateKey, nav.title)}
                        </span>
                    )}
                </Dropdown.Item>
            )}
        </AuthorityCheck>
    )
}

const DefaultItem = (props: DefaultItemProps) => {
    const {
        nav,
        onLinkClick,
        sideCollapsed: _sideCollapsed,
        showTitle,
        indent,
        showIcon = true,
        userAuthority,
        t,
        disabled,
    } = props

    const iconOnly = !showTitle && showIcon
    const badgeContributions = useSlotContributions('nav.item.badge')
    const myBadges = nav.moduleKey
        ? badgeContributions.filter((c) => c.wired && c.moduleId === nav.moduleKey)
        : []

    const content = (
        <>
            {showIcon && <VerticalMenuIcon icon={nav.icon} />}
            {showTitle && (
                <>
                    <span>{t(nav.translateKey, nav.title)}</span>
                    {nav.badge != null && nav.badge > 0 && (
                        <Badge
                            content={nav.badge}
                            className="ml-auto shrink-0 bg-red-500 text-white text-xs min-w-[1.25rem]"
                            {...qa('host.sidebar.badge', { nav: nav.key })}
                        />
                    )}
                    {myBadges.length > 0 && (
                        <span className="ml-auto shrink-0 flex items-center gap-1">
                            {myBadges.map((c) => (
                                <Slot
                                    key={c.key}
                                    id="nav.item.badge"
                                    only={c.key}
                                    context={{ moduleId: nav.moduleKey }}
                                    pending={null}
                                />
                            ))}
                        </span>
                    )}
                </>
            )}
        </>
    )

    const linkClass = iconOnly
        ? 'flex items-center justify-center h-full w-full'
        : 'flex items-center gap-2 h-full w-full'

    return (
        <AuthorityCheck userAuthority={userAuthority} authority={nav.authority}>
            <MenuItem
                key={nav.key}
                eventKey={nav.key}
                dotIndent={indent}
                className={iconOnly ? 'justify-center !px-0' : undefined}
            >
                {disabled ? (
                    <span
                        aria-disabled
                        className={DISABLED_MENU_CLASS + ' ' + linkClass}
                        {...qa('host.sidebar.item', { nav: nav.key })}
                    >
                        {content}
                    </span>
                ) : (
                    <Link
                        to={nav.path}
                        className={linkClass}
                        target={nav.isExternalLink ? '_blank' : ''}
                        {...qa('host.sidebar.item', { nav: nav.key })}
                        onClick={() =>
                            onLinkClick?.({
                                key: nav.key,
                                title: nav.title,
                                path: nav.path,
                            })
                        }
                    >
                        {content}
                    </Link>
                )}
            </MenuItem>
        </AuthorityCheck>
    )
}

const VerticalSingleMenuItem = ({
    nav,
    onLinkClick,
    sideCollapsed,
    direction,
    indent,
    renderAsIcon,
    userAuthority,
    showIcon,
    showTitle,
    t,
    currentKey,
    parentKeys,
    disabled,
}: Omit<VerticalMenuItemProps, 'title' | 'translateKey'>) => {
    return (
        <>
            {sideCollapsed ? (
                <CollapsedItem
                    currentKey={currentKey}
                    parentKeys={parentKeys}
                    nav={nav}
                    direction={direction}
                    renderAsIcon={renderAsIcon}
                    userAuthority={userAuthority}
                    t={t}
                    disabled={disabled}
                    onLinkClick={onLinkClick}
                >
                    <DefaultItem
                        nav={nav}
                        sideCollapsed={sideCollapsed}
                        userAuthority={userAuthority}
                        showIcon={showIcon}
                        showTitle={showTitle}
                        t={t}
                        disabled={disabled}
                        onLinkClick={onLinkClick}
                    />
                </CollapsedItem>
            ) : (
                <DefaultItem
                    nav={nav}
                    sideCollapsed={sideCollapsed}
                    userAuthority={userAuthority}
                    showIcon={showIcon}
                    showTitle={showTitle}
                    indent={indent}
                    t={t}
                    disabled={disabled}
                    onLinkClick={onLinkClick}
                />
            )}
        </>
    )
}

export default VerticalSingleMenuItem
