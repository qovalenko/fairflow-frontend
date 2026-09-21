/**
 * workflowStore — zustand-стор канвы v2 (PLAN.md §3.1).
 *
 * Держит nodes/edges + selectedNodeId + dirty + ruleMeta, доменные экшены и
 * маппинг ↔ GraphSpec. Иммутабельные апдейты нод (React Flow v12): applyNodeChanges /
 * applyEdgeChanges / addEdge, никаких прямых мутаций.
 *
 * Стор — singleton-shared в федерации (vite.config shared.zustand). Чтобы повторный
 * вход в редактор не делил грязное состояние — WorkflowEditor зовёт reset() на mount.
 */

import { create } from 'zustand'
import {
    applyNodeChanges,
    applyEdgeChanges,
    addEdge,
    type NodeChange,
    type EdgeChange,
    type Connection,
    type XYPosition,
} from '@xyflow/react'
import type {
    WorkflowNode,
    WorkflowEdge,
    WorkflowNodeData,
    GraphSpec,
    NodeKind,
} from './types'
import type { RuleState } from '@/services/AutomationService'
import { defaultNodeData, toGraphSpec, fromGraphSpec, uid } from './graphSpec'
import { wouldCreateCycle } from './validate'

export interface RuleMeta {
    id?: string
    name: string
    priority: number
    notifyOnFailure: string | null
    enabled: boolean
    state?: RuleState
}

const emptyMeta = (): RuleMeta => ({
    name: '',
    priority: 100,
    notifyOnFailure: null,
    enabled: false,
})

export interface WorkflowState {
    nodes: WorkflowNode[]
    edges: WorkflowEdge[]
    selectedNodeId: string | null
    dirty: boolean
    ruleMeta: RuleMeta
    /** Последнее сообщение о конфликте соединения (для toast в канве). */
    lastConnectError: string | null
    /** FR-AUTOM-530: node ids from a journal execution path overlay. */
    executedPathNodeIds: string[]

    onNodesChange: (changes: NodeChange<WorkflowNode>[]) => void
    onEdgesChange: (changes: EdgeChange<WorkflowEdge>[]) => void
    onConnect: (connection: Connection) => void
    addNode: (kind: NodeKind, typeId: string, position: XYPosition) => void
    updateNodeData: (id: string, patch: Partial<WorkflowNodeData>) => void
    removeNode: (id: string) => void
    setSelectedNodeId: (id: string | null) => void
    setExecutedPath: (ids: string[]) => void
    setRuleMeta: (patch: Partial<RuleMeta>) => void
    setNodeErrors: (errors: Record<string, string>) => void
    markDirty: () => void
    clearDirty: () => void

    loadFromGraphSpec: (spec: GraphSpec) => void
    setGraph: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void
    toGraphSpec: () => GraphSpec
    hasTrigger: () => boolean
    reset: () => void
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    dirty: false,
    ruleMeta: emptyMeta(),
    lastConnectError: null,
    executedPathNodeIds: [],

    onNodesChange: (changes) =>
        set((s) => {
            const nodes = applyNodeChanges(changes, s.nodes)
            // dirty только на содержательных изменениях (position/remove/add),
            // не на select/dimensions — иначе «грязно» сразу после загрузки.
            const meaningful = changes.some(
                (c) =>
                    c.type === 'position' ||
                    c.type === 'remove' ||
                    c.type === 'add' ||
                    c.type === 'replace',
            )
            return { nodes, dirty: s.dirty || meaningful }
        }),

    onEdgesChange: (changes) =>
        set((s) => {
            const edges = applyEdgeChanges(changes, s.edges)
            const meaningful = changes.some(
                (c) => c.type === 'remove' || c.type === 'add' || c.type === 'replace',
            )
            return { edges, dirty: s.dirty || meaningful }
        }),

    onConnect: (connection) =>
        set((s) => {
            if (!connection.source || !connection.target) return {}
            // Анти-петля: запрет циклов (control-flow = DAG).
            if (wouldCreateCycle(s.edges, connection.source, connection.target)) {
                return { lastConnectError: 'Циклы запрещены.' }
            }
            // Дубликат ребра между теми же handle — игнор.
            const dup = s.edges.some(
                (e) =>
                    e.source === connection.source &&
                    e.target === connection.target &&
                    (e.sourceHandle ?? null) === (connection.sourceHandle ?? null),
            )
            if (dup) return { lastConnectError: null }
            return {
                edges: addEdge(connection, s.edges),
                dirty: true,
                lastConnectError: null,
            }
        }),

    addNode: (kind, typeId, position) =>
        set((s) => {
            // Триггер — ровно один (точка входа).
            if (kind === 'trigger' && s.nodes.some((n) => n.type === 'trigger')) {
                return { lastConnectError: 'В сценарии уже есть триггер.' }
            }
            const id = uid(kind)
            const node: WorkflowNode = {
                id,
                type: kind,
                position,
                data: defaultNodeData(kind, typeId),
            }
            return {
                nodes: [...s.nodes, node],
                selectedNodeId: id,
                dirty: true,
            }
        }),

    updateNodeData: (id, patch) =>
        set((s) => ({
            nodes: s.nodes.map((n) =>
                n.id === id
                    ? ({ ...n, data: { ...n.data, ...patch } } as WorkflowNode)
                    : n,
            ),
            dirty: true,
        })),

    removeNode: (id) =>
        set((s) => ({
            nodes: s.nodes.filter((n) => n.id !== id),
            edges: s.edges.filter((e) => e.source !== id && e.target !== id),
            selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
            dirty: true,
        })),

    setSelectedNodeId: (id) => set({ selectedNodeId: id }),

    setExecutedPath: (ids) => set({ executedPathNodeIds: ids }),

    setRuleMeta: (patch) =>
        set((s) => ({ ruleMeta: { ...s.ruleMeta, ...patch }, dirty: true })),

    setNodeErrors: (errors) =>
        set((s) => ({
            nodes: s.nodes.map((n) => {
                const err = errors[n.id]
                const cur = (n.data as WorkflowNodeData).error
                if (cur === err) return n
                return { ...n, data: { ...n.data, error: err } } as WorkflowNode
            }),
        })),

    markDirty: () => set({ dirty: true }),
    clearDirty: () => set({ dirty: false }),

    loadFromGraphSpec: (spec) => {
        const { nodes, edges } = fromGraphSpec(spec)
        set({ nodes, edges, selectedNodeId: null, dirty: false })
    },

    setGraph: (nodes, edges) =>
        set({ nodes, edges, selectedNodeId: null, dirty: false }),

    toGraphSpec: () => toGraphSpec(get().nodes, get().edges),

    hasTrigger: () => get().nodes.some((n) => n.type === 'trigger'),

    reset: () =>
        set({
            nodes: [],
            edges: [],
            selectedNodeId: null,
            dirty: false,
            ruleMeta: emptyMeta(),
            lastConnectError: null,
            executedPathNodeIds: [],
        }),
}))
