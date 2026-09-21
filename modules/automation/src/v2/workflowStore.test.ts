import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkflowStore } from './workflowStore'
import { defaultNodeData } from './graphSpec'

describe('workflowStore', () => {
    beforeEach(() => {
        useWorkflowStore.getState().reset()
    })

    it('addNode создаёт триггер и помечает dirty', () => {
        useWorkflowStore.getState().addNode('trigger', 'crm.deal.created', { x: 0, y: 0 })
        const s = useWorkflowStore.getState()
        expect(s.nodes).toHaveLength(1)
        expect(s.nodes[0].type).toBe('trigger')
        expect(s.dirty).toBe(true)
        expect(s.selectedNodeId).toBe(s.nodes[0].id)
    })

    it('второй триггер отклоняется с сообщением', () => {
        const store = useWorkflowStore.getState()
        store.addNode('trigger', 'crm.deal.created', { x: 0, y: 0 })
        store.addNode('trigger', 'crm.contact.created', { x: 10, y: 10 })
        expect(useWorkflowStore.getState().nodes.filter((n) => n.type === 'trigger')).toHaveLength(1)
        expect(useWorkflowStore.getState().lastConnectError).toBe('В сценарии уже есть триггер.')
    })

    it('onConnect запрещает цикл', () => {
        const store = useWorkflowStore.getState()
        store.setGraph(
            [
                { id: 'a', type: 'trigger', position: { x: 0, y: 0 }, data: defaultNodeData('trigger', 'crm.deal.created') },
                { id: 'b', type: 'action', position: { x: 0, y: 100 }, data: defaultNodeData('action', 'create_task') },
            ],
            [{ id: 'e1', source: 'a', target: 'b' }],
        )
        store.onConnect({
            source: 'b',
            target: 'a',
            sourceHandle: null,
            targetHandle: null,
        })
        expect(useWorkflowStore.getState().lastConnectError).toBe('Циклы запрещены.')
        expect(useWorkflowStore.getState().edges).toHaveLength(1)
    })

    it('removeNode удаляет связанные рёбра', () => {
        const store = useWorkflowStore.getState()
        store.setGraph(
            [
                { id: 'a', type: 'trigger', position: { x: 0, y: 0 }, data: defaultNodeData('trigger', 'crm.deal.created') },
                { id: 'b', type: 'action', position: { x: 0, y: 100 }, data: defaultNodeData('action', 'create_task') },
            ],
            [{ id: 'e1', source: 'a', target: 'b' }],
        )
        store.removeNode('b')
        const s = useWorkflowStore.getState()
        expect(s.nodes).toHaveLength(1)
        expect(s.edges).toHaveLength(0)
    })

    it('loadFromGraphSpec и toGraphSpec сохраняют структуру', () => {
        const spec = {
            version: 2 as const,
            nodes: [
                {
                    id: 't1',
                    type: 'trigger' as const,
                    position: { x: 1, y: 2 },
                    config: { trigger_id: 'crm.deal.created' },
                },
                {
                    id: 'a1',
                    type: 'action' as const,
                    position: { x: 3, y: 4 },
                    config: { action_type: 'create_task' },
                },
            ],
            edges: [{ id: 'e1', source: 't1', target: 'a1', sourceHandle: 'out' }],
        }
        useWorkflowStore.getState().loadFromGraphSpec(spec)
        const round = useWorkflowStore.getState().toGraphSpec()
        expect(round.nodes.map((n) => n.id)).toEqual(['t1', 'a1'])
        expect(round.edges[0].source).toBe('t1')
        expect(useWorkflowStore.getState().dirty).toBe(false)
    })

    it('updateNodeData патчит data и помечает dirty', () => {
        const store = useWorkflowStore.getState()
        store.addNode('action', 'create_task', { x: 0, y: 0 })
        const id = useWorkflowStore.getState().nodes[0].id
        store.updateNodeData(id, { actionType: 'create_task', config: { title: 'X' } })
        const node = useWorkflowStore.getState().nodes[0]
        expect((node.data as { config?: Record<string, unknown> }).config?.title).toBe('X')
        expect(useWorkflowStore.getState().dirty).toBe(true)
    })

    it('setRuleMeta обновляет метаданные правила', () => {
        useWorkflowStore.getState().setRuleMeta({ name: 'Сценарий A', enabled: true })
        expect(useWorkflowStore.getState().ruleMeta.name).toBe('Сценарий A')
        expect(useWorkflowStore.getState().ruleMeta.enabled).toBe(true)
    })

    it('onConnect игнорирует дубликат ребра', () => {
        const store = useWorkflowStore.getState()
        store.setGraph(
            [
                { id: 'a', type: 'trigger', position: { x: 0, y: 0 }, data: defaultNodeData('trigger', 'crm.deal.created') },
                { id: 'b', type: 'action', position: { x: 0, y: 100 }, data: defaultNodeData('action', 'create_task') },
            ],
            [{ id: 'e1', source: 'a', target: 'b' }],
        )
        store.onConnect({
            source: 'a',
            target: 'b',
            sourceHandle: null,
            targetHandle: null,
        })
        expect(useWorkflowStore.getState().edges).toHaveLength(1)
    })

    it('setNodeErrors проставляет error на нодах', () => {
        const store = useWorkflowStore.getState()
        store.addNode('trigger', 'crm.deal.created', { x: 0, y: 0 })
        const id = useWorkflowStore.getState().nodes[0].id
        store.setNodeErrors({ [id]: 'Нет connection' })
        expect((useWorkflowStore.getState().nodes[0].data as { error?: string }).error).toBe(
            'Нет connection',
        )
    })

    it('setExecutedPath сохраняет id пройденных нод', () => {
        useWorkflowStore.getState().setExecutedPath(['n1', 'n2'])
        expect(useWorkflowStore.getState().executedPathNodeIds).toEqual(['n1', 'n2'])
    })
})
