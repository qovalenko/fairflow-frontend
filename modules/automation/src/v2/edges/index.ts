import type { EdgeTypes } from '@xyflow/react'
import { QaSmoothStepEdge } from './QaSmoothStepEdge'

/** Стабильная ссылка (модуль-скоуп) — требование React Flow. */
export const edgeTypes: EdgeTypes = {
    qaSmoothstep: QaSmoothStepEdge,
}

export { QaSmoothStepEdge }
