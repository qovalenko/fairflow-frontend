import type { ComponentProps } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SWRConfig } from 'swr'
import { FALLBACK_REGISTRY } from './registry'
import { defaultNodeData } from './graphSpec'
import { useWorkflowStore } from './workflowStore'

const apiListConnections = vi.fn()

vi.mock('@/services/AutomationService', () => ({
    apiListConnections: (...a: unknown[]) => apiListConnections(...a),
}))

import NodePropertiesPanel from './NodePropertiesPanel'

describe('NodePropertiesPanel', () => {
    beforeEach(() => {
        useWorkflowStore.getState().reset()
        apiListConnections.mockResolvedValue({
            list: [{ id: 'conn-1', name: 'Webhook CRM', projectId: 'p1' }],
        })
    })

    const renderPanel = (props?: Partial<ComponentProps<typeof NodePropertiesPanel>>) =>
        render(
            <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
                <NodePropertiesPanel
                    readOnly={false}
                    registry={FALLBACK_REGISTRY}
                    projectId="p1"
                    canManage
                    {...props}
                />
            </SWRConfig>,
        )

    it('без выбранной ноды показывает пустое состояние', () => {
        renderPanel()
        expect(
            screen.getByText('Выберите ноду на холсте, чтобы настроить её.'),
        ).toBeInTheDocument()
    })

    it('для триггера показывает редактор события', () => {
        useWorkflowStore.getState().setGraph(
            [
                {
                    id: 't1',
                    type: 'trigger',
                    position: { x: 0, y: 0 },
                    data: defaultNodeData('trigger', 'crm.deal.created'),
                },
            ],
            [],
        )
        useWorkflowStore.getState().setSelectedNodeId('t1')
        renderPanel()
        expect(screen.getByText('Свойства ноды')).toBeInTheDocument()
        expect(screen.getByText('Событие (триггер) *')).toBeInTheDocument()
    })

    it('readOnly показывает баннер только просмотра', () => {
        useWorkflowStore.getState().setGraph(
            [
                {
                    id: 'c1',
                    type: 'condition',
                    position: { x: 0, y: 0 },
                    data: defaultNodeData('condition', 'condition'),
                },
            ],
            [],
        )
        useWorkflowStore.getState().setSelectedNodeId('c1')
        renderPanel({ readOnly: true })
        expect(
            screen.getByText('Только просмотр — поля заблокированы.'),
        ).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Удалить ноду' })).not.toBeInTheDocument()
    })

    it('удаление ноды убирает её из стора', async () => {
        useWorkflowStore.getState().setGraph(
            [
                {
                    id: 'a1',
                    type: 'action',
                    position: { x: 0, y: 0 },
                    data: { ...defaultNodeData('action', 'create_task'), actionType: 'create_task' },
                },
            ],
            [],
        )
        useWorkflowStore.getState().setSelectedNodeId('a1')
        const user = userEvent.setup()
        renderPanel()
        await user.click(screen.getByRole('button', { name: 'Удалить ноду' }))
        expect(
            screen.getByText('Выберите ноду на холсте, чтобы настроить её.'),
        ).toBeInTheDocument()
        expect(screen.queryByText('Свойства ноды')).not.toBeInTheDocument()
    })

    it('редактор условия сохраняет поле в стор', async () => {
        useWorkflowStore.getState().setGraph(
            [
                {
                    id: 'c1',
                    type: 'condition',
                    position: { x: 0, y: 0 },
                    data: defaultNodeData('condition', 'condition'),
                },
            ],
            [],
        )
        useWorkflowStore.getState().setSelectedNodeId('c1')
        const user = userEvent.setup()
        renderPanel()
        await user.type(screen.getByPlaceholderText('например deal.amount'), 'deal.amount')
        const node = useWorkflowStore.getState().nodes[0]
        expect((node.data as { field: string }).field).toBe('deal.amount')
    })

    it('оператор is_empty скрывает поле значения', () => {
        useWorkflowStore.getState().setGraph(
            [
                {
                    id: 'c1',
                    type: 'condition',
                    position: { x: 0, y: 0 },
                    data: { ...defaultNodeData('condition', 'condition'), op: 'is_empty' },
                },
            ],
            [],
        )
        useWorkflowStore.getState().setSelectedNodeId('c1')
        renderPanel()
        expect(screen.queryByPlaceholderText('значение')).not.toBeInTheDocument()
    })

    it('редактор действия показывает поля create_task', () => {
        useWorkflowStore.getState().setGraph(
            [
                {
                    id: 'a1',
                    type: 'action',
                    position: { x: 0, y: 0 },
                    data: { ...defaultNodeData('action', 'create_task'), actionType: 'create_task' },
                },
            ],
            [],
        )
        useWorkflowStore.getState().setSelectedNodeId('a1')
        renderPanel()
        expect(screen.getByText('Название задачи')).toBeInTheDocument()
    })

    it('external-действие без manage показывает блокировку', () => {
        useWorkflowStore.getState().setGraph(
            [
                {
                    id: 'a1',
                    type: 'action',
                    position: { x: 0, y: 0 },
                    data: {
                        ...defaultNodeData('action', 'send_email'),
                        actionType: 'send_email',
                        externalEffect: true,
                    },
                },
            ],
            [],
        )
        useWorkflowStore.getState().setSelectedNodeId('a1')
        renderPanel({ canManage: false })
        expect(
            screen.getByText('Для действий с внешним эффектом нужно право automation:manage.'),
        ).toBeInTheDocument()
    })

    it('ветвление добавляет новую ветку', async () => {
        useWorkflowStore.getState().setGraph(
            [
                {
                    id: 'b1',
                    type: 'branch',
                    position: { x: 0, y: 0 },
                    data: defaultNodeData('branch', 'branch'),
                },
            ],
            [],
        )
        useWorkflowStore.getState().setSelectedNodeId('b1')
        const user = userEvent.setup()
        renderPanel()
        const before = (useWorkflowStore.getState().nodes[0].data as { cases: unknown[] }).cases
            .length
        await user.click(screen.getByRole('button', { name: 'Добавить ветку' }))
        const after = (useWorkflowStore.getState().nodes[0].data as { cases: unknown[] }).cases.length
        expect(after).toBe(before + 1)
    })

    it('send_webhook показывает выбор connection', async () => {
        useWorkflowStore.getState().setGraph(
            [
                {
                    id: 'a1',
                    type: 'action',
                    position: { x: 0, y: 0 },
                    data: {
                        ...defaultNodeData('action', 'send_webhook'),
                        actionType: 'send_webhook',
                    },
                },
            ],
            [],
        )
        useWorkflowStore.getState().setSelectedNodeId('a1')
        renderPanel()
        expect(await screen.findByText('Connection')).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Выберите connection' })).toBeInTheDocument()
    })

    it('кнопка «Закрыть» снимает выбор ноды', async () => {
        useWorkflowStore.getState().setGraph(
            [
                {
                    id: 't1',
                    type: 'trigger',
                    position: { x: 0, y: 0 },
                    data: defaultNodeData('trigger', 'crm.deal.created'),
                },
            ],
            [],
        )
        useWorkflowStore.getState().setSelectedNodeId('t1')
        const user = userEvent.setup()
        renderPanel()
        await user.click(screen.getByRole('button', { name: 'Закрыть' }))
        expect(
            screen.getByText('Выберите ноду на холсте, чтобы настроить её.'),
        ).toBeInTheDocument()
    })
})
