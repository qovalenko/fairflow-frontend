import { describe, expect, it } from 'vitest'
import { layoutGraph } from './layout'
import { defaultNodeData } from './graphSpec'

describe('layoutGraph', () => {
    it('перераспределяет позиции связанных нод', () => {
        const nodes = [
            {
                id: 't1',
                type: 'trigger' as const,
                position: { x: 0, y: 0 },
                data: defaultNodeData('trigger', 'crm.deal.created'),
            },
            {
                id: 'a1',
                type: 'action' as const,
                position: { x: 0, y: 0 },
                data: defaultNodeData('action', 'create_task'),
            },
        ]
        const edges = [{ id: 'e1', source: 't1', target: 'a1' }]
        const laid = layoutGraph(nodes, edges, 'TB')
        expect(laid[1].position.y).toBeGreaterThan(laid[0].position.y)
    })

    it('пустой граф возвращается без изменений', () => {
        expect(layoutGraph([], [])).toEqual([])
    })
})
