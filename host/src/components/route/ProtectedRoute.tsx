import appConfig from '@/configs/app.config'
import { REDIRECT_URL_KEY } from '@/constants/app.constant'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/auth'

const { unAuthenticatedEntryPath } = appConfig

const ProtectedRoute = () => {
    const { authenticated } = useAuth()
    const location = useLocation()

    if (!authenticated) {
        const target = `${location.pathname}${location.search}${location.hash}`
        const redirectParam = `?${REDIRECT_URL_KEY}=${encodeURIComponent(target)}`
        return (
            <Navigate
                replace
                to={`${unAuthenticatedEntryPath}${redirectParam}`}
            />
        )
    }

    return <Outlet />
}

export default ProtectedRoute
