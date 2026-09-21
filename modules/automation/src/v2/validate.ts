/**
 * Клиентская валидация графа (PLAN.md §5 «Клиентская валидация»).
 * Серверная (компиляция ABAC) — на save, добавочно к этой.
 */

import type {
    WorkflowNode,
    WorkflowEdge,
    GraphValidationIssue,
    TriggerNodeData,
    ActionNodeData,
} from './types'

/** Создаёт цикл ли добавление ребра source→target? (DFS по существующим рёбрам). */
export function wouldCreateCycle(
    edges: WorkflowEdge[],
    source: string,
    target: string,
): boolean {
    if (source === target) return true
    // Есть ли путь target ⇒ source (тогда source→target замкнёт цикл)?
    const adj = new Map<string, string[]>()
    for (const e of edges) {
        const arr = adj.get(e.source) ?? []
        arr.push(e.target)
        adj.set(e.source, arr)
    }
    const stack = [target]
    const seen = new Set<string>()
    while (stack.length) {
        const cur = stack.pop()!
        if (cur === source) return true
        if (seen.has(cur)) continue
        seen.add(cur)
        for (const n of adj.get(cur) ?? []) stack.push(n)
    }
    return false
}

/** Множество нод, достижимых от триггера по рёбрам. */
function reachableFrom(
    startId: string,
    edges: WorkflowEdge[],
): Set<string> {
    const adj = new Map<string, string[]>()
    for (const e of edges) {
        const arr = adj.get(e.source) ?? []
        arr.push(e.target)
        adj.set(e.source, arr)
    }
    const seen = new Set<string>([startId])
    const stack = [startId]
    while (stack.length) {
        const cur = stack.pop()!
        for (const n of adj.get(cur) ?? []) {
            if (!seen.has(n)) {
                seen.add(n)
                stack.push(n)
            }
        }
    }
    return seen
}

export function validateGraph(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
): GraphValidationIssue[] {
    const issues: GraphValidationIssue[] = []

    const triggers = nodes.filter((n) => n.type === 'trigger')
    if (triggers.length === 0) {
        issues.push({
            code: 'no_trigger',
            message: 'Добавьте триггер — точку входа сценария.',
            severity: 'error',
        })
    } else if (triggers.length > 1) {
        for (const t of triggers.slice(1)) {
            issues.push({
                nodeId: t.id,
                code: 'multiple_triggers',
                message: 'В сценарии допустим только один триггер.',
                severity: 'error',
            })
        }
    }
    for (const t of triggers) {
        if (!(t.data as TriggerNodeData).triggerType) {
            issues.push({
                nodeId: t.id,
                code: 'trigger_no_type',
                message: 'У триггера не выбрано событие.',
                severity: 'error',
            })
        }
    }

    const actions = nodes.filter((n) => n.type === 'action')
    if (actions.length === 0) {
        issues.push({
            code: 'no_action',
            message: 'Добавьте хотя бы одно действие.',
            severity: 'error',
        })
    }
    for (const a of actions) {
        const d = a.data as ActionNodeData
        if (!d.actionType) {
            issues.push({
                nodeId: a.id,
                code: 'action_no_type',
                message: 'У действия не выбран тип.',
                severity: 'error',
            })
        }
        if (d.actionType === 'send_webhook' && !d.connectionId) {
            issues.push({
                nodeId: a.id,
                code: 'webhook_no_connection',
                message: 'Webhook требует выбранный connection.',
                severity: 'error',
            })
        }
    }

    // Достижимость от триггера (висячие ноды).
    if (triggers.length >= 1) {
        const reachable = reachableFrom(triggers[0].id, edges)
        for (const n of nodes) {
            if (n.type === 'trigger') continue
            if (!reachable.has(n.id)) {
                issues.push({
                    nodeId: n.id,
                    code: 'unreachable',
                    message: 'Нода не связана с триггером.',
                    severity: 'warning',
                })
            }
        }
    }

    return issues
}
