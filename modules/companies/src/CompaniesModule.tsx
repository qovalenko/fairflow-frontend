import { useMemo, type ComponentType } from 'react'
import { matchPath, useLocation } from 'react-router'
import { Container } from '@fairflow/shared-ui'
import CompanyList from './views/crm/Companies/CompanyList'
import CompanyDetails from './views/crm/Companies/CompanyDetails'
import CompanyEdit from './views/crm/Companies/CompanyEdit'
import CompanyTrash from './views/crm/Companies/CompanyTrash'
import CompanyMerge from './views/crm/Companies/CompanyMerge'
import CompanyImport from './views/crm/Import/CompanyImport'

type RouteView = {
    patterns: string[]
    component: ComponentType
}

const routeViews: RouteView[] = [
    {
        patterns: ['/companies/import', '/p/:pid/companies/import'],
        component: CompanyImport,
    },
    {
        patterns: ['/companies/trash', '/p/:pid/companies/trash'],
        component: CompanyTrash,
    },
    {
        patterns: ['/companies/merge', '/p/:pid/companies/merge'],
        component: CompanyMerge,
    },
    {
        patterns: ['/companies/:id/edit', '/p/:pid/companies/:id/edit'],
        component: CompanyEdit,
    },
    {
        patterns: ['/companies/:id', '/p/:pid/companies/:id'],
        component: CompanyDetails,
    },
    {
        patterns: ['/companies', '/p/:pid/companies'],
        component: CompanyList,
    },
]

const CompaniesModule = () => {
    const { pathname } = useLocation()

    const ResolvedView = useMemo(() => {
        for (const route of routeViews) {
            const matched = route.patterns.some((pattern) =>
                matchPath({ path: pattern, end: true }, pathname),
            )
            if (matched) {
                return route.component
            }
        }
        return CompanyList
    }, [pathname])

    return (
        <Container>
            <ResolvedView />
        </Container>
    )
}

export default CompaniesModule
