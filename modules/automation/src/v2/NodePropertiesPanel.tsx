import useSWR from 'swr'
import { PiTrashDuotone, PiPlusDuotone, PiXBold } from 'react-icons/pi'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { apiListConnections } from '@/services/AutomationService'
import { ReadOnlyBanner } from '../shared'
import { qa } from '../qa'
import { QaSelectOption } from '../selectQa'
import type {
    NodeRegistry,
    WorkflowNode,
    TriggerNodeData,
    ConditionNodeData,
    BranchNodeData,
    ActionNodeData,
    BranchCase,
} from './types'
import { OPERATOR_OPTIONS, actionIsExternal } from './registry'
import { uid } from './graphSpec'
import { useWorkflowStore } from './workflowStore'

/**
 * NodePropertiesPanel — редактор config выбранной ноды.
 * Переиспользует поля из AutomationForm (триггер/действие/условие).
 * Для condition — простой конструктор поле/оператор/значение → ABAC-лист (в графе).
 */
export default function NodePropertiesPanel({
    readOnly,
    registry,
    projectId,
    canManage,
}: {
    readOnly: boolean
    registry: NodeRegistry
    projectId: string
    canManage: boolean
}) {
    const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId)
    const node = useWorkflowStore((s) =>
        s.nodes.find((n) => n.id === s.selectedNodeId),
    ) as WorkflowNode | undefined
    const updateNodeData = useWorkflowStore((s) => s.updateNodeData)
    const removeNode = useWorkflowStore((s) => s.removeNode)
    const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId)

    // Connections для send_webhook (нужно manage).
    const { data: connData } = useSWR(
        canManage && projectId ? ['/automation/connections', projectId, 'v2'] : null,
        () => apiListConnections({ projectId }).catch(() => null),
        { revalidateOnFocus: false },
    )
    const connectionOptions =
        connData?.list?.map((c) => ({ value: c.id, label: c.name })) ?? []

    if (!selectedNodeId || !node) {
        return (
            <aside
                className="w-72 border-l border-gray-200 dark:border-gray-700 p-4 shrink-0"
                {...qa('automation.v2editor.propertiesEmpty')}
            >
                <p className="text-sm text-gray-400">
                    Выберите ноду на холсте, чтобы настроить её.
                </p>
            </aside>
        )
    }

    const kind = node.type
    const disabled = readOnly

    return (
        <aside
            className="w-72 border-l border-gray-200 dark:border-gray-700 p-4 overflow-y-auto shrink-0"
            {...qa('automation.v2editor.properties', { node: selectedNodeId })}
        >
            <div className="flex items-center justify-between mb-3">
                <h6 className="font-semibold">Свойства ноды</h6>
                <button
                    type="button"
                    aria-label="Закрыть"
                    className="p-1 text-gray-400 hover:text-gray-600"
                    onClick={() => setSelectedNodeId(null)}
                >
                    <PiXBold className="w-4 h-4" />
                </button>
            </div>

            {readOnly && (
                <div className="mb-3">
                    <ReadOnlyBanner message="Только просмотр — поля заблокированы." />
                </div>
            )}

            {kind === 'trigger' && (
                <TriggerEditor
                    data={node.data as TriggerNodeData}
                    disabled={disabled}
                    registry={registry}
                    onChange={(patch) => updateNodeData(node.id, patch)}
                />
            )}
            {kind === 'condition' && (
                <ConditionEditor
                    data={node.data as ConditionNodeData}
                    disabled={disabled}
                    onChange={(patch) => updateNodeData(node.id, patch)}
                />
            )}
            {kind === 'branch' && (
                <BranchEditor
                    data={node.data as BranchNodeData}
                    disabled={disabled}
                    onChange={(patch) => updateNodeData(node.id, patch)}
                />
            )}
            {kind === 'action' && (
                <ActionEditor
                    data={node.data as ActionNodeData}
                    disabled={disabled}
                    registry={registry}
                    canManage={canManage}
                    connectionOptions={connectionOptions}
                    onChange={(patch) => updateNodeData(node.id, patch)}
                />
            )}

            {kind !== 'trigger' && !readOnly && (
                <Button
                    size="sm"
                    variant="plain"
                    className="mt-4 text-red-500"
                    icon={<PiTrashDuotone />}
                    onClick={() => removeNode(node.id)}
                    {...qa('automation.v2editor.deleteNode', { node: selectedNodeId })}
                >
                    Удалить ноду
                </Button>
            )}
        </aside>
    )
}

