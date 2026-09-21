/**
 * Авто-раскладка графа через @dagrejs/dagre (вертикально, сверху-вниз).
 *
 * React Flow v12: реальные размеры нод после рендера лежат в `node.measured`
 * (read-only), их и берём для dagre — иначе наложение нод (00-research §2).
 */

import dagre from '@dagrejs/dagre'
import type { WorkflowNode, WorkflowEdge } from './types'

const DEFAULT_W = 220
const DEFAULT_H = 80

export function layoutGraph(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    direction: 'TB' | 'LR' = 'TB',
): WorkflowNode[] {
    if (nodes.length === 0) return nodes

    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: direction, ranksep: 90, nodesep: 60 })

    for (const node of nodes) {
        g.setNode(node.id, {
            width: node.measured?.width ?? DEFAULT_W,
            height: node.measured?.height ?? DEFAULT_H,
        })
    }
    for (const edge of edges) {
        // dagre игнорирует рёбра на отсутствующие ноды — фильтруем для надёжности.
        if (g.hasNode(edge.source) && g.hasNode(edge.target)) {
            g.setEdge(edge.source, edge.target)
        }
    }

    dagre.layout(g)

    return nodes.map((node) => {
        const pos = g.node(node.id)
        if (!pos) return node
        const w = node.measured?.width ?? DEFAULT_W
        const h = node.measured?.height ?? DEFAULT_H
        // dagre отдаёт центр ноды → переводим в top-left (контракт React Flow).
        return {
            ...node,
            position: { x: pos.x - w / 2, y: pos.y - h / 2 },
        }
    })
}
