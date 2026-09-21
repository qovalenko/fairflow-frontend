import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { PiFunnelDuotone } from 'react-icons/pi'
import type { WorkflowNode, ConditionNodeData } from '../types'
import { OPERATOR_OPTIONS } from '../registry'
import { NodeShell } from './nodeChrome'
import { qa } from '../../qa'

/**
 * Условие — линейный фильтр.
 * target `in` (сверху) + 2 source-handle: `true` (зелёный) / `false` (красный).
 */
function ConditionNodeImpl({ id, data, selected }: NodeProps<WorkflowNode>) {
    const d = data as ConditionNodeData & { pathHighlighted?: boolean }
    const opLabel = OPERATOR_OPTIONS.find((o) => o.value === d.op)?.label ?? d.op
    const summary = d.field
        ? `${d.field} ${opLabel}${
              d.op === 'is_empty' || d.op === 'is_not_empty' ? '' : ` ${d.value || '…'}`
          }`
        : null
    return (
        <>
            <Handle
                type="target"
                position={Position.Top}
                id="in"
                {...qa('automation.v2editor.handleIn', { node: id })}
            />
            <NodeShell
                selected={selected}
                error={d.error}
                accent="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                icon={<PiFunnelDuotone className="w-4 h-4" />}
                title="Если"
                qaId={
                    d.pathHighlighted
                        ? 'automation.v2editor.nodeHighlighted'
                        : 'automation.v2editor.node'
                }
                qaData={{ node: id, kind: 'condition' }}
            >
                {summary ? (
                    <span className="text-gray-700 dark:text-gray-200 break-words">
                        {summary}
                    </span>
                ) : (
                    <span className="text-gray-400 italic">Условие не задано</span>
                )}
                <div className="flex justify-between text-[10px] mt-1.5 text-gray-400">
                    <span>да →</span>
                    <span>нет →</span>
                </div>
            </NodeShell>
            <Handle
                type="source"
                position={Position.Bottom}
                id="true"
                style={{ left: '30%', background: '#10b981' }}
                {...qa('automation.v2editor.handleTrue', { node: id })}
            />
            <Handle
                type="source"
                position={Position.Bottom}
                id="false"
                style={{ left: '70%', background: '#ef4444' }}
                {...qa('automation.v2editor.handleFalse', { node: id })}
            />
        </>
    )
}

export const ConditionNode = memo(ConditionNodeImpl)
