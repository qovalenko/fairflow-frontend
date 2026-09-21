import { useCallback, useEffect, useRef } from 'react'
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useReactFlow,
    type NodeMouseHandler,
} from '@xyflow/react'
import type { NodeKind, WorkflowNode } from './types'
import { pushToast } from './notify'
import { useWorkflowStore } from './workflowStore'
import { nodeTypes } from './nodes'
import { edgeTypes } from './edges'
import { DND_MIME } from './NodePalette'
import { qa } from '../qa'

/**
 * WorkflowCanvas — обёртка над <ReactFlow>. Controlled из workflowStore.
 * Приём drag из палитры через screenToFlowPosition (нативный DnD).
 */
export default function WorkflowCanvas({ readOnly }: { readOnly: boolean }) {
    const nodes = useWorkflowStore((s) => s.nodes)
    const edges = useWorkflowStore((s) => s.edges)
    const executedPathNodeIds = useWorkflowStore((s) => s.executedPathNodeIds)
    const onNodesChange = useWorkflowStore((s) => s.onNodesChange)
    const onEdgesChange = useWorkflowStore((s) => s.onEdgesChange)
    const onConnect = useWorkflowStore((s) => s.onConnect)
    const addNode = useWorkflowStore((s) => s.addNode)
    const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId)
    const lastConnectError = useWorkflowStore((s) => s.lastConnectError)

    const { screenToFlowPosition } = useReactFlow()
    const lastShownError = useRef<string | null>(null)

    // Показываем toast при отклонённом соединении/добавлении (цикл, дубль триггера).
    useEffect(() => {
        if (lastConnectError && lastConnectError !== lastShownError.current) {
            pushToast(lastConnectError, 'warning')
            lastShownError.current = lastConnectError
        }
        if (!lastConnectError) lastShownError.current = null
    }, [lastConnectError])

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
    }, [])

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            if (readOnly) return
            const raw = e.dataTransfer.getData(DND_MIME)
            if (!raw) return
            try {
                const { kind, typeId } = JSON.parse(raw) as {
                    kind: NodeKind
                    typeId: string
                }
                const position = screenToFlowPosition({
                    x: e.clientX,
                    y: e.clientY,
                })
                addNode(kind, typeId, position)
            } catch {
                /* битый payload — игнор */
            }
        },
        [readOnly, screenToFlowPosition, addNode],
    )

    const onNodeClick = useCallback<NodeMouseHandler<WorkflowNode>>(
        (_, node) => setSelectedNodeId(node.id),
        [setSelectedNodeId],
    )
    const onPaneClick = useCallback(
        () => setSelectedNodeId(null),
        [setSelectedNodeId],
    )

    const displayNodes =
        executedPathNodeIds.length > 0
            ? nodes.map((n) =>
                  executedPathNodeIds.includes(n.id)
                      ? {
                            ...n,
                            className: [n.className, 'ring-2 ring-emerald-500 rounded-lg']
                                .filter(Boolean)
                                .join(' '),
                            data: { ...n.data, pathHighlighted: true },
                        }
                      : n,
              )
            : nodes

    return (
        <div
            className="flex-1 relative"
            onDrop={onDrop}
            onDragOver={onDragOver}
            {...qa('automation.v2editor.canvas')}
        >
            <ReactFlow
                nodes={displayNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodesDraggable={!readOnly}
                nodesConnectable={!readOnly}
                elementsSelectable
                defaultEdgeOptions={{ type: 'qaSmoothstep' }}
                fitView
                proOptions={{ hideAttribution: true }}
            >
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
            </ReactFlow>

            {nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-sm text-gray-400">
                        Перетащите триггер из палитры, чтобы начать сценарий.
                    </p>
                </div>
            )}
        </div>
    )
}
