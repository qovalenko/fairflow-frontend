import classNames from 'classnames'
import type { ReactNode } from 'react'
import { openUserProfile } from '@/components/shared/userProfileBridge'
import { qa } from '@/shared/qa'

type UserProfileLinkProps = {
    userId?: string | null
    children: ReactNode
    className?: string
    /** When true, suppress navigation and only open the drawer. */
    drawerOnly?: boolean
}

/**
 * Opens the colleague mini-profile drawer (FR-PROFILE-320 / global.drawer.entity).
 */
export default function UserProfileLink({
    userId,
    children,
    className,
    drawerOnly = false,
}: UserProfileLinkProps) {
    const id = userId?.trim()
    if (!id) return <>{children}</>

    return (
        <button
            type="button"
            className={classNames(
                'text-left hover:text-primary hover:underline cursor-pointer',
                className,
            )}
            onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                openUserProfile(id)
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    openUserProfile(id)
                }
            }}
            {...qa('host.userProfileLink.trigger', { user: id })}
            {...(drawerOnly ? {} : { 'data-profile-deep-link': `/account/users/${id}` })}
        >
            {children}
        </button>
    )
}
