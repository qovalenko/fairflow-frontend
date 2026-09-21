import { useMemo, type ComponentType } from 'react'
import { matchPath, useLocation } from 'react-router'
import { Container } from '@fairflow/shared-ui'
import ContactList from './ContactList'
import ContactDetails from './ContactDetails'
import ContactEdit from './ContactEdit'
import ContactImport from './ContactImport'
import ContactTrash from './ContactTrash'
import ContactDuplicateQueue from './ContactDuplicateQueue'
import ContactMerge from './ContactMerge'

type RouteView = {
    patterns: string[]
    component: ComponentType
}

const routeViews: RouteView[] = [
    {
        patterns: ['/contacts/import', '/p/:pid/contacts/import'],
        component: ContactImport,
    },
    {
        patterns: ['/contacts/trash', '/p/:pid/contacts/trash'],
        component: ContactTrash,
    },
    {
        patterns: ['/contacts/duplicates', '/p/:pid/contacts/duplicates'],
        component: ContactDuplicateQueue,
    },
    {
        patterns: ['/contacts/merge', '/p/:pid/contacts/merge'],
        component: ContactMerge,
    },
    {
        patterns: ['/contacts/:id/edit', '/p/:pid/contacts/:id/edit'],
        component: ContactEdit,
    },
    {
        patterns: ['/contacts/:id', '/p/:pid/contacts/:id'],
        component: ContactDetails,
    },
    {
        patterns: ['/contacts', '/p/:pid/contacts'],
        component: ContactList,
    },
]

const ContactsModule = () => {
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
        return ContactList
    }, [pathname])

    return (
        <Container>
            <ResolvedView />
        </Container>
    )
}

export default ContactsModule
