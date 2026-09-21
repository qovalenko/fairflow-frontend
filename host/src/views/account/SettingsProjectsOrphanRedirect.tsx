import { Navigate, useLocation } from 'react-router'

/**
 * FR-PROJ-415 / TODO-105: legacy `/settings/projects/*` (DEORG org layout)
 * redirects to the canonical `/account/projects/*` portfolio routes.
 */
const SettingsProjectsOrphanRedirect = () => {
    const { pathname, search, hash } = useLocation()
    const target = pathname.replace(/^\/settings\/projects/, '/account/projects')
    return <Navigate to={`${target}${search}${hash}`} replace />
}

export default SettingsProjectsOrphanRedirect
