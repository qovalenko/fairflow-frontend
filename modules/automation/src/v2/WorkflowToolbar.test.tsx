import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { automationRule } from '../testFixtures'
import { defaultNodeData } from './graphSpec'
import { useWorkflowStore } from './workflowStore'

const saveWorkflow = vi.fn()
const validateWorkflowGraph = vi.fn()
const pushToast = vi.fn()
const fitView = vi.fn()
const onBack = vi.fn()
const onSaved = vi.fn()
const onDryRun = vi.fn()

vi.mock('@xyflow/react', () => ({
    useReactFlow: () => ({ fitView }),
}))
vi.mock('./api', () => ({
    saveWorkflow: (...a: unknown[]) => saveWorkflow(...a),
    validateWorkflowGraph: (...a: unknown[]) => validateWorkflowGraph(...a),
}))
vi.mock('./notify', () => ({ pushToast: (...a: unknown[]) => pushToast(...a) }))

import WorkflowToolbar from './WorkflowToolbar'

const validGraph = () => {
    const trigger = {
        id: 't1',
        type: 'trigger' as const,
        position: { x: 0, y: 0 },
        data: defaultNodeData('trigger', 'crm.deal.created'),
    }
    const action = {
        id: 'a1',
        type: 'action' as const,
        position: { x: 0, y: 120 },
        data: { ...defaultNodeData('action', 'create_task'), actionType: 'create_task' },
    }
    useWorkflowStore.getState().setGraph([trigger, action], [{ id: 'e1', source: 't1', target: 'a1' }])
    useWorkflowStore.getState().setRuleMeta({ name: 'Новый сценарий' })
}

describe('WorkflowToolbar', () => {
    beforeEach(() => {
        useWorkflowStore.getState().reset()
        pushToast.mockReset()
        saveWorkflow.mockReset()
        validateWorkflowGraph.mockReset()
        onBack.mockReset()
        onSaved.mockReset()
        validateWorkflowGraph.mockResolvedValue({ ok: true, issues: [] })
        saveWorkflow.mockResolvedValue({ ok: true, ruleId: 'rule-new' })
    })

    it('readOnly скрывает кнопки сохранения', () => {
        validGraph()
        render(
            <WorkflowToolbar
                readOnly
                isEdit
                canWrite
                canManage
                canExecute
                projectId="p1"
                rule={automationRule()}
                onBack={onBack}
                onSaved={onSaved}
                onDryRun={onDryRun}
            />,
        )
        expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument()
        expect(screen.getByPlaceholderText('Название сценария')).toBeDisabled()
    })

    it('без названия save показывает предупреждение', async () => {
        validGraph()
        useWorkflowStore.getState().setRuleMeta({ name: '   ' })
        const user = userEvent.setup()
        render(
            <WorkflowToolbar
                readOnly={false}
                isEdit={false}
                canWrite
                canManage={false}
                canExecute={false}
                projectId="p1"
                onBack={onBack}
                onSaved={onSaved}
                onDryRun={onDryRun}
            />,
        )
        await user.click(screen.getByRole('button', { name: 'Создать и включить' }))
        expect(pushToast).toHaveBeenCalledWith('Укажите название сценария.', 'warning')
        expect(saveWorkflow).not.toHaveBeenCalled()
    })

    it('«Проверить» показывает успех при валидном графе', async () => {
        validGraph()
        const user = userEvent.setup()
        render(
            <WorkflowToolbar
                readOnly={false}
                isEdit
                canWrite
                canManage
                canExecute
                projectId="p1"
                rule={automationRule()}
                onBack={onBack}
                onSaved={onSaved}
                onDryRun={onDryRun}
            />,
        )
        await user.click(screen.getByRole('button', { name: 'Проверить' }))
        await waitFor(() =>
            expect(pushToast).toHaveBeenCalledWith('Граф валиден.', 'success'),
        )
    })

    it('сохранение создаёт сценарий и сбрасывает dirty', async () => {
        validGraph()
        const user = userEvent.setup()
        render(
            <WorkflowToolbar
                readOnly={false}
                isEdit={false}
                canWrite
                canManage={false}
                canExecute={false}
                projectId="p1"
                onBack={onBack}
                onSaved={onSaved}
                onDryRun={onDryRun}
            />,
        )
        await user.click(screen.getByRole('button', { name: 'Создать и включить' }))
        await waitFor(() => expect(saveWorkflow).toHaveBeenCalled())
        expect(onSaved).toHaveBeenCalledWith('rule-new')
        expect(useWorkflowStore.getState().dirty).toBe(false)
    })

    it('«Назад» вызывает onBack', async () => {
        validGraph()
        const user = userEvent.setup()
        render(
            <WorkflowToolbar
                readOnly={false}
                isEdit
                canWrite
                canManage
                canExecute
                projectId="p1"
                rule={automationRule()}
                onBack={onBack}
                onSaved={onSaved}
                onDryRun={onDryRun}
            />,
        )
        await user.click(screen.getByRole('button', { name: 'Назад' }))
        expect(onBack).toHaveBeenCalled()
    })
})
