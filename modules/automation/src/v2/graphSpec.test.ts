import { describe, expect, it } from 'vitest'
import { defaultNodeData, fromGraphSpec, graphFromFlatRule, toGraphSpec, uid } from './graphSpec'
import type { WorkflowEdge, WorkflowNode } from './types'

describe('graphSpec', () => {
    it('uid генерирует уникальные идентификаторы', () => {
        const a = uid('n')
        const b = uid('n')
        expect(a).not.toBe(b)
        expect(a.startsWith('n_')).toBe(true)
    })

    it('defaultNodeData задаёт triggerType из typeId', () => {
        const data = defaultNodeData('trigger', 'crm.deal.created')
        expect((data as { triggerType: string }).triggerType).toBe('crm.deal.created')
    })

    it('toGraphSpec/fromGraphSpec round-trip', () => {
        const nodes: WorkflowNode[] = [
            {
                id: 't1',
                type: 'trigger',
                position: { x: 10, y: 20 },
                data: defaultNodeData('trigger', 'crm.deal.created'),
            },
            {
                id: 'a1',
                type: 'action',
                position: { x: 30, y: 40 },
                data: { ...defaultNodeData('action', 'create_task'), actionType: 'create_task' },
            },
        ]
        const edges: WorkflowEdge[] = [{ id: 'e1', source: 't1', target: 'a1' }]
        const spec = toGraphSpec(nodes, edges)
        const restored = fromGraphSpec(spec)
        expect(restored.nodes.map((n) => n.id)).toEqual(['t1', 'a1'])
        expect(restored.edges[0].target).toBe('a1')
        expect((restored.nodes[0].data as { triggerType: string }).triggerType).toBe('crm.deal.created')
    })

    it('graphFromFlatRule строит цепочку trigger → condition → action', () => {
        const { nodes, edges } = graphFromFlatRule({
            triggerType: 'crm.deal.created',
            conditionsJson: JSON.stringify({
                args: [{ field: 'deal.amount', op: 'gt', value: '100' }],
            }),
            actionsJson: JSON.stringify([{ type: 'create_task', config: { title: 'Task' } }]),
        })
        expect(nodes.map((n) => n.type)).toEqual(['trigger', 'condition', 'action'])
        expect(edges).toHaveLength(2)
    })

    it('fromGraphSpec восстанавливает condition и branch', () => {
        const restored = fromGraphSpec({
            version: 2,
            nodes: [
                {
                    id: 'c1',
                    type: 'condition',
                    position: { x: 0, y: 0 },
                    config: { predicate: { field: 'deal.stage', op: 'eq', value: 'won' } },
                },
                {
                    id: 'b1',
                    type: 'branch',
                    position: { x: 0, y: 100 },
                    config: {
                        cases: [
                            {
                                id: 'case1',
                                label: 'VIP',
                                predicate: { field: 'deal.tier', op: 'eq', value: 'gold' },
                            },
                        ],
                    },
                },
            ],
            edges: [],
        })
        expect((restored.nodes[0].data as { field: string }).field).toBe('deal.stage')
        expect((restored.nodes[1].data as { cases: Array<{ label: string }> }).cases[0].label).toBe(
            'VIP',
        )
    })
})
