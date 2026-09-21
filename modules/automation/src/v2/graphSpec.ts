/**
 * Маппинг nodes/edges (React Flow) ↔ GraphSpec (backend контракт).
 *
 * GraphSpec — реальный контракт control-flow (PLAN.md §1), НЕ Variant-A downgrade.
 * condition хранит предикат как ABAC-узел в config.predicate.
 */

import type {
    WorkflowNode,
    WorkflowEdge,
    GraphSpec,
    GraphSpecNode,
    AbacNode,
    NodeKind,
    TriggerNodeData,
    ConditionNodeData,
    BranchNodeData,
    ActionNodeData,
} from './types'

let seq = 0
/** Детерминированно-уникальный id ноды/ветки в рамках сессии. */
export function uid(prefix = 'n'): string {
    seq += 1
    try {
        return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
    } catch {
        return `${prefix}_${Date.now().toString(36)}_${seq}`
    }
}

// ─── Дефолты data по типу ноды ───────────────────────────────────────────────

export function defaultNodeData(kind: NodeKind, typeId: string): WorkflowNode['data'] {
    switch (kind) {
        case 'trigger':
            return {
                label: 'Триггер',
                triggerType: typeId,
                triggerConfig: {},
            } as TriggerNodeData
        case 'condition':
            return {
                label: 'Условие',
                field: '',
                op: 'eq',
                value: '',
            } as ConditionNodeData
        case 'branch':
            return {
                label: 'Ветвление',
                cases: [
                    { id: uid('case'), label: 'Да' },
                    { id: uid('case'), label: 'Нет' },
                ],
            } as BranchNodeData
        case 'action':
        default:
            return {
                label: 'Действие',
                actionType: typeId === 'action' ? '' : typeId,
                config: {},
                externalEffect: false,
            } as ActionNodeData
    }
}

// ─── data → config (для GraphSpec) ───────────────────────────────────────────

/** Простой предикат поле/оператор/значение → ABAC-лист. */
function leafFromFields(field: string, op: string, value: string): AbacNode {
    return { field, op, value }
}

function nodeConfig(node: WorkflowNode): Record<string, unknown> {
    const kind = node.type as NodeKind
    switch (kind) {
        case 'trigger': {
            const d = node.data as TriggerNodeData
            // backend-валидатор читает trigger id из trigger_id|triggerId|event_name
            // (graph-validator.ts) — даём triggerId; triggerType/triggerConfig
            // оставляем для обратной загрузки графа во FE (fromGraphSpec).
            return {
                triggerId: d.triggerType,
                triggerType: d.triggerType,
                params: d.triggerConfig ?? {},
                triggerConfig: d.triggerConfig ?? {},
            }
        }
        case 'condition': {
            const d = node.data as ConditionNodeData
            return { predicate: leafFromFields(d.field, d.op, d.value) }
        }
        case 'branch': {
            const d = node.data as BranchNodeData
            return {
                cases: (d.cases ?? []).map((c) => ({
                    id: c.id,
                    label: c.label,
                    predicate:
                        c.field || c.value
                            ? leafFromFields(c.field ?? '', c.op ?? 'eq', c.value ?? '')
                            : undefined,
                })),
            }
        }
        case 'action':
        default: {
            const d = node.data as ActionNodeData
            // backend-валидатор читает action id из action_id|actionId|type
            // (graph-validator.ts) — даём actionId; actionType/config для reload.
            return {
                actionId: d.actionType,
                actionType: d.actionType,
                connectionId: d.connectionId,
                params: d.config ?? {},
                config: d.config ?? {},
                externalEffect: d.externalEffect ?? false,
            }
        }
    }
}

/** Стор → backend. UI-only поля (label/error/selected) выкидываются. */
export function toGraphSpec(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
): GraphSpec {
    return {
        version: 2,
        nodes: nodes.map<GraphSpecNode>((n) => ({
            id: n.id,
            type: n.type as NodeKind,
            position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
            config: nodeConfig(n),
        })),
        edges: edges.map((e) => ({
            id: e.id || `e_${e.source}_${e.sourceHandle ?? 'out'}_${e.target}`,
            source: e.source,
            sourceHandle: e.sourceHandle ?? null,
            target: e.target,
        })),
    }
}

// ─── config → data (backend → стор) ──────────────────────────────────────────

function num(v: unknown, d: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : d
}

