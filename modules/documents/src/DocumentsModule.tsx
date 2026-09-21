import { useMemo, type ComponentType } from 'react'
import { matchPath, useLocation } from 'react-router'
import { Container } from '@fairflow/shared-ui'
import DocumentList from './DocumentList'
import Templates from './Templates'
import TemplateForm from './TemplateForm'
import DocumentDetails from './DocumentDetails'
import DocumentsDept from './DocumentsDept'

type RouteView = {
    patterns: string[]
    component: ComponentType
}

const routeViews: RouteView[] = [
    {
        patterns: ['/documents/templates/new', '/p/:pid/documents/templates/new'],
        component: TemplateForm,
    },
    {
        patterns: ['/documents/templates/:id/edit', '/p/:pid/documents/templates/:id/edit'],
        component: TemplateForm,
    },
    {
        patterns: ['/documents/templates', '/p/:pid/documents/templates'],
        component: Templates,
    },
    {
        patterns: ['/documents/department', '/p/:pid/documents/department'],
        component: DocumentsDept,
    },
    {
        patterns: ['/documents/:id', '/p/:pid/documents/:id'],
        component: DocumentDetails,
    },
    {
        patterns: ['/documents', '/p/:pid/documents'],
        component: DocumentList,
    },
]

const DocumentsModule = () => {
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
        return DocumentList
    }, [pathname])

    return (
        <Container>
            <ResolvedView />
        </Container>
    )
}

export default DocumentsModule
