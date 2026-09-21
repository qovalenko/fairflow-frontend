import { describe, expect, it, vi, beforeEach } from 'vitest'
import { FALLBACK_REGISTRY } from './registry'

const apiGetNodeRegistry = vi.fn()
const apiGetRegistry = vi.fn()
const apiValidateGraph = vi.fn()
const apiCreateRule = vi.fn()
const apiUpdateRule = vi.fn()

vi.mock('@/services/AutomationService', () => ({
    apiGetNodeRegistry: (...a: unknown[]) => apiGetNodeRegistry(...a),
    apiGetRegistry: (...a: unknown[]) => apiGetRegistry(...a),
    apiValidateGraph: (...a: unknown[]) => apiValidateGraph(...a),
    apiCreateRule: (...a: unknown[]) => apiCreateRule(...a),
    apiUpdateRule: (...a: unknown[]) => apiUpdateRule(...a),
}))

import { loadNodeRegistry, saveWorkflow, validateWorkflowGraph } from './api'

describe('v2 api boundary', () => {
    beforeEach(() => {
        apiGetNodeRegistry.mockReset()
        apiGetRegistry.mockReset()
        apiValidateGraph.mockReset()
        apiCreateRule.mockReset()
        apiUpdateRule.mockReset()
    })

    it('loadNodeRegistry падает на FALLBACK_REGISTRY при ошибке v2', async () => {
        apiGetNodeRegistry.mockRejectedValue(new Error('404'))
        apiGetRegistry.mockRejectedValue(new Error('404'))
        const { registry, source } = await loadNodeRegistry('p1')
        expect(registry.triggers.length).toBeGreaterThan(0)
        expect(registry).toEqual(FALLBACK_REGISTRY)
        expect(source).toBe('fallback')
    })

    it('validateWorkflowGraph возвращает issues при ok=true', async () => {
        apiValidateGraph.mockResolvedValue({
            ok: true,
            issues: [{ code: 'x', message: 'warn', severity: 'warning' }],
        })
        const res = await validateWorkflowGraph(
            { version: 2, nodes: [], edges: [] },
            'p1',
        )
        expect(res.ok).toBe(true)
        if (res.ok) expect(res.issues).toHaveLength(1)
    })

    it('saveWorkflow создаёт правило через apiCreateRule', async () => {
        apiCreateRule.mockResolvedValue({ id: 'rule-new' })
        const res = await saveWorkflow(
            {
                name: 'Test',
                enabled: false,
                priority: 100,
                notifyOnFailure: null,
                triggerType: 'crm.deal.created',
                graph: { version: 2, nodes: [], edges: [] },
            },
            'p1',
        )
        expect(res.ok).toBe(true)
        if (res.ok) expect(res.ruleId).toBe('rule-new')
    })

    it('saveWorkflow обновляет правило через apiUpdateRule', async () => {
        apiUpdateRule.mockResolvedValue({ id: 'rule-1' })
        const res = await saveWorkflow(
            {
                ruleId: 'rule-1',
                name: 'Updated',
                enabled: true,
                priority: 50,
                notifyOnFailure: null,
                triggerType: 'crm.deal.created',
                graph: { version: 2, nodes: [], edges: [] },
            },
            'p1',
        )
        expect(res.ok).toBe(true)
        expect(apiUpdateRule).toHaveBeenCalled()
    })

    it('saveWorkflow возвращает ошибку при 404 backend', async () => {
        apiCreateRule.mockRejectedValue({ response: { status: 404 } })
        const res = await saveWorkflow(
            {
                name: 'Test',
                enabled: false,
                priority: 100,
                notifyOnFailure: null,
                triggerType: 'crm.deal.created',
                graph: { version: 2, nodes: [], edges: [] },
            },
            'p1',
        )
        expect(res.ok).toBe(false)
        if (!res.ok) expect(res.message).toContain('backend automation-v2')
    })

    it('loadNodeRegistry маппит v2 node-registry', async () => {
        apiGetNodeRegistry.mockResolvedValue({
            triggers: [{ subtype: 'crm.deal.created' }],
            conditions: [],
            branches: [],
            actions: [{ subtype: 'create_task' }],
        })
        const { registry, source } = await loadNodeRegistry('p1')
        expect(registry.triggers[0].id).toBe('crm.deal.created')
        expect(registry.actions[0].id).toBe('create_task')
        expect(source).toBe('v2')
    })

    it('loadNodeRegistry падает на legacy registry при пустом v2', async () => {
        apiGetNodeRegistry.mockResolvedValue({
            triggers: [],
            conditions: [],
            branches: [],
            actions: [],
        })
        apiGetRegistry.mockResolvedValue({
            triggers: [{ id: 'crm.contact.created', eventName: 'Контакт' }],
            actions: [],
        })
        const { registry, source } = await loadNodeRegistry('p1')
        expect(registry.triggers[0].id).toBe('crm.contact.created')
        expect(source).toBe('legacy')
    })

    it('validateWorkflowGraph возвращает message при 404', async () => {
        apiValidateGraph.mockRejectedValue({ response: { status: 404 } })
        const res = await validateWorkflowGraph(
            { version: 2, nodes: [], edges: [] },
            'p1',
        )
        expect(res.ok).toBe(false)
        if (!res.ok) expect(res.message).toContain('Серверная валидация недоступна')
    })
})
