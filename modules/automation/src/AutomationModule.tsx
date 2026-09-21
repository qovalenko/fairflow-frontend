import { useMemo, type ComponentType } from 'react'
import { matchPath, useLocation } from 'react-router'
import { Container } from '@fairflow/shared-ui'
import AutomationList from './AutomationList'
import AutomationForm from './AutomationForm'
import Connections from './Connections'
import ConnectionForm from './ConnectionForm'
import Dlq from './Dlq'
import Problems from './Problems'
import WorkflowEditor from './v2/WorkflowEditor'
import AutomationV2List from './v2/AutomationV2List'

type RouteView = {
    patterns: string[]
    component: ComponentType
    /** v2-канва занимает высоту вьюпорта — рендерим без оборачивающего Container. */
    fullBleed?: boolean
}

// Порядок важен: специфичные пути раньше общих (`/automation/:id/edit`).
// v2-паттерны идут ПЕРВЫМИ — `/automation/v2` иначе матчится `/automation/:id/edit`.
const routeViews: RouteView[] = [
    {
        patterns: ['/automation/v2/new', '/p/:pid/automation/v2/new'],
        component: WorkflowEditor,
        fullBleed: true,
    },
    {
        patterns: ['/automation/v2/:id', '/p/:pid/automation/v2/:id'],
        component: WorkflowEditor,
        fullBleed: true,
    },
    {
        // T-020: точка входа v2 — СПИСОК сценариев (не конструктор).
        // Конструктор открывается по `/automation/v2/new` и `/automation/v2/:id`.
        patterns: ['/automation/v2', '/p/:pid/automation/v2'],
        component: AutomationV2List,
    },
    {
        patterns: [
            '/automation/connections/new',
            '/p/:pid/automation/connections/new',
        ],
        component: ConnectionForm,
    },
    {
        patterns: [
            '/automation/connections/:id/edit',
            '/p/:pid/automation/connections/:id/edit',
        ],
        component: ConnectionForm,
    },
    {
        patterns: [
            '/automation/connections',
            '/p/:pid/automation/connections',
        ],
        component: Connections,
    },
    {
        patterns: ['/automation/dlq', '/p/:pid/automation/dlq'],
        component: Dlq,
    },
    {
        patterns: ['/automation/problems', '/p/:pid/automation/problems'],
        component: Problems,
    },
    {
        patterns: ['/automation/new', '/p/:pid/automation/new'],
        component: AutomationForm,
    },
    {
        patterns: ['/automation/:id/edit', '/p/:pid/automation/:id/edit'],
        component: AutomationForm,
    },
    {
        patterns: ['/automation', '/p/:pid/automation'],
        component: AutomationList,
    },
]

const AutomationModule = () => {
    const { pathname } = useLocation()

    const resolved = useMemo(() => {
        for (const route of routeViews) {
            const matched = route.patterns.some((pattern) =>
                matchPath({ path: pattern, end: true }, pathname),
            )
            if (matched) {
                return { component: route.component, fullBleed: !!route.fullBleed }
            }
        }
        return { component: AutomationList, fullBleed: false }
    }, [pathname])

    const ResolvedView = resolved.component

    // v2-канва управляет своим лейаутом/высотой — без общего Container.
    if (resolved.fullBleed) {
        return <ResolvedView />
    }

    return (
        <Container>
            <ResolvedView />
        </Container>
    )
}

export default AutomationModule
