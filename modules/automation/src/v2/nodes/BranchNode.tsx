import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { PiTreeStructureDuotone } from 'react-icons/pi'
import type { WorkflowNode, BranchNodeData } from '../types'
import { NodeShell } from './nodeChrome'
import { qa } from '../../qa'

/**
 * Ветвление (case/else). target `in` (сверху) + по одному source-handle на ветку
 * (`case:<branchId>`), равномерно по нижней грани. Минимум 2 ветки.
 */
function BranchNodeImpl({ id, data, selected }: NodeProps<WorkflowNode>) {
    const d = data as BranchNodeData & { pathHighlighted?: boolean }
    const cases = d.cases ?? []
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
                accent="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                icon={<PiTreeStructureDuotone className="w-4 h-4" />}
                title="Ветвление"
                qaId={
                    d.pathHighlighted
                        ? 'automation.v2editor.nodeHighlighted'
                        : 'automation.v2editor.node'
                }
                qaData={{ node: id, kind: 'branch' }}
            >
                <ul className="space-y-0.5">
                    {cases.map((c) => (
                        <li
                            key={c.id}
                            className="flex items-center justify-between text-gray-600 dark:text-gray-300"
                        >
                            <span className="truncate">{c.label || 'Ветка'}</span>
                            <span className="text-[10px] text-gray-400">→</span>
                        </li>
                    ))}
                    {cases.length === 0 && (
                        <li className="text-gray-400 italic">Нет веток</li>
                    )}
                </ul>
            </NodeShell>
            {cases.map((c, i) => {
                const left =
                    cases.length === 1
                        ? 50
                        : 15 + (70 / (cases.length - 1)) * i
                return (
                    <Handle
                        key={c.id}
                        type="source"
                        position={Position.Bottom}
                        id={`case:${c.id}`}
                        style={{ left: `${left}%`, background: '#8b5cf6' }}
                        {...qa('automation.v2editor.handleCase', { node: id, case: c.id })}
                    />
                )
            })}
        </>
    )
}

export const BranchNode = memo(BranchNodeImpl)
