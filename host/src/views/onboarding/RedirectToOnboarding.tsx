import { Navigate } from 'react-router'

/** Редирект со старых URL на /onboarding */
export default function RedirectToOnboarding() {
    return <Navigate replace to="/onboarding" />
}
