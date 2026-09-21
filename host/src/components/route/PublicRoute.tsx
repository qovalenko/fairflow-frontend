import { Navigate, Outlet, useLocation } from 'react-router'
import appConfig from '@/configs/app.config'
import { useAuth } from '@/auth'

const { authenticatedEntryPath } = appConfig

const PublicRoute = () => {
    const { authenticated } = useAuth()
    const location = useLocation()
    // FR-AUTH-320: existing-user invite accept needs the live session on this
    // page. Bouncing to / would make the JWT proof unreachable.
    const stayForInvite =
        location.pathname.startsWith('/auth/invite/') ||
        location.pathname.startsWith('/auth/project-invite/')

    return authenticated && !stayForInvite ? (
        <Navigate to={authenticatedEntryPath} />
    ) : (
        <Outlet />
    )
}

export default PublicRoute