// ─── Trigger ─────────────────────────────────────────────────────────────────

function TriggerEditor({
    data,
    disabled,
    registry,
    onChange,
}: {
    data: TriggerNodeData
    disabled: boolean
    registry: NodeRegistry
    onChange: (patch: Partial<TriggerNodeData>) => void
}) {
    const opts = registry.triggers.map((t) => ({ value: t.id, label: t.label }))
    return (
        <div className="space-y-3">
            <Field label="Событие (триггер) *">
                <Select
                    isDisabled={disabled}
                    options={opts}
                    value={opts.find((o) => o.value === data.triggerType) || null}
                    onChange={(opt) =>
                        onChange({ triggerType: opt?.value || '' })
                    }
                    placeholder="Выберите событие"
                    components={{ Option: QaSelectOption }}
                    {...qa('automation.v2editor.triggerType')}
                />
            </Field>
            <p className="text-xs text-gray-400">
                Уточните срабатывание условиями ниже по сценарию.
            </p>
        </div>
    )
}

// ─── Condition ───────────────────────────────────────────────────────────────

function ConditionEditor({
    data,
    disabled,
    onChange,
}: {
    data: ConditionNodeData
    disabled: boolean
    onChange: (patch: Partial<ConditionNodeData>) => void
}) {
    const noValue = data.op === 'is_empty' || data.op === 'is_not_empty'
    return (
        <div className="space-y-3">
            <Field label="Поле">
                <Input
                    disabled={disabled}
                    value={data.field}
                    onChange={(e) => onChange({ field: e.target.value })}
                    placeholder="например deal.amount"
                    {...qa('automation.v2editor.conditionField')}
                />
            </Field>
            <Field label="Оператор">
                <Select
                    isDisabled={disabled}
                    options={OPERATOR_OPTIONS}
                    value={OPERATOR_OPTIONS.find((o) => o.value === data.op) || null}
                    onChange={(opt) => onChange({ op: opt?.value || 'eq' })}
                    components={{ Option: QaSelectOption }}
                    {...qa('automation.v2editor.conditionOp')}
                />
            </Field>
            {!noValue && (
                <Field label="Значение">
                    <Input
                        disabled={disabled}
                        value={data.value}
                        onChange={(e) => onChange({ value: e.target.value })}
                        placeholder="значение"
                        {...qa('automation.v2editor.conditionValue')}
                    />
                </Field>
            )}
        </div>
    )
}

// ─── Branch ──────────────────────────────────────────────────────────────────

