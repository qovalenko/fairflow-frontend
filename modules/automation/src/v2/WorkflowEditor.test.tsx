import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { MemoryRouter, Route, Routes } from 'react-router'

const apiGetRule = vi.fn()
const loadNodeRegistry = vi.fn()
let permissions = new Set<string>()
let projectId: string | null = 'p1'
let routeId: string | undefined

vi.mock('@xyflow/react', () => ({
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useReactFlow: () => ({
        fitView: vi.fn(),
        screenToFlowPosition: () => ({ x: 0, y: 0 }),
    }),
}))
vi.mock('./WorkflowCanvas', () => ({ default: () => <div data-testid="canvas">canvas</div> }))
vi.mock('./NodePalette', () => ({ default: () => <div data-testid="palette">palette</div> }))
vi.mock('./NodePropertiesPanel', () => ({ default: () => null }))
vi.mock('./WorkflowToolbar', () => ({ default: () => <div data-testid="toolbar">toolbar</div> }))
vi.mock('../DryRunOverlay', () => ({ default: () => null }))
vi.mock('./api', () => ({
    loadNodeRegistry: (...a: unknown[]) => loadNodeRegistry(...a),
}))
vi.mock('react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-router')>()
    return {
        ...actual,
        useParams: () => ({ id: routeId }),
        useSearchParams: () => [new URLSearchParams()],
    }
})
vi.mock('@/utils/hooks/useCurrentProjectId', () => ({ default: () => projectId }))
vi.mock('@/utils/hooks/usePermission', () => ({
    default: () => (subject: string, action: string) =>
        permissions.has(`${subject}:${action}`),
}))
vi.mock('@/services/AutomationService', () => ({
    apiGetRule: (...a: unknown[]) => apiGetRule(...a),
}))

import WorkflowEditor from './WorkflowEditor'

const renderAt = (path: string) =>
    rtlRender(
        <SWRConfig value={{ provider: () => new Map() }}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/automation/v2/new" element={<WorkflowEditor />} />
                    <Route path="/automation/v2/:id" element={<WorkflowEditor />} />
                </Routes>
            </MemoryRouter>
        </SWRConfig>,
    )

describe('WorkflowEditor', () => {
    beforeEach(() => {
        routeId = 'new'
        projectId = 'p1'
        permissions = new Set(['automation:read', 'automation:write'])
        loadNodeRegistry.mockResolvedValue({ triggers: [], conditions: [], branches: [], actions: [] })
        apiGetRule.mockResolvedValue({
            id: 'rule-1',
            name: 'Graph',
            enabled: true,
            triggerType: 'crm.deal.created',
            engineVersion: 2,
            graphJson: JSON.stringify({ nodes: [], edges: [] }),
            createdAt: 0,
            updatedAt: 0,
            projectId: 'p1',
        })
    })

    it('new открывает канву при write', async () => {
        routeId = 'new'
        renderAt('/automation/v2/new')
        expect(await screen.findByTestId('toolbar')).toBeInTheDocument()
        expect(screen.getByTestId('canvas')).toBeInTheDocument()
        expect(screen.getByTestId('palette')).toBeInTheDocument()
    })

    it('без write на создании — NoPermissionState', () => {
        permissions = new Set(['automation:read'])
        routeId = 'new'
        renderAt('/automation/v2/new')
        expect(
            screen.getByText('Нет права automation:write для создания сценария.'),
        ).toBeInTheDocument()
    })

    it('edit 404 показывает NotFoundState', async () => {
        routeId = 'missing'
        apiGetRule.mockRejectedValueOnce({ response: { status: 404 } })
        renderAt('/automation/v2/missing')
        expect(
            await screen.findByText('Сценарий не найден или удалён.'),
        ).toBeInTheDocument()
    })

    it('без проекта показывает NoProjectState', () => {
        projectId = null
        routeId = 'new'
        renderAt('/automation/v2/new')
        expect(screen.getByText('Проект не выбран')).toBeInTheDocument()
    })

    it('без read показывает NoPermissionState', () => {
        permissions = new Set(['automation:write'])
        routeId = 'new'
        renderAt('/automation/v2/new')
        expect(screen.getByText('Нет права automation:read.')).toBeInTheDocument()
    })

    it('edit loading показывает спиннер', async () => {
        routeId = 'rule-1'
        apiGetRule.mockImplementation(() => new Promise(() => {}))
        renderAt('/automation/v2/rule-1')
        expect(await screen.findByText('Загрузка сценария…')).toBeInTheDocument()
    })

    it('edit ошибка загрузки показывает ErrorState', async () => {
        routeId = 'rule-1'
        apiGetRule.mockRejectedValueOnce(new Error('network'))
        renderAt('/automation/v2/rule-1')
        expect(
            await screen.findByText('Не удалось загрузить сценарий'),
        ).toBeInTheDocument()
    })
})
