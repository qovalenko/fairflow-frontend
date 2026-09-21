import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { ReactNode } from 'react'

vi.mock('@fairflow/shared-ui', () => ({
    Container: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('./AutomationList', () => ({ default: () => <div data-testid="view">AutomationList</div> }))
vi.mock('./AutomationForm', () => ({ default: () => <div data-testid="view">AutomationForm</div> }))
vi.mock('./Connections', () => ({ default: () => <div data-testid="view">Connections</div> }))
vi.mock('./ConnectionForm', () => ({ default: () => <div data-testid="view">ConnectionForm</div> }))
vi.mock('./Dlq', () => ({ default: () => <div data-testid="view">Dlq</div> }))
vi.mock('./Problems', () => ({ default: () => <div data-testid="view">Problems</div> }))
vi.mock('./v2/AutomationV2List', () => ({
    default: () => <div data-testid="view">AutomationV2List</div>,
}))
vi.mock('./v2/WorkflowEditor', () => ({
    default: () => <div data-testid="view">WorkflowEditor</div>,
}))

const { default: AutomationModule } = await import('./AutomationModule')

const renderAt = (pathname: string) => {
    const { unmount } = render(
        <MemoryRouter initialEntries={[pathname]}>
            <AutomationModule />
        </MemoryRouter>,
    )
    const view = screen.getByTestId('view').textContent
    unmount()
    return view
}

const cases: Array<[string, string, string]> = [
    ['/automation', '/p/p1/automation', 'AutomationList'],
    ['/automation/new', '/p/p1/automation/new', 'AutomationForm'],
    ['/automation/rule-1/edit', '/p/p1/automation/rule-1/edit', 'AutomationForm'],
    ['/automation/connections', '/p/p1/automation/connections', 'Connections'],
    ['/automation/connections/new', '/p/p1/automation/connections/new', 'ConnectionForm'],
    ['/automation/connections/c1/edit', '/p/p1/automation/connections/c1/edit', 'ConnectionForm'],
    ['/automation/dlq', '/p/p1/automation/dlq', 'Dlq'],
    ['/automation/problems', '/p/p1/automation/problems', 'Problems'],
    ['/automation/v2', '/p/p1/automation/v2', 'AutomationV2List'],
    ['/automation/v2/new', '/p/p1/automation/v2/new', 'WorkflowEditor'],
    ['/automation/v2/rule-1', '/p/p1/automation/v2/rule-1', 'WorkflowEditor'],
]

describe('AutomationModule — таблица маршрутов', () => {
    it.each(cases)('резолвит %s и %s в %s', (flat, scoped, expected) => {
        expect(renderAt(flat)).toBe(expected)
        expect(renderAt(scoped)).toBe(expected)
    })

    it('v2/new выигрывает над /automation/:id/edit', () => {
        expect(renderAt('/automation/v2/new')).toBe('WorkflowEditor')
        expect(renderAt('/p/p1/automation/v2/new')).toBe('WorkflowEditor')
    })

    it('неизвестный путь падает в список', () => {
        expect(renderAt('/automation/unknown-tab')).toBe('AutomationList')
    })
})
