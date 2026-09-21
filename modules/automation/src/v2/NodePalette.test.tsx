import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FALLBACK_REGISTRY } from './registry'
import { useWorkflowStore } from './workflowStore'

vi.mock('@xyflow/react', () => ({
    useReactFlow: () => ({
        screenToFlowPosition: () => ({ x: 100, y: 100 }),
    }),
}))

import NodePalette from './NodePalette'

describe('NodePalette', () => {
    beforeEach(() => {
        useWorkflowStore.getState().reset()
    })

    it('readOnly показывает заглушку', () => {
        render(
            <NodePalette
                readOnly
                registry={FALLBACK_REGISTRY}
                loading={false}
                canWrite
                canManage
            />,
        )
        expect(screen.getByText('Палитра недоступна в режиме просмотра.')).toBeInTheDocument()
    })

    it('loading показывает скелетоны вместо типов', () => {
        render(
            <NodePalette
                readOnly={false}
                registry={FALLBACK_REGISTRY}
                loading
                canWrite
                canManage
            />,
        )
        expect(screen.getByText('Перетащите на холст')).toBeInTheDocument()
        expect(screen.queryByText('Сделка создана')).not.toBeInTheDocument()
    })

    it('скрывает external-действия без manage', () => {
        render(
            <NodePalette
                readOnly={false}
                registry={{
                    ...FALLBACK_REGISTRY,
                    actions: [
                        {
                            id: 'internal',
                            label: 'Internal',
                            kind: 'action',
                            externalEffect: false,
                        },
                        {
                            id: 'webhook',
                            label: 'Webhook',
                            kind: 'action',
                            externalEffect: true,
                        },
                    ],
                }}
                loading={false}
                canWrite
                canManage={false}
            />,
        )
        expect(screen.getByText('Internal')).toBeInTheDocument()
        expect(screen.queryByText('Webhook')).not.toBeInTheDocument()
    })

    it('клик по триггеру добавляет ноду в стор', async () => {
        render(
            <NodePalette
                readOnly={false}
                registry={FALLBACK_REGISTRY}
                loading={false}
                canWrite
                canManage
            />,
        )
        await userEvent.click(screen.getByRole('button', { name: 'Сделка создана' }))
        expect(useWorkflowStore.getState().nodes).toHaveLength(1)
        expect(useWorkflowStore.getState().nodes[0].type).toBe('trigger')
    })

    it('без canWrite блокирует добавление', () => {
        render(
            <NodePalette
                readOnly={false}
                registry={FALLBACK_REGISTRY}
                loading={false}
                canWrite={false}
                canManage
            />,
        )
        expect(
            screen.getByText('Нет права automation:write — добавление недоступно.'),
        ).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Сделка создана' })).toBeDisabled()
    })

    it('триггер disabled если уже есть триггер', () => {
        useWorkflowStore.getState().addNode('trigger', 'crm.deal.created', { x: 0, y: 0 })
        render(
            <NodePalette
                readOnly={false}
                registry={FALLBACK_REGISTRY}
                loading={false}
                canWrite
                canManage
            />,
        )
        expect(screen.getByRole('button', { name: 'Сделка создана' })).toBeDisabled()
    })
})
