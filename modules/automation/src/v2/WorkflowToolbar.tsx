import { useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import {
    PiArrowLeftDuotone,
    PiFloppyDiskDuotone,
    PiCheckCircleDuotone,
    PiFlaskDuotone,
    PiTreeStructureDuotone,
} from 'react-icons/pi'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import { ruleStateView, type AutomationRule } from '@/services/AutomationService'
import { pushToast } from './notify'
import type { ActionNodeData, GraphValidationIssue, TriggerNodeData } from './types'
import { useWorkflowStore } from './workflowStore'
import { validateGraph } from './validate'
import { layoutGraph } from './layout'
import { saveWorkflow, validateWorkflowGraph } from './api'
import { qa } from '../qa'

/**
 * WorkflowToolbar — save / validate / dry-run / auto-layout / back.
 * Гейтинг: create→write, edit→write|manage, dry-run→execute.
 */
export default function WorkflowToolbar({
    readOnly,
    isEdit,
    canWrite,
    canManage,
    canExecute,
    projectId,
    rule,
    onBack,
    onSaved,
    onDryRun,
}: {
    readOnly: boolean
    isEdit: boolean
    canWrite: boolean
    canManage: boolean
    canExecute: boolean
    projectId: string
    rule?: AutomationRule
    onBack: () => void
    onSaved: (ruleId: string) => void
    onDryRun: () => void
}) {
    const { fitView } = useReactFlow()
    const nodes = useWorkflowStore((s) => s.nodes)
    const edges = useWorkflowStore((s) => s.edges)
    const dirty = useWorkflowStore((s) => s.dirty)
    const ruleMeta = useWorkflowStore((s) => s.ruleMeta)
    const setRuleMeta = useWorkflowStore((s) => s.setRuleMeta)
    const setNodeErrors = useWorkflowStore((s) => s.setNodeErrors)
    const setGraphNodes = useWorkflowStore((s) => s.onNodesChange)
    const toGraphSpec = useWorkflowStore((s) => s.toGraphSpec)
    const clearDirty = useWorkflowStore((s) => s.clearDirty)

    const [saving, setSaving] = useState(false)
    const [validating, setValidating] = useState(false)

    const canSave = isEdit ? canWrite || canManage : canWrite

    const applyIssues = (issues: GraphValidationIssue[]) => {
        const errs: Record<string, string> = {}
        for (const i of issues) {
            if (i.nodeId && i.severity === 'error') errs[i.nodeId] = i.message
        }
        setNodeErrors(errs)
        const errors = issues.filter((i) => i.severity === 'error')
        return errors
    }

    const handleValidate = async () => {
        setValidating(true)
        try {
            const local = validateGraph(nodes, edges)
            const localErrors = applyIssues(local)
            // Серверная — поверх клиентской (graceful).
            const server = await validateWorkflowGraph(toGraphSpec(), projectId)
            if (server.ok) {
                applyIssues([...local, ...server.issues])
                const total = [...local, ...server.issues].filter(
                    (i) => i.severity === 'error',
                )
                pushToast(
                    total.length === 0
                        ? 'Граф валиден.'
                        : `Найдено проблем: ${total.length}.`,
                    total.length === 0 ? 'success' : 'warning',
                )
            } else {
                pushToast(
                    localErrors.length === 0
                        ? `Клиентская проверка ок. ${server.message}`
                        : `Проблем (клиент): ${localErrors.length}. ${server.message}`,
                    localErrors.length === 0 ? 'info' : 'warning',
                )
            }
        } finally {
            setValidating(false)
        }
    }

    const handleSave = async (enabled: boolean) => {
        if (!ruleMeta.name.trim()) {
            pushToast('Укажите название сценария.', 'warning')
            return
        }
        const issues = validateGraph(nodes, edges)
        const errors = applyIssues(issues)
        if (errors.length > 0) {
            pushToast(`Исправьте ошибки графа (${errors.length}).`, 'warning')
            return
        }
        const trigger = nodes.find((n) => n.type === 'trigger')
        const triggerType = trigger
            ? (trigger.data as TriggerNodeData).triggerType
            : ''

        setSaving(true)
        try {
            const res = await saveWorkflow(
                {
                    ruleId: rule?.id,
                    name: ruleMeta.name.trim(),
                    enabled,
                    priority: ruleMeta.priority,
                    notifyOnFailure: ruleMeta.notifyOnFailure,
                    triggerType,
                    graph: toGraphSpec(),
                },
                projectId,
            )
            if (res.ok) {
                clearDirty()
                pushToast(isEdit ? 'Сценарий сохранён.' : 'Сценарий создан.', 'success')
                onSaved(res.ruleId)
            } else {
                pushToast(res.message, 'danger')
            }
        } finally {
            setSaving(false)
        }
    }

    const handleAutoLayout = () => {
        const next = layoutGraph(nodes, edges, 'TB')
        // Иммутабельно прокидываем новые позиции через onNodesChange (replace).
        setGraphNodes(
            next.map((n) => ({
                id: n.id,
                type: 'position' as const,
                position: n.position,
                dragging: false,
            })),
        )
        setTimeout(() => fitView({ duration: 300 }), 50)
    }

    const view = rule ? ruleStateView(rule) : null
    const hasExternalEffect = nodes.some(
        (n) => n.type === 'action' && (n.data as ActionNodeData).externalEffect,
    )

    return (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-wrap" {...qa('automation.v2editor.toolbar')}>
            <button
                type="button"
                aria-label="Назад"
                title="Назад"
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                onClick={onBack}
                {...qa('automation.v2editor.back')}
            >
                <PiArrowLeftDuotone className="w-5 h-5" />
            </button>

            <Input
                className="w-64"
                size="sm"
                disabled={readOnly}
                value={ruleMeta.name}
                onChange={(e) => setRuleMeta({ name: e.target.value })}
                placeholder="Название сценария"
                {...qa('automation.v2editor.name')}
            />
            {view && <Tag className={view.color}>{view.label}</Tag>}
            {dirty && (
                <span className="text-xs text-amber-500" {...qa('automation.v2editor.dirty')}>
                    ● не сохранено
                </span>
            )}

            <div className="flex-1" />

            <Button
                size="sm"
                variant="default"
                icon={<PiTreeStructureDuotone />}
                onClick={handleAutoLayout}
                {...qa('automation.v2editor.layout')}
            >
                Выровнять
            </Button>
            <Button
                size="sm"
                variant="default"
                loading={validating}
                icon={<PiCheckCircleDuotone />}
                onClick={handleValidate}
                {...qa('automation.v2editor.validate')}
            >
                Проверить
            </Button>
            {isEdit && canExecute && (
                <Button
                    size="sm"
                    variant="default"
                    icon={<PiFlaskDuotone />}
                    onClick={onDryRun}
                    title={
                        hasExternalEffect
                            ? 'Внешние эффекты не выполняются в dry-run'
                            : undefined
                    }
                    {...qa('automation.v2editor.dryRun')}
                >
                    Тест
                </Button>
            )}
            {!readOnly && canSave && (
                <>
                    {!isEdit ? (
                        <>
                            <Button
                                size="sm"
                                variant="default"
                                loading={saving}
                                onClick={() => handleSave(false)}
                                {...qa('automation.v2editor.saveDisabled')}
                            >
                                Создать выключенным
                            </Button>
                            <Button
                                size="sm"
                                variant="solid"
                                color="primary"
                                loading={saving}
                                icon={<PiFloppyDiskDuotone />}
                                onClick={() => handleSave(true)}
                                {...qa('automation.v2editor.saveEnabled')}
                            >
                                Создать и включить
                            </Button>
                        </>
                    ) : (
                        <Button
                            size="sm"
                            variant="solid"
                            color="primary"
                            loading={saving}
                            disabled={!dirty}
                            icon={<PiFloppyDiskDuotone />}
                            onClick={() => handleSave(rule?.enabled ?? false)}
                            {...qa('automation.v2editor.save')}
                        >
                            Сохранить
                        </Button>
                    )}
                </>
            )}
        </div>
    )
}
