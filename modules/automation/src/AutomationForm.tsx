import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR from 'swr'
import { PiArrowLeftDuotone, PiPlusDuotone, PiXBold, PiFlaskDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Skeleton from '@/components/ui/Skeleton'
import toast from '@/components/ui/toast'
import {
    apiGetRule,
    apiCreateRule,
    apiUpdateRule,
    apiGetRegistry,
    apiListConnections,
    ruleStateView,
    type RuleActionInput,
    type SaveRuleInput,
} from '@/services/AutomationService'
import {
    NoPermissionState,
    NoProjectState,
    ErrorState,
    NotFoundState,
    FreshnessLabel,
    ReadOnlyBanner,
    errMessage,
    httpStatus,
} from './shared'
import RuleLog from './RuleLog'
import DryRunOverlay from './DryRunOverlay'
import {
    parseConditionTree,
    wireConditionTree,
    type ConditionOp,
    type UiCondition,
} from './condition-tree'
import { qa } from './qa'
import { QaSelectOption } from './selectQa'

// Fallback-словари (используются, только если GetRegistry недоступен, FR-MAUT-5/17).
// Значения обязаны совпадать с TRIGGER_CATALOG домена: неизвестный триггер
// отбивается бэкендом при сохранении (INVALID_ARGUMENT).
const fallbackTriggers = [
    { value: 'crm.contact.created', label: 'Контакт создан' },
    { value: 'crm.contact.updated', label: 'Контакт обновлён' },
    { value: 'crm.deal.created', label: 'Сделка создана' },
    { value: 'crm.deal.stage_changed', label: 'Стадия сделки изменена' },
    { value: 'crm.deal.won', label: 'Сделка выиграна' },
    { value: 'crm.deal.lost', label: 'Сделка проиграна' },
    { value: 'crm.order.status_changed', label: 'Статус продажи изменён' },
    { value: 'crm.activity.created', label: 'Активность создана' },
    { value: 'crm.activity.completed', label: 'Активность завершена' },
]

// Только реально исполняемые действия (реестр домена скрывает действия без
// исполнителя, OQ-AUTOM-010) — фолбэк не должен возвращать скрытые.
const fallbackActions = [
    { value: 'create_activity', label: 'Создать активность', external: false },
    { value: 'send_webhook', label: 'Отправить webhook', external: true },
]

const operatorOptions = [
    { value: 'eq', label: 'Равно' },
    { value: 'ne', label: 'Не равно' },
    { value: 'contains', label: 'Содержит' },
    { value: 'gt', label: 'Больше' },
    { value: 'lt', label: 'Меньше' },
    { value: 'is_empty', label: 'Пусто' },
    { value: 'is_not_empty', label: 'Не пусто' },
]

type Condition = UiCondition

const logicOpOptions = [
    { value: 'and', label: 'И (AND)' },
    { value: 'or', label: 'ИЛИ (OR)' },
]

interface ActionRow {
    id: string
    type: string
    connectionId?: string
    config: Record<string, string>
}

const AutomationForm = () => {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const pid = useCurrentProjectId()
    const isEdit = !!id && id !== 'new'

    const can = usePermission()
    const canRead = can('automation', 'read')
    const canWrite = can('automation', 'write')
    const canManage = can('automation', 'manage')
    const canExecute = can('automation', 'execute')

    const [name, setName] = useState('')
    const [triggerType, setTriggerType] = useState('')
    const [conditions, setConditions] = useState<Condition[]>([])
    const [conditionRootOp, setConditionRootOp] = useState<ConditionOp>('and')
    const [nestedConditionOp, setNestedConditionOp] = useState<ConditionOp | ''>('')
    const [nestedConditions, setNestedConditions] = useState<Condition[]>([])
    const [actions, setActions] = useState<ActionRow[]>([])
    const [priority, setPriority] = useState('100')
    const [notifyOnFailure, setNotifyOnFailure] = useState('')
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState(false)
    const [dryRunOpen, setDryRunOpen] = useState(false)

    // ── Реестр триггеров/действий (фильтр по включённым модулям) ──
    const { data: registry, isLoading: registryLoading } = useSWR(
        pid && canRead ? ['/automation/registry', pid] : null,
        () => apiGetRegistry({ projectId: pid! }).catch(() => null),
        { revalidateOnFocus: false },
    )
    const triggerOptions =
        registry?.triggers?.map((t) => ({ value: t.id, label: t.eventName })) ??
        fallbackTriggers
    const actionDefs =
        registry?.actions?.map((a) => ({
            value: a.id,
            label: a.id,
            external: a.externalEffect,
        })) ?? fallbackActions
    const isExternal = (type: string) =>
        actionDefs.find((a) => a.value === type)?.external ?? false

    // ── Connections для send_webhook (EL-FORM-9w) ──
    const { data: connData } = useSWR(
        pid && canManage ? ['/automation/connections', pid, 'form'] : null,
        () => apiListConnections({ projectId: pid! }).catch(() => null),
        { revalidateOnFocus: false },
    )
    const connectionOptions =
        connData?.list?.map((c) => ({ value: c.id, label: c.name })) ?? []

    // ── Загрузка правила (edit) ──
    const {
        data: rule,
        isLoading,
        error,
        mutate: refetchRule,
    } = useSWR(
        isEdit && pid && canRead ? ['/automation/rules', pid, id] : null,
        () => apiGetRule(id!, { projectId: pid! }),
        { revalidateOnFocus: false },
    )

    useEffect(() => {
        if (!rule) return
        setName(rule.name)
        setTriggerType(rule.triggerType)
        setPriority(String(rule.priority ?? 100))
        setNotifyOnFailure(rule.notifyOnFailure ?? '')
        try {
            const parsed = rule.conditionsJson
                ? JSON.parse(rule.conditionsJson)
                : null
            const tree = parseConditionTree(parsed)
            setConditionRootOp(tree.rootOp)
            setConditions(tree.conditions)
            setNestedConditionOp(tree.nestedOp)
            setNestedConditions(tree.nested)
        } catch {
            setConditions([])
            setConditionRootOp('and')
            setNestedConditionOp('')
            setNestedConditions([])
        }
        try {
            const acts: {
                type?: string
                connectionId?: string
                config?: Record<string, string>
            }[] = rule.actionsJson ? JSON.parse(rule.actionsJson) : []
            setActions(
                acts.map((a, i) => ({
                    id: `act_${i}`,
                    type: a.type ?? '',
                    connectionId: a.connectionId,
                    config: a.config ?? {},
                })),
            )
        } catch {
            setActions([])
        }
        setDirty(false)
    }, [rule])

    const markDirty = () => setDirty(true)

    const addCondition = () => {
        markDirty()
        setConditions((p) => [
            ...p,
            { id: `cond_${Date.now()}`, field: '', operator: 'eq', value: '' },
        ])
    }
    const updateCondition = (cid: string, key: keyof Condition, value: string) => {
        markDirty()
        setConditions((p) =>
            p.map((c) => (c.id === cid ? { ...c, [key]: value } : c)),
        )
    }
    const removeCondition = (cid: string) => {
        markDirty()
        setConditions((p) => p.filter((c) => c.id !== cid))
    }

    const addNestedCondition = () => {
        markDirty()
        if (!nestedConditionOp) setNestedConditionOp('or')
        setNestedConditions((p) => [
            ...p,
            { id: `nested_${Date.now()}`, field: '', operator: 'eq', value: '' },
        ])
    }
    const updateNestedCondition = (cid: string, key: keyof Condition, value: string) => {
        markDirty()
        setNestedConditions((p) =>
            p.map((c) => (c.id === cid ? { ...c, [key]: value } : c)),
        )
    }
    const removeNestedCondition = (cid: string) => {
        markDirty()
        setNestedConditions((p) => {
            const next = p.filter((c) => c.id !== cid)
            if (next.length === 0) setNestedConditionOp('')
            return next
        })
    }

    const addAction = () => {
        markDirty()
        setActions((p) => [
            ...p,
            { id: `act_${Date.now()}`, type: '', config: {} },
        ])
    }
    const updateActionType = (aid: string, type: string) => {
        markDirty()
        setActions((p) =>
            p.map((a) =>
                a.id === aid ? { ...a, type, config: {}, connectionId: undefined } : a,
            ),
        )
    }
    const updateActionConfig = (aid: string, key: string, value: string) => {
        markDirty()
        setActions((p) =>
            p.map((a) =>
                a.id === aid ? { ...a, config: { ...a.config, [key]: value } } : a,
            ),
        )
    }
    const updateActionConnection = (aid: string, connectionId: string) => {
        markDirty()
        setActions((p) =>
            p.map((a) => (a.id === aid ? { ...a, connectionId } : a)),
        )
    }
    const removeAction = (aid: string) => {
        markDirty()
        setActions((p) => p.filter((a) => a.id !== aid))
    }

    const hasExternalEffect = actions.some((a) => isExternal(a.type))

    const buildPayload = (enabled: boolean): SaveRuleInput => ({
        name: name.trim(),
        enabled,
        triggerType,
        // Явный event_name — консьюмер шины матчит правило по
        // trigger_config_json.event_name (без него правило матчило бы всё).
        triggerConfig: triggerType ? { event_name: triggerType } : {},
        // Формат condition-compiler: { and|or: [ leaves, { and|or: [...] } ] }.
        conditions: wireConditionTree(
            conditionRootOp,
            conditions,
            nestedConditionOp,
            nestedConditions,
        ),
        actions: actions.map<RuleActionInput>((a) => ({
            type: a.type,
            connectionId: a.connectionId,
            config: a.config,
        })),
        priority: Number(priority) || 100,
        notifyOnFailure: notifyOnFailure || null,
    })

    const goBack = () => {
        if (dirty && !window.confirm('Несохранённые изменения будут потеряны. Выйти?')) {
            return
        }
        navigate('/automation')
    }

    const handleSave = async (enabled: boolean) => {
        if (!pid) return
        if (!name.trim()) {
            toast.push('Укажите название правила')
            return
        }
        if (!triggerType) {
            toast.push('Выберите тип триггера')
            return
        }
        setSaving(true)
        try {
            const payload = buildPayload(enabled)
            if (isEdit) {
                await apiUpdateRule(id!, payload, { projectId: pid })
                toast.push('Правило сохранено')
            } else {
                await apiCreateRule(payload, { projectId: pid })
                toast.push(enabled ? 'Правило создано и включено' : 'Правило создано')
            }
            setDirty(false)
            navigate('/automation')
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось сохранить правило'))
        } finally {
            setSaving(false)
        }
    }

    // ── Гейтинг экрана ──
    if (!pid) {
        return (
            <Container>
                <NoProjectState />
            </Container>
        )
    }
    if (!canRead) {
        return (
            <Container>
                <NoPermissionState message="Нет права automation:read." />
            </Container>
        )
    }
    // !isEdit + нет write → нет права на создание (ST-11)
    if (!isEdit && !canWrite) {
        return (
            <Container>
                <NoPermissionState message="Нет права automation:write для создания правила." />
            </Container>
        )
    }

    // ST-1: загрузка правила (edit)
    if (isEdit && isLoading) {
        return (
            <Container>
                <div className="flex flex-col gap-4">
                    <Skeleton height={40} width={300} />
                    <Skeleton height={200} className="rounded-lg" />
                    <Skeleton height={200} className="rounded-lg" />
                </div>
            </Container>
        )
    }
    // ST-9: не найдено / ST-6: ошибка
    if (isEdit && error) {
        if (httpStatus(error) === 404) {
            return (
                <Container>
                    <NotFoundState
                        message="Правило не найдено или удалено."
                        onBack={() => navigate('/automation')}
                    />
                </Container>
            )
        }
        return (
            <Container>
                <ErrorState
                    message={errMessage(error, 'Не удалось загрузить правило')}
                    onRetry={() => refetchRule()}
                />
            </Container>
        )
    }

    const frozen = rule?.state === 'frozen'
    // ST-11/18: read-only (нет write над правилом, или frozen)
    const readOnly = frozen || (isEdit && !canWrite && !canManage)
    const view = rule ? ruleStateView(rule) : null

    const renderConditionRow = (
        c: Condition,
        onUpdate: (id: string, key: keyof Condition, value: string) => void,
        onRemove: (id: string) => void,
    ) => (
        <div key={c.id} className="flex items-center gap-2 flex-wrap" {...qa('automation.form.conditionRow', { condition: c.id })}>
            <Input
                disabled={readOnly}
                className="w-40"
                value={c.field}
                onChange={(e) => onUpdate(c.id, 'field', e.target.value)}
                placeholder="поле"
            />
            <div className="w-36">
                <Select
                    isDisabled={readOnly}
                    options={operatorOptions}
                    value={operatorOptions.find((o) => o.value === c.operator)}
                    onChange={(opt) => onUpdate(c.id, 'operator', opt?.value || 'eq')}
                />
            </div>
            <Input
                disabled={readOnly}
                className="w-40"
                value={c.value}
                onChange={(e) => onUpdate(c.id, 'value', e.target.value)}
                placeholder="значение"
            />
            {!readOnly && (
                <button
                    type="button"
                    aria-label="Удалить условие"
                    title="Удалить условие"
                    className="p-1.5 text-gray-400 hover:text-red-500"
                    onClick={() => onRemove(c.id)}
                >
                    <PiXBold className="w-4 h-4" />
                </button>
            )}
        </div>
    )

    const renderTriggerFields = () => {
        if (!triggerType) return null
        // Динамические поля по типу триггера (EL-FORM-5).
        // Упрощённый общий вид: значение конфигурации — через условия ниже.
        return (
            <p className="text-xs text-gray-400">
                Уточните срабатывание через условия ниже.
            </p>
        )
    }

    const renderActionConfig = (action: ActionRow) => {
        switch (action.type) {
            case 'assign_user':
                return (
                    <Input
                        disabled={readOnly}
                        value={action.config.userId || ''}
                        onChange={(e) =>
                            updateActionConfig(action.id, 'userId', e.target.value)
                        }
                        placeholder="ID пользователя или {{trigger.assignee}}"
                    />
                )
            case 'send_email':
                return (
                    <div className="space-y-2" {...qa('automation.form.emailConfig', { action: action.id })}>
                        <Input
                            disabled={readOnly}
                            value={action.config.to || ''}
                            onChange={(e) =>
                                updateActionConfig(action.id, 'to', e.target.value)
                            }
                            placeholder="email или {{assignee.email}}"
                            {...qa('automation.form.emailTo', { action: action.id })}
                        />
                        <Input
                            disabled={readOnly}
                            value={action.config.subject || ''}
                            onChange={(e) =>
                                updateActionConfig(action.id, 'subject', e.target.value)
                            }
                            placeholder="Тема письма"
                            {...qa('automation.form.emailSubject', { action: action.id })}
                        />
                    </div>
                )
            case 'create_task':
            case 'create_activity':
                return (
                    <Input
                        disabled={readOnly}
                        value={action.config.title || ''}
                        onChange={(e) =>
                            updateActionConfig(action.id, 'title', e.target.value)
                        }
                        placeholder="Название задачи"
                        {...qa('automation.form.activityTitle', { action: action.id })}
                    />
                )
            case 'update_field':
                return (
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            disabled={readOnly}
                            value={action.config.field || ''}
                            onChange={(e) =>
                                updateActionConfig(action.id, 'field', e.target.value)
                            }
                            placeholder="Поле"
                        />
                        <Input
                            disabled={readOnly}
                            value={action.config.value || ''}
                            onChange={(e) =>
                                updateActionConfig(action.id, 'value', e.target.value)
                            }
                            placeholder="Значение"
                        />
                    </div>
                )
            case 'move_stage':
                return (
                    <Input
                        disabled={readOnly}
                        value={action.config.stage || ''}
                        onChange={(e) =>
                            updateActionConfig(action.id, 'stage', e.target.value)
                        }
                        placeholder="Целевая стадия"
                    />
                )
            case 'send_webhook':
                // EL-FORM-9w: Select connection (НЕ ввод URL), FR-MAUT-29
                return (
                    <div {...qa('automation.form.webhookConnection', { action: action.id })}>
                        <Select
                            isDisabled={readOnly}
                            options={connectionOptions}
                            value={
                                connectionOptions.find(
                                    (o) => o.value === action.connectionId,
                                ) || null
                            }
                            onChange={(opt) =>
                                updateActionConnection(action.id, opt?.value || '')
                            }
                            placeholder="Выберите connection"
                            noOptionsMessage={() => 'Нет connections'}
                            components={{ Option: QaSelectOption }}
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Webhook отправляется только на одобренный connection.{' '}
                            <button
                                type="button"
                                className="text-blue-600 hover:underline"
                                onClick={() => navigate('/automation/connections/new')}
                                {...qa('automation.form.createConnectionLink')}
                            >
                                + создать connection
                            </button>
                        </p>
                    </div>
                )
            case 'generate_document':
                return (
                    <Input
                        disabled={readOnly}
                        value={action.config.templateId || ''}
                        onChange={(e) =>
                            updateActionConfig(action.id, 'templateId', e.target.value)
                        }
                        placeholder="ID шаблона"
                    />
                )
            default:
                return null
        }
    }

    return (
        <Container>
            <div className="flex flex-col gap-4">
                {/* Header (EL-FORM-1/2) */}
                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        type="button"
                        aria-label="Назад"
                        title="Назад"
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        onClick={goBack}
                        {...qa('automation.form.back')}
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <h3 className="text-2xl font-bold">
                        {isEdit
                            ? 'Редактирование правила'
                            : 'Новое правило автоматизации'}
                    </h3>
                    {/* EL-FORM-13: бейдж статуса */}
                    {view && (
                        <Tag className={view.color} {...qa('automation.form.statusTag')}>
                            {view.label}
                        </Tag>
                    )}
                </div>

                {/* ST-18/22: frozen / archived баннер */}
                {frozen && (
                    <ReadOnlyBanner message="Модуль приостановлен или проект архивирован — правило доступно только для чтения." />
                )}
                {!frozen && isEdit && !canWrite && !canManage && (
                    <ReadOnlyBanner message="Только просмотр: нет права на редактирование правила." />
                )}
                {pid && canRead && !registryLoading && registry == null && (
                    <p
                        className="text-xs text-amber-600"
                        {...qa('automation.form.registryFallback')}
                    >
                        Реестр триггеров недоступен — используются встроенные
                        значения (частичная деградация).
                    </p>
                )}

                {/* Секция «Название» (EL-FORM-3) */}
                <AdaptiveCard>
                    <div className="max-w-lg">
                        <label className="block text-sm font-medium mb-1">
                            Название правила *
                        </label>
                        <Input
                            disabled={readOnly}
                            value={name}
                            onChange={(e) => {
                                markDirty()
                                setName(e.target.value)
                            }}
                            placeholder="Введите название"
                            {...qa('automation.form.name')}
                        />
                    </div>
                </AdaptiveCard>

                {/* Секция «Триггер» (EL-FORM-4/5) */}
                <AdaptiveCard>
                    <h5 className="mb-3">Триггер</h5>
                    <div className="max-w-lg space-y-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Тип триггера *
                            </label>
                            <div {...qa('automation.form.triggerSelect')}>
                            <Select
                                isDisabled={readOnly}
                                options={triggerOptions}
                                value={
                                    triggerOptions.find(
                                        (o) => o.value === triggerType,
                                    ) || null
                                }
                                onChange={(opt) => {
                                    markDirty()
                                    setTriggerType(opt?.value || '')
                                }}
                                placeholder="Выберите событие"
                                components={{ Option: QaSelectOption }}
                            />
                            </div>
                        </div>
                        {renderTriggerFields()}
                    </div>

                    {/* Условия (EL-FORM-6/7, FR-AUTOM-090: вложенная AND/OR-группа) */}
                    <div className="mt-4">
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                            <span className="text-sm font-medium">Условия</span>
                            <div className="flex items-center gap-2">
                                {(conditions.length > 0 || nestedConditions.length > 0) && (
                                    <div className="w-36" {...qa('automation.form.conditionRootLogic')}>
                                        <Select
                                            isDisabled={readOnly}
                                            options={logicOpOptions}
                                            value={logicOpOptions.find((o) => o.value === conditionRootOp)}
                                            onChange={(opt) => {
                                                markDirty()
                                                setConditionRootOp((opt?.value as ConditionOp) || 'and')
                                            }}
                                        />
                                    </div>
                                )}
                                {!readOnly && (
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        icon={<PiPlusDuotone />}
                                        onClick={addCondition}
                                    >
                                        Условие
                                    </Button>
                                )}
                                {!readOnly && (
                                    <Button
                                        size="xs"
                                        variant="plain"
                                        icon={<PiPlusDuotone />}
                                        onClick={addNestedCondition}
                                    >
                                        Вложенная группа
                                    </Button>
                                )}
                            </div>
                        </div>
                        {conditions.length === 0 && nestedConditions.length === 0 ? (
                            <p className="text-xs text-gray-400">
                                Без условий — правило срабатывает на каждом
                                событии триггера.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {conditions.length > 0 && (
                                    <div className="space-y-2">
                                        {conditions.map((c) =>
                                            renderConditionRow(c, updateCondition, removeCondition),
                                        )}
                                    </div>
                                )}
                                {nestedConditions.length > 0 && (
                                    <div
                                        className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-3 space-y-2"
                                        {...qa('automation.form.nestedConditionGroup')}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500">Вложенная группа</span>
                                            <div className="w-32" {...qa('automation.form.nestedConditionLogic')}>
                                                <Select
                                                    isDisabled={readOnly}
                                                    options={logicOpOptions}
                                                    value={logicOpOptions.find(
                                                        (o) => o.value === nestedConditionOp,
                                                    )}
                                                    onChange={(opt) => {
                                                        markDirty()
                                                        setNestedConditionOp(
                                                            (opt?.value as ConditionOp) || 'or',
                                                        )
                                                    }}
                                                />
                                            </div>
                                            {!readOnly && (
                                                <Button
                                                    size="xs"
                                                    variant="plain"
                                                    icon={<PiPlusDuotone />}
                                                    onClick={addNestedCondition}
                                                >
                                                    В группу
                                                </Button>
                                            )}
                                        </div>
                                        {nestedConditions.map((c) =>
                                            renderConditionRow(
                                                c,
                                                updateNestedCondition,
                                                removeNestedCondition,
                                            ),
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </AdaptiveCard>

                {/* Секция «Действия» (EL-FORM-8/9) */}
                <AdaptiveCard>
                    <div className="flex items-center justify-between mb-3">
                        <h5>Действия</h5>
                        {!readOnly && (
                            <Button
                                size="xs"
                                variant="plain"
                                icon={<PiPlusDuotone />}
                                onClick={addAction}
                                {...qa('automation.form.addAction')}
                            >
                                Добавить действие
                            </Button>
                        )}
                    </div>
                    {actions.length === 0 ? (
                        <p className="text-xs text-gray-400">
                            Добавьте хотя бы одно действие.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {actions.map((a) => {
                                const external = isExternal(a.type)
                                // ST-12: external_effect требует manage
                                const blocked = external && !canManage
                                const opts = actionDefs.filter(
                                    (o) => !o.external || canManage,
                                )
                                return (
                                    <div
                                        key={a.id}
                                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                                        {...qa('automation.form.actionRow', { action: a.id })}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="flex-1" {...qa('automation.form.actionTypeSelect', { action: a.id })}>
                                                <Select
                                                    isDisabled={readOnly}
                                                    options={opts}
                                                    value={
                                                        actionDefs.find(
                                                            (o) =>
                                                                o.value ===
                                                                a.type,
                                                        ) || null
                                                    }
                                                    onChange={(opt) =>
                                                        updateActionType(
                                                            a.id,
                                                            opt?.value || '',
                                                        )
                                                    }
                                                    placeholder="Тип действия"
                                                    components={{ Option: QaSelectOption }}
                                                />
                                            </div>
                                            {external && (
                                                <Tag className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                                                    внешний эффект
                                                </Tag>
                                            )}
                                            {!readOnly && (
                                                <button
                                                    type="button"
                                                    aria-label="Удалить действие"
                                                    title="Удалить действие"
                                                    className="p-1.5 text-gray-400 hover:text-red-500"
                                                    onClick={() =>
                                                        removeAction(a.id)
                                                    }
                                                >
                                                    <PiXBold className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                        {blocked ? (
                                            <p className="text-xs text-amber-600" {...qa('automation.form.externalBlocked', { action: a.id })}>
                                                Для действий с внешним эффектом
                                                нужно право automation:manage.
                                            </p>
                                        ) : (
                                            <div {...qa('automation.form.actionConfig', { action: a.id })}>
                                            {renderActionConfig(a)}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </AdaptiveCard>

                {/* Доп. поля (EL-FORM-10/11) */}
                <AdaptiveCard>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Приоритет
                            </label>
                            <Input
                                type="number"
                                disabled={readOnly}
                                value={priority}
                                onChange={(e) => {
                                    markDirty()
                                    setPriority(e.target.value)
                                }}
                                {...qa('automation.form.priority')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Ответственный за ошибки
                            </label>
                            <Input
                                disabled={readOnly}
                                value={notifyOnFailure}
                                onChange={(e) => {
                                    markDirty()
                                    setNotifyOnFailure(e.target.value)
                                }}
                                placeholder="ID пользователя (по умолчанию — автор)"
                                {...qa('automation.form.notifyOnFailure')}
                            />
                        </div>
                    </div>
                </AdaptiveCard>

                {/* Секция «Статистика» (EL-FORM-14) — edit */}
                {isEdit && rule && (
                    <AdaptiveCard {...qa('automation.form.stats')}>
                        <div className="flex items-center justify-between mb-3">
                            <h5>Статистика</h5>
                            <FreshnessLabel at={rule.lastExecutedAt} />
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <p className="text-2xl font-bold">
                                    {rule.stats?.executed30d ?? 0}
                                </p>
                                <p className="text-xs text-gray-500">
                                    Сработало (30д)
                                </p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold">
                                    {rule.stats?.matched30d ?? 0}
                                </p>
                                <p className="text-xs text-gray-500">
                                    Совпало (30д)
                                </p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-red-500">
                                    {rule.stats?.lastError ? '1' : '0'}
                                </p>
                                <p className="text-xs text-gray-500">
                                    Последняя ошибка
                                </p>
                            </div>
                        </div>
                    </AdaptiveCard>
                )}

                {/* Журнал выполнений (SCR-AUTOMATION-RULE-LOG) — edit */}
                {isEdit && id && pid && (
                    <RuleLog ruleId={id} projectId={pid} canManage={canManage} />
                )}

                {/* Футер (EL-FORM-12/15/16/17/18/19) */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex gap-2">
                        {/* EL-FORM-12: Dry-run */}
                        {isEdit && canExecute && (
                            <Button
                                variant="default"
                                icon={<PiFlaskDuotone />}
                                onClick={() => setDryRunOpen(true)}
                                {...qa('automation.form.dryRun')}
                            >
                                Тест (dry-run)
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="plain" onClick={goBack} {...qa('automation.form.cancel')}>
                            Отмена
                        </Button>
                        {!readOnly && !isEdit && (
                            <>
                                <Button
                                    variant="default"
                                    loading={saving}
                                    onClick={() => handleSave(false)}
                                    {...qa('automation.form.saveDisabled')}
                                >
                                    Создать выключенным
                                </Button>
                                <Button
                                    variant="solid"
                                    color="primary"
                                    loading={saving}
                                    onClick={() => handleSave(true)}
                                    {...qa('automation.form.saveEnabled')}
                                >
                                    Создать и включить
                                </Button>
                            </>
                        )}
                        {!readOnly && isEdit && (
                            <Button
                                variant="solid"
                                color="primary"
                                loading={saving}
                                onClick={() => handleSave(rule?.enabled ?? false)}
                                {...qa('automation.form.save')}
                            >
                                Сохранить
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {/* SCR-AUTOMATION-DRYRUN overlay */}
            {isEdit && id && pid && (
                <DryRunOverlay
                    isOpen={dryRunOpen}
                    onClose={() => setDryRunOpen(false)}
                    ruleId={id}
                    projectId={pid}
                    hasExternalEffect={hasExternalEffect}
                />
            )}
        </Container>
    )
}

export default AutomationForm