function dataFromConfig(spec: GraphSpecNode): WorkflowNode['data'] {
    const cfg = spec.config ?? {}
    switch (spec.type) {
        case 'trigger':
            return {
                label: 'Триггер',
                triggerType: String(cfg.triggerType ?? ''),
                triggerConfig: (cfg.triggerConfig as Record<string, unknown>) ?? {},
            } as TriggerNodeData
        case 'condition': {
            const pred = cfg.predicate as
                | { field?: string; op?: string; value?: unknown }
                | undefined
            return {
                label: 'Условие',
                field: String(pred?.field ?? ''),
                op: String(pred?.op ?? 'eq'),
                value: pred?.value != null ? String(pred.value) : '',
            } as ConditionNodeData
        }
        case 'branch': {
            const cases = (cfg.cases as Array<Record<string, unknown>>) ?? []
            return {
                label: 'Ветвление',
                cases: cases.length
                    ? cases.map((c) => {
                          const pred = c.predicate as
                              | { field?: string; op?: string; value?: unknown }
                              | undefined
                          return {
                              id: String(c.id ?? uid('case')),
                              label: String(c.label ?? 'Ветка'),
                              field: pred?.field != null ? String(pred.field) : undefined,
                              op: pred?.op != null ? String(pred.op) : undefined,
                              value: pred?.value != null ? String(pred.value) : undefined,
                          }
                      })
                    : [
                          { id: uid('case'), label: 'Да' },
                          { id: uid('case'), label: 'Нет' },
                      ],
            } as BranchNodeData
        }
        case 'action':
        default:
            return {
                label: 'Действие',
                actionType: String(cfg.actionType ?? ''),
                connectionId: cfg.connectionId ? String(cfg.connectionId) : undefined,
                config: (cfg.config as Record<string, unknown>) ?? {},
                externalEffect: Boolean(cfg.externalEffect),
            } as ActionNodeData
    }
}

/** Backend → стор. */
export function fromGraphSpec(spec: GraphSpec): {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
} {
    const nodes = (spec.nodes ?? []).map<WorkflowNode>((n) => ({
        id: n.id,
        type: n.type,
        position: { x: num(n.position?.x, 0), y: num(n.position?.y, 0) },
        data: dataFromConfig(n),
    }))
    const edges = (spec.edges ?? []).map<WorkflowEdge>((e, i) => ({
        id: `e_${e.source}_${e.sourceHandle ?? 'out'}_${e.target}_${i}`,
        source: e.source,
        sourceHandle: e.sourceHandle ?? undefined,
        target: e.target,
    }))
    return { nodes, edges }
}

/**
 * Upgrade СТАРОГО flat-правила (triggerType + conditionsJson + actionsJson)
 * в линейный граф: trigger → condition-цепочка → action-цепочка.
 * Даёт открытие правил, созданных формой v1, в редакторе v2.
 */
export function graphFromFlatRule(rule: {
    triggerType: string
    conditionsJson?: string
    actionsJson?: string
}): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
    const nodes: WorkflowNode[] = []
    const edges: WorkflowEdge[] = []
    let y = 0
    const STEP = 140

    const triggerId = uid('trigger')
    nodes.push({
        id: triggerId,
        type: 'trigger',
        position: { x: 240, y },
        data: {
            label: 'Триггер',
            triggerType: rule.triggerType,
            triggerConfig: {},
        } as TriggerNodeData,
    })
    let prevId = triggerId
    let prevHandle: string = 'out'

    // Условия (op:and плоский список) → цепочка condition-нод.
    try {
        const parsed = rule.conditionsJson ? JSON.parse(rule.conditionsJson) : null
        const args: Array<{ field?: string; op?: string; value?: unknown }> =
            parsed?.args ?? []
        for (const a of args) {
            y += STEP
            const id = uid('cond')
            nodes.push({
                id,
                type: 'condition',
                position: { x: 240, y },
                data: {
                    label: 'Условие',
                    field: a.field ?? '',
                    op: a.op ?? 'eq',
                    value: a.value != null ? String(a.value) : '',
                } as ConditionNodeData,
            })
            edges.push({
                id: `e_${prevId}_${id}`,
                source: prevId,
                sourceHandle: prevHandle,
                target: id,
            })
            prevId = id
            prevHandle = 'then'
        }
    } catch {
        /* битый conditionsJson — без условий */
    }

    // Действия → цепочка action-нод.
    try {
        const acts: Array<{
            type?: string
            connectionId?: string
            config?: Record<string, unknown>
        }> = rule.actionsJson ? JSON.parse(rule.actionsJson) : []
        for (const a of acts) {
            y += STEP
            const id = uid('act')
            nodes.push({
                id,
                type: 'action',
                position: { x: 240, y },
                data: {
                    label: 'Действие',
                    actionType: a.type ?? '',
                    connectionId: a.connectionId,
                    config: a.config ?? {},
                    externalEffect: false,
                } as ActionNodeData,
            })
            edges.push({
                id: `e_${prevId}_${id}`,
                source: prevId,
                sourceHandle: prevHandle,
                target: id,
            })
            prevId = id
            prevHandle = 'next'
        }
    } catch {
        /* битый actionsJson — без действий */
    }

    return { nodes, edges }
}
