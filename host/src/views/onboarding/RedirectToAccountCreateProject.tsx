import { Navigate, useLocation } from 'react-router'

const RedirectToAccountCreateProject = () => {
    const { search } = useLocation()

    return <Navigate replace to={`/account/projects/new${search}`} />
}

export default RedirectToAccountCreateProject
