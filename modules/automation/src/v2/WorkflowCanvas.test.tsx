import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useWorkflowStore } from './workflowStore'
import { DND_MIME } from './NodePalette'

const pushToast = vi.fn()

vi.mock('./notify', () => ({ pushToast: (...a: unknown[]) => pushToast(...a) }))
vi.mock('@xyflow/react', () => ({
    ReactFlow: ({
        nodes,
        onNodeClick,
        onPaneClick,
    }: {
        nodes: Array<{ id: string; className?: string }>
        onNodeClick?: (e: unknown, node: { id: string }) => void
        onPaneClick?: () => void
    }) => (
        <div data-testid="react-flow">
            {nodes.map((n) => (
                <button
                    key={n.id}
                    type="button"
                    data-testid={`node-${n.id}`}
                    className={n.className}
                    onClick={(e) => onNodeClick?.(e, n)}
                >
                    node-{n.id}
                </button>
            ))}
            <button type="button" onClick={() => onPaneClick?.()}>
                pane
            </button>
        </div>
    ),
    Background: () => null,
    Controls: () => null,
    MiniMap: () => null,
    useReactFlow: () => ({
        screenToFlowPosition: () => ({ x: 50, y: 50 }),
    }),
}))

import WorkflowCanvas from './WorkflowCanvas'

describe('WorkflowCanvas', () => {
    beforeEach(() => {
        useWorkflowStore.getState().reset()
        pushToast.mockReset()
    })

    it('пустой граф показывает подсказку', () => {
        render(<WorkflowCanvas readOnly={false} />)
        expect(
            screen.getByText('Перетащите триггер из палитры, чтобы начать сценарий.'),
        ).toBeInTheDocument()
    })

    it('lastConnectError показывает toast', async () => {
        useWorkflowStore.setState({ lastConnectError: 'Циклы запрещены.' })
        render(<WorkflowCanvas readOnly={false} />)
        await waitFor(() =>
            expect(pushToast).toHaveBeenCalledWith('Циклы запрещены.', 'warning'),
        )
    })

    it('клик по ноде выбирает её в сторе', async () => {
        useWorkflowStore.getState().setGraph(
            [
                {
                    id: 't1',
                    type: 'trigger',
                    position: { x: 0, y: 0 },
                    data: { label: 'T', triggerType: 'crm.deal.created', triggerConfig: {} },
                },
            ],
            [],
        )
        const user = userEvent.setup()
        render(<WorkflowCanvas readOnly={false} />)
        await user.click(screen.getByRole('button', { name: 'node-t1' }))
        expect(useWorkflowStore.getState().selectedNodeId).toBe('t1')
    })

    it('клик по pane снимает выбор', async () => {
        useWorkflowStore.getState().setGraph(
            [
                {
                    id: 't1',
                    type: 'trigger',
                    position: { x: 0, y: 0 },
                    data: { label: 'T', triggerType: 'crm.deal.created', triggerConfig: {} },
                },
            ],
            [],
        )
        useWorkflowStore.getState().setSelectedNodeId('t1')
        const user = userEvent.setup()
        render(<WorkflowCanvas readOnly={false} />)
        await user.click(screen.getByRole('button', { name: 'pane' }))
        expect(useWorkflowStore.getState().selectedNodeId).toBeNull()
    })

    it('drop добавляет ноду на холст', () => {
        render(<WorkflowCanvas readOnly={false} />)
        const dropTarget = screen.getByTestId('react-flow').parentElement!
        fireEvent.drop(dropTarget, {
            dataTransfer: {
                getData: (mime: string) =>
                    mime === DND_MIME
                        ? JSON.stringify({ kind: 'action', typeId: 'create_task' })
                        : '',
            },
            clientX: 100,
            clientY: 100,
        })
        expect(useWorkflowStore.getState().nodes).toHaveLength(1)
        expect(useWorkflowStore.getState().nodes[0].type).toBe('action')
    })

    it('readOnly игнорирует drop', () => {
        render(<WorkflowCanvas readOnly />)
        const dropTarget = screen.getByTestId('react-flow').parentElement!
        fireEvent.drop(dropTarget, {
            dataTransfer: {
                getData: (mime: string) =>
                    mime === DND_MIME
                        ? JSON.stringify({ kind: 'action', typeId: 'create_task' })
                        : '',
            },
            clientX: 100,
            clientY: 100,
        })
        expect(useWorkflowStore.getState().nodes).toHaveLength(0)
    })

    it('executedPath подсвечивает пройденные ноды', () => {
        useWorkflowStore.getState().setGraph(
            [
                {
                    id: 't1',
                    type: 'trigger',
                    position: { x: 0, y: 0 },
                    data: { label: 'T', triggerType: 'crm.deal.created', triggerConfig: {} },
                },
            ],
            [],
        )
        useWorkflowStore.setState({ executedPathNodeIds: ['t1'] })
        render(<WorkflowCanvas readOnly={false} />)
        expect(screen.getByTestId('node-t1')).toHaveClass('ring-emerald-500')
    })
})
