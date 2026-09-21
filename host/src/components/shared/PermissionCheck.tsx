import { cloneElement, isValidElement } from 'react'
import usePermission from '@/utils/hooks/usePermission'
import { usePermissionStatus } from '@/utils/hooks/usePermissionStatus'
import type { ReactElement, ReactNode } from 'react'
import type { CommonProps } from '@/@types/common'

interface PermissionCheckProps extends CommonProps {
    /** Permission subject (e.g. `deals`). */
    subject: string
    /** Permission action (e.g. `delete`). */
    action: string
    /**
     * UX behaviour when denied (BR-SHELL-4 — FE gating is UX, not security):
     *  - `hide` (default): render nothing.
     *  - `disable`: render children but inject `disabled` (for actionable controls).
     */
    mode?: 'hide' | 'disable'
    /** Rendered instead of children when denied (only in `hide` mode). */
    fallback?: ReactElement | null
    /**
     * Rendered while the PDP projection is still loading (project context only).
     * Defaults to nothing — children stay hidden until allow resolves
     * (fail-closed). Pass a skeleton/spinner for elevated controls if desired.
     */
    loadingFallback?: ReactNode
}

/**
 * Contextual-UI permission gate (E2-13 / FR-SHELL-3/8/11).
 *
 * Wrap a gated control: `<PermissionCheck subject="deals" action="delete">...`.
 * Source of truth is the permission projection (API-2) via `usePermission` —
 * FAIL-CLOSED: while loading or when the projection lacks the permission the
 * control is hidden/disabled. Hiding here does NOT authorize anything;
 * backend-guard enforces (BR-SHELL-4).
 */
const PermissionCheck = (props: PermissionCheckProps) => {
    const {
        subject,
        action,
        mode = 'hide',
        fallback = null,
        loadingFallback = null,
        children,
    } = props
    const can = usePermission()
    const { isLoading, hasProject } = usePermissionStatus()
    const allowed = can(subject, action)

    // Fail-closed while the projection resolves for a real project context.
    if (!allowed && isLoading && hasProject) {
        return <>{loadingFallback}</>
    }

    if (allowed) return <>{children}</>

    if (mode === 'disable' && isValidElement(children)) {
        return cloneElement(children as ReactElement<{ disabled?: boolean }>, {
            disabled: true,
        })
    }

    return <>{fallback}</>
}

export default PermissionCheck
