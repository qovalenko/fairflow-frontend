import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { PiGearSixDuotone, PiWarningDuotone } from 'react-icons/pi'
import type { WorkflowNode, ActionNodeData } from '../types'
import { actionLabel } from '../registry'
import { useRegistry } from '../registryContext'
import { NodeShell } from './nodeChrome'
import { qa } from '../../qa'

/** Действие. target `in` (сверху) + source `next` (снизу, цепочка действий). */
function ActionNodeImpl({ id, data, selected }: NodeProps<WorkflowNode>) {
    const d = data as ActionNodeData & { pathHighlighted?: boolean }
    const registry = useRegistry()
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
                accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                icon={<PiGearSixDuotone className="w-4 h-4" />}
                title="Действие"
                qaId={
                    d.pathHighlighted
                        ? 'automation.v2editor.nodeHighlighted'
                        : 'automation.v2editor.node'
                }
                qaData={{ node: id, kind: 'action' }}
            >
                {d.actionType ? (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-gray-700 dark:text-gray-200">
                            {actionLabel(registry, d.actionType)}
                        </span>
                        {d.externalEffect && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                                <PiWarningDuotone className="w-3 h-3" /> внешний
                            </span>
                        )}
                    </div>
                ) : (
                    <span className="text-gray-400 italic">Выберите действие</span>
                )}
            </NodeShell>
            <Handle
                type="source"
                position={Position.Bottom}
                id="next"
                {...qa('automation.v2editor.handleNext', { node: id })}
            />
        </>
    )
}

export const ActionNode = memo(ActionNodeImpl)
