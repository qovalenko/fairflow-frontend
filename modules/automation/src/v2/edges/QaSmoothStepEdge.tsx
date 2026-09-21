import { memo } from 'react'
import {
    BaseEdge,
    getSmoothStepPath,
    type EdgeProps,
} from '@xyflow/react'
import { qa } from '../../qa'

/** Smooth-step edge with stable data-qa-id for e2e (scenario #171). */
function QaSmoothStepEdgeImpl({
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    ...props
}: EdgeProps) {
    const [edgePath, labelX, labelY] = getSmoothStepPath(props)
    return (
        <BaseEdge
            id={id}
            path={edgePath}
            labelX={labelX}
            labelY={labelY}
            {...props}
            {...qa('automation.v2editor.edge', {
                edge: id,
                source,
                target,
                handle: sourceHandle ?? 'out',
            })}
        />
    )
}

export const QaSmoothStepEdge = memo(QaSmoothStepEdgeImpl)
