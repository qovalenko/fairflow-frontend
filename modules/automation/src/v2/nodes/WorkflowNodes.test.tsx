import type { ReactNode } from 'react'
import type { NodeProps } from '@xyflow/react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RegistryProvider } from '../registryContext'
import { FALLBACK_REGISTRY } from '../registry'
import { TriggerNode } from './TriggerNode'
import { ActionNode } from './ActionNode'
import { ConditionNode } from './ConditionNode'
import { BranchNode } from './BranchNode'

vi.mock('@xyflow/react', () => ({
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' },
}))

const wrap = (ui: ReactNode) => (
    <RegistryProvider value={FALLBACK_REGISTRY}>{ui}</RegistryProvider>
)

const baseProps = {
    selected: false,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
} as const

import type { WorkflowNode } from '../types'

const nodeProps = (
    id: string,
    type: string,
    data: WorkflowNode['data'],
): NodeProps<WorkflowNode> => ({
    id,
    type,
    data,
    ...baseProps,
})

describe('Workflow node chrome', () => {
    it('TriggerNode показывает подпись события', () => {
        render(
            wrap(
                <TriggerNode
                    {...nodeProps('t1', 'trigger', {
                        label: 'T',
                        triggerType: 'crm.deal.created',
                        triggerConfig: {},
                    })}
                />,
            ),
        )
        expect(screen.getByText('Сделка создана')).toBeInTheDocument()
    })

    it('TriggerNode без события показывает placeholder', () => {
        render(
            wrap(
                <TriggerNode
                    {...nodeProps('t1', 'trigger', {
                        label: 'T',
                        triggerType: '',
                        triggerConfig: {},
                    })}
                />,
            ),
        )
        expect(screen.getByText('Выберите событие')).toBeInTheDocument()
    })

    it('ActionNode помечает external effect', () => {
        render(
            wrap(
                <ActionNode
                    {...nodeProps('a1', 'action', {
                        label: 'A',
                        actionType: 'send_webhook',
                        config: {},
                        externalEffect: true,
                    })}
                />,
            ),
        )
        expect(screen.getByText('Отправить webhook')).toBeInTheDocument()
        expect(screen.getByText('внешний')).toBeInTheDocument()
    })

    it('ConditionNode показывает summary предиката', () => {
        render(
            wrap(
                <ConditionNode
                    {...nodeProps('c1', 'condition', {
                        label: 'C',
                        field: 'deal.amount',
                        op: 'gt',
                        value: '100',
                    })}
                />,
            ),
        )
        expect(screen.getByText(/deal\.amount/)).toBeInTheDocument()
    })

    it('BranchNode перечисляет ветки', () => {
        render(
            wrap(
                <BranchNode
                    {...nodeProps('b1', 'branch', {
                        label: 'B',
                        cases: [
                            { id: 'case1', label: 'VIP' },
                            { id: 'case2', label: 'Обычный' },
                        ],
                    })}
                />,
            ),
        )
        expect(screen.getByText('VIP')).toBeInTheDocument()
        expect(screen.getByText('Обычный')).toBeInTheDocument()
    })
})
