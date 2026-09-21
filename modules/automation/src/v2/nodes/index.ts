import type { NodeTypes } from '@xyflow/react'
import { TriggerNode } from './TriggerNode'
import { ConditionNode } from './ConditionNode'
import { BranchNode } from './BranchNode'
import { ActionNode } from './ActionNode'

/** Реестр кастомных нод для <ReactFlow nodeTypes>. Стабильная ссылка (модуль-скоуп). */
export const nodeTypes: NodeTypes = {
    trigger: TriggerNode,
    condition: ConditionNode,
    branch: BranchNode,
    action: ActionNode,
}

export { TriggerNode, ConditionNode, BranchNode, ActionNode }
