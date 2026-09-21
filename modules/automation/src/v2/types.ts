/**
 * Automation v2 — типы канвы и GraphSpec (control-flow).
 *
 * Источник истины модели: docs/tz/areas/automation-v2/PLAN.md §1.
 * Node = { id, type: trigger|condition|action|branch, position{x,y}, config }
 * Edge = { source, sourceHandle, target }
 * condition хранит предикат как ABAC-узел в config.predicate.
 */

import type { Node, Edge } from '@xyflow/react'

/** Тип ноды control-flow. Совпадает с `node.type` React Flow. */
export type NodeKind = 'trigger' | 'condition' | 'branch' | 'action'

/**
 * ABAC-IR (минимальный) — предикат условия.
 * Лист: { field, op, value }. Узел: { op:'and'|'or'|'not', args:[...] }.
 * Shape совместим с будущим @fairflow/shared/abac (PLAN.md §0).
 */
export type AbacLeaf = {
    field: string
    op: string
    value?: unknown
}
export type AbacGroup = {
    op: 'and' | 'or' | 'not'
    args: AbacNode[]
}
export type AbacNode = AbacLeaf | AbacGroup

export function isAbacGroup(n: AbacNode): n is AbacGroup {
    return (
        (n as AbacGroup).op === 'and' ||
        (n as AbacGroup).op === 'or' ||
        (n as AbacGroup).op === 'not'
    )
}

// ─── data конкретных нод (хранится в node.data) ──────────────────────────────

export interface TriggerNodeData {
    label: string
    triggerType: string
    triggerConfig: Record<string, unknown>
    /** Подсветка ошибки валидации. */
    error?: string
    [key: string]: unknown
}

export interface ConditionNodeData {
    label: string
    /** Простой предикат поле/оператор/значение → сериализуется в ABAC-лист. */
    field: string
    op: string
    value: string
    error?: string
    [key: string]: unknown
}

export interface BranchCase {
    id: string
    label: string
    /** Опц. условие ветки (поле/оператор/значение). */
    field?: string
    op?: string
    value?: string
}

export interface BranchNodeData {
    label: string
    cases: BranchCase[]
    error?: string
    [key: string]: unknown
}

export interface ActionNodeData {
    label: string
    actionType: string
    connectionId?: string
    config: Record<string, unknown>
    externalEffect: boolean
    error?: string
    [key: string]: unknown
}

export type WorkflowNodeData =
    | TriggerNodeData
    | ConditionNodeData
    | BranchNodeData
    | ActionNodeData

export type WorkflowNode = Node<WorkflowNodeData>
export type WorkflowEdge = Edge

// ─── GraphSpec (контракт фронт↔backend) ──────────────────────────────────────

export interface GraphSpecNode {
    id: string
    type: NodeKind
    position: { x: number; y: number }
    config: Record<string, unknown>
}

export interface GraphSpecEdge {
    /** backend graph-validator требует id у каждого ребра (INVALID_HANDLE иначе). */
    id: string
    source: string
    sourceHandle: string | null
    target: string
}

export interface GraphSpec {
    version: 2
    nodes: GraphSpecNode[]
    edges: GraphSpecEdge[]
}

// ─── node-registry (типы доступных нод) ──────────────────────────────────────

export interface NodeTypeDef {
    /** id типа (например crm.deal.created / send_webhook). */
    id: string
    kind: NodeKind
    label: string
    requiredModule?: string
    externalEffect?: boolean
    configSchema?: Record<string, unknown>
}

export interface NodeRegistry {
    triggers: NodeTypeDef[]
    conditions: NodeTypeDef[]
    branches: NodeTypeDef[]
    actions: NodeTypeDef[]
}

/** Проблема валидации графа (клиент/сервер). */
export interface GraphValidationIssue {
    nodeId?: string
    code: string
    message: string
    severity: 'error' | 'warning'
}