function BranchEditor({
    data,
    disabled,
    onChange,
}: {
    data: BranchNodeData
    disabled: boolean
    onChange: (patch: Partial<BranchNodeData>) => void
}) {
    const cases = data.cases ?? []
    const update = (id: string, patch: Partial<BranchCase>) =>
        onChange({
            cases: cases.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })
    const add = () =>
        onChange({
            cases: [...cases, { id: uid('case'), label: `Ветка ${cases.length + 1}` }],
        })
    const remove = (id: string) =>
        onChange({ cases: cases.filter((c) => c.id !== id) })

    return (
        <div className="space-y-3">
            <p className="text-xs text-gray-500">
                Каждая ветка — отдельный выход. Подключите к ветке свою цепочку.
            </p>
            {cases.map((c) => {
                const noValue = c.op === 'is_empty' || c.op === 'is_not_empty'
                return (
                    <div
                        key={c.id}
                        className="p-2 rounded border border-gray-200 dark:border-gray-700 space-y-2"
                        {...qa('automation.v2editor.branchCase', { case: c.id })}
                    >
                        <div className="flex items-center gap-1">
                            <Input
                                disabled={disabled}
                                className="flex-1"
                                value={c.label}
                                onChange={(e) =>
                                    update(c.id, { label: e.target.value })
                                }
                                placeholder="Метка ветки"
                                {...qa('automation.v2editor.branchCaseLabel', { case: c.id })}
                            />
                            {!disabled && cases.length > 2 && (
                                <button
                                    type="button"
                                    aria-label="Удалить ветку"
                                    className="p-1 text-gray-400 hover:text-red-500"
                                    onClick={() => remove(c.id)}
                                >
                                    <PiXBold className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <Input
                            disabled={disabled}
                            value={c.field ?? ''}
                            onChange={(e) => update(c.id, { field: e.target.value })}
                            placeholder="поле (опц.)"
                            {...qa('automation.v2editor.branchCaseField', { case: c.id })}
                        />
                        <div className="flex gap-1">
                            <div className="w-32">
                                <Select
                                    isDisabled={disabled}
                                    options={OPERATOR_OPTIONS}
                                    value={
                                        OPERATOR_OPTIONS.find(
                                            (o) => o.value === (c.op ?? 'eq'),
                                        ) || null
                                    }
                                    onChange={(opt) =>
                                        update(c.id, { op: opt?.value || 'eq' })
                                    }
                                    components={{ Option: QaSelectOption }}
                                    {...qa('automation.v2editor.branchCaseOp', { case: c.id })}
                                />
                            </div>
                            {!noValue && (
                                <Input
                                    disabled={disabled}
                                    className="flex-1"
                                    value={c.value ?? ''}
                                    onChange={(e) =>
                                        update(c.id, { value: e.target.value })
                                    }
                                    placeholder="значение"
                                    {...qa('automation.v2editor.branchCaseValue', { case: c.id })}
                                />
                            )}
                        </div>
                    </div>
                )
            })}
            {!disabled && (
                <Button
                    size="xs"
                    variant="plain"
                    icon={<PiPlusDuotone />}
                    onClick={add}
                    {...qa('automation.v2editor.addBranchCase')}
                >
                    Добавить ветку
                </Button>
            )}
        </div>
    )
}

// ─── Action ──────────────────────────────────────────────────────────────────

function ActionEditor({
    data,
    disabled,
    registry,
    canManage,
    connectionOptions,
    onChange,
}: {
    data: ActionNodeData
    disabled: boolean
    registry: NodeRegistry
    canManage: boolean
    connectionOptions: { value: string; label: string }[]
    onChange: (patch: Partial<ActionNodeData>) => void
}) {
    // external-типы скрыты без manage (parity с AutomationForm).
    const opts = registry.actions
        .filter((a) => !a.externalEffect || canManage)
        .map((a) => ({ value: a.id, label: a.label }))
    const external = actionIsExternal(registry, data.actionType)
    const blocked = external && !canManage

    const setConfig = (key: string, value: string) =>
        onChange({ config: { ...data.config, [key]: value } })

    const cfg = (k: string) => String((data.config?.[k] as string) ?? '')

    return (
        <div className="space-y-3">
            <Field label="Тип действия *">
                <Select
                    isDisabled={disabled}
                    options={opts}
                    value={opts.find((o) => o.value === data.actionType) || null}
                    onChange={(opt) =>
                        onChange({
                            actionType: opt?.value || '',
                            externalEffect: actionIsExternal(
                                registry,
                                opt?.value || '',
                            ),
                            config: {},
                            connectionId: undefined,
                        })
                    }
                    placeholder="Тип действия"
                    components={{ Option: QaSelectOption }}
                    {...qa('automation.v2editor.actionType')}
                />
            </Field>

            {blocked ? (
                <p className="text-xs text-amber-600" {...qa('automation.v2editor.externalBlocked')}>
                    Для действий с внешним эффектом нужно право automation:manage.
                </p>
            ) : (
                <ActionConfigFields
                    type={data.actionType}
                    cfg={cfg}
                    disabled={disabled}
                    connectionId={data.connectionId}
                    connectionOptions={connectionOptions}
                    onConfig={setConfig}
                    onConnection={(id) => onChange({ connectionId: id })}
                />
            )}
        </div>
    )
}

function ActionConfigFields({
    type,
    cfg,
    disabled,
    connectionId,
    connectionOptions,
    onConfig,
    onConnection,
}: {
    type: string
    cfg: (k: string) => string
    disabled: boolean
    connectionId?: string
    connectionOptions: { value: string; label: string }[]
    onConfig: (k: string, v: string) => void
    onConnection: (id: string) => void
}) {
    switch (type) {
        case 'assign_user':
            return (
                <Field label="Пользователь">
                    <Input
                        disabled={disabled}
                        value={cfg('userId')}
                        onChange={(e) => onConfig('userId', e.target.value)}
                        placeholder="ID или {{trigger.assignee}}"
                        {...qa('automation.v2editor.assignUserId')}
                    />
                </Field>
            )
        case 'send_email':
            return (
                <>
                    <Field label="Кому">
                        <Input
                            disabled={disabled}
                            value={cfg('to')}
                            onChange={(e) => onConfig('to', e.target.value)}
                            placeholder="email или {{assignee.email}}"
                            {...qa('automation.v2editor.emailTo')}
                        />
                    </Field>
                    <Field label="Тема">
                        <Input
                            disabled={disabled}
                            value={cfg('subject')}
                            onChange={(e) => onConfig('subject', e.target.value)}
                            placeholder="Тема письма"
                            {...qa('automation.v2editor.emailSubject')}
                        />
                    </Field>
                </>
            )
        case 'create_task':
        case 'create_activity':
            return (
                <Field label="Название задачи">
                    <Input
                        disabled={disabled}
                        value={cfg('title')}
                        onChange={(e) => onConfig('title', e.target.value)}
                        placeholder="Название задачи"
                        {...qa('automation.v2editor.activityTitle')}
                    />
                </Field>
            )
        case 'update_field':
            return (
                <>
                    <Field label="Поле">
                        <Input
                            disabled={disabled}
                            value={cfg('field')}
                            onChange={(e) => onConfig('field', e.target.value)}
                            placeholder="Поле"
                            {...qa('automation.v2editor.updateField')}
                        />
                    </Field>
                    <Field label="Значение">
                        <Input
                            disabled={disabled}
                            value={cfg('value')}
                            onChange={(e) => onConfig('value', e.target.value)}
                            placeholder="Значение"
                            {...qa('automation.v2editor.updateValue')}
                        />
                    </Field>
                </>
            )
        case 'move_stage':
            return (
                <Field label="Целевая стадия">
                    <Input
                        disabled={disabled}
                        value={cfg('stage')}
                        onChange={(e) => onConfig('stage', e.target.value)}
                        placeholder="Стадия"
                        {...qa('automation.v2editor.moveStage')}
                    />
                </Field>
            )
        case 'send_webhook':
            return (
                <Field label="Connection">
                    <Select
                        isDisabled={disabled}
                        options={connectionOptions}
                        value={
                            connectionOptions.find(
                                (o) => o.value === connectionId,
                            ) || null
                        }
                        onChange={(opt) => onConnection(opt?.value || '')}
                        placeholder="Выберите connection"
                        noOptionsMessage={() => 'Нет connections'}
                        components={{ Option: QaSelectOption }}
                        {...qa('automation.v2editor.webhookConnection')}
                    />
                </Field>
            )
        case 'generate_document':
            return (
                <Field label="Шаблон">
                    <Input
                        disabled={disabled}
                        value={cfg('templateId')}
                        onChange={(e) => onConfig('templateId', e.target.value)}
                        placeholder="ID шаблона"
                        {...qa('automation.v2editor.documentTemplate')}
                    />
                </Field>
            )
        default:
            return null
    }
}

function Field({
    label,
    children,
}: {
    label: string
    children: React.ReactNode
}) {
    return (
        <div>
            <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-300">
                {label}
            </label>
            {children}
        </div>
    )
}
