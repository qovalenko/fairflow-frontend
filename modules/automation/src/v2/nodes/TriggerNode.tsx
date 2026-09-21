import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { PiLightningDuotone } from 'react-icons/pi'
import type { WorkflowNode, TriggerNodeData } from '../types'
import { triggerLabel } from '../registry'
import { useRegistry } from '../registryContext'
import { NodeShell } from './nodeChrome'
import { qa } from '../../qa'

/** Триггер — точка входа. 1× source-handle `out` (снизу), нет target. */
function TriggerNodeImpl({ id, data, selected }: NodeProps<WorkflowNode>) {
    const d = data as TriggerNodeData & { pathHighlighted?: boolean }
    const registry = useRegistry()
    return (
        <>
            <NodeShell
                selected={selected}
                error={d.error}
                accent="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                icon={<PiLightningDuotone className="w-4 h-4" />}
                title="Триггер"
                qaId={
                    d.pathHighlighted
                        ? 'automation.v2editor.nodeHighlighted'
                        : 'automation.v2editor.node'
                }
                qaData={{ node: id, kind: 'trigger' }}
            >
                {d.triggerType ? (
                    <span className="font-medium text-gray-700 dark:text-gray-200">
                        {triggerLabel(registry, d.triggerType)}
                    </span>
                ) : (
                    <span className="text-gray-400 italic">Выберите событие</span>
                )}
            </NodeShell>
            <Handle
                type="source"
                position={Position.Bottom}
                id="out"
                {...qa('automation.v2editor.handleOut', { node: id })}
            />
        </>
    )
}

export const TriggerNode = memo(TriggerNodeImpl)
