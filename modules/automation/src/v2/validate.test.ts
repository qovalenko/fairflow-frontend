import { describe, expect, it } from 'vitest'
import { validateGraph, wouldCreateCycle } from './validate'
import { defaultNodeData } from './graphSpec'
import type { NodeKind, WorkflowEdge, WorkflowNode } from './types'

const node = (
    id: string,
    kind: NodeKind,
    typeId: string,
): WorkflowNode => ({
    id,
    type: kind,
    position: { x: 0, y: 0 },
    data: defaultNodeData(kind, typeId),
})

describe('validateGraph', () => {
    it('без триггера возвращает ошибку no_trigger', () => {
        const issues = validateGraph(
            [node('a1', 'action', 'create_task')],
            [],
        )
        expect(issues.some((i) => i.code === 'no_trigger')).toBe(true)
    })

    it('без действия возвращает ошибку no_action', () => {
        const issues = validateGraph(
            [node('t1', 'trigger', 'crm.deal.created')],
            [],
        )
        expect(issues.some((i) => i.code === 'no_action')).toBe(true)
    })

    it('webhook без connection помечает action', () => {
        const action = node('a1', 'action', 'send_webhook')
        ;(action.data as { actionType: string }).actionType = 'send_webhook'
        const issues = validateGraph(
            [node('t1', 'trigger', 'crm.deal.created'), action],
            [{ id: 'e1', source: 't1', target: 'a1' }],
        )
        expect(issues.some((i) => i.code === 'webhook_no_connection' && i.nodeId === 'a1')).toBe(true)
    })

    it('недостижимая нода — warning unreachable', () => {
        const issues = validateGraph(
            [
                node('t1', 'trigger', 'crm.deal.created'),
                node('a1', 'action', 'create_task'),
                node('a2', 'action', 'update_field'),
            ],
            [{ id: 'e1', source: 't1', target: 'a1' }],
        )
        expect(issues.some((i) => i.code === 'unreachable' && i.nodeId === 'a2')).toBe(true)
    })
})

describe('wouldCreateCycle', () => {
    it('обнаруживает замыкание через существующие рёбра', () => {
        const edges: WorkflowEdge[] = [
            { id: 'e1', source: 'a', target: 'b' },
            { id: 'e2', source: 'b', target: 'c' },
        ]
        expect(wouldCreateCycle(edges, 'c', 'a')).toBe(true)
        expect(wouldCreateCycle(edges, 'a', 'c')).toBe(false)
    })
})
