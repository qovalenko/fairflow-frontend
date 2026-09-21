import { PropsWithChildren } from 'react'
import { Navigate } from 'react-router'
import usePermissionProjection from '@/utils/hooks/usePermissionProjection'
import { useRequiresPermission } from '@/utils/hooks/usePermission'

type PermissionRouteGuardProps = PropsWithChildren<{
    /** PDP gate `subject:action` (R3-E1-10). Empty → route is ungated. */
    requires?: string
}>

/**
 * Route-level PDP permission gate (TODO-294 / FR-SHELL-3).
 *
 * Unlike legacy `AuthorityGuard` (role strings ADMIN/USER), this checks the real
 * projection via `useRequiresPermission`. Waits for projection resolution before
 * redirecting so a just-created project does not flash access-denied while API-2
 * is in flight (same race as T-002 for portfolio guard).
 */
const PermissionRouteGuard = ({
    requires,
    children,
}: PermissionRouteGuardProps) => {
    const projectionState = usePermissionProjection()
    const allowed = useRequiresPermission(requires)

    if (!requires) {
        return <>{children}</>
    }

    if (projectionState.source === 'loading') {
        return null
    }

    return allowed ? <>{children}</> : <Navigate to="/access-denied" replace />
}

export default PermissionRouteGuard
