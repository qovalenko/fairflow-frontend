import { useEffect } from 'react'
import { useParams, useLocation, useNavigate } from 'react-router'

/** Редирект /p/:pid/settings* → /account/projects/:pid/settings* (настройки в layout аккаунта). */
const RedirectToAccountProjectSettings = () => {
    const { pid } = useParams<{ pid: string }>()
    const location = useLocation()
    const navigate = useNavigate()

    useEffect(() => {
        if (!pid) return
        const base = `/account/projects/${pid}/settings`
        const path = location.pathname
        if (path.endsWith('/settings/modules')) {
            navigate(`${base}/modules`, { replace: true })
        } else if (path.endsWith('/settings/policies')) {
            navigate(`${base}/policies`, { replace: true })
        } else {
            navigate(base, { replace: true })
        }
    }, [pid, location.pathname, navigate])

    return null
}

export default RedirectToAccountProjectSettings
