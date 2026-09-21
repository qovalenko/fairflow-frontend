import { useEffect, useMemo, useState } from 'react'
import {
    PiPlusDuotone,
    PiTrashDuotone,
    PiFlaskDuotone,
    PiCheckCircleDuotone,
    PiWarningDuotone,
} from 'react-icons/pi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Drawer from '@/components/ui/Drawer'
import Tag from '@/components/ui/Tag'
import Switcher from '@/components/ui/Switcher'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import usePermission from '@/utils/hooks/usePermission'
import { useUnsavedChangesGuard } from '@/utils/hooks/useUnsavedChangesGuard'
import AccessSimulator from './AccessSimulator'
import {
    ABAC_LEAF_OPS,
    ABAC_OP_LABELS,
    abacErrorLabel,
    emptyAbacRule,
    emptyCondition,
    isSetOperator,
    precheckCondition,
    summarizeRule,
} from './abac.constants'
import {
    apiGetProjectPolicies,
    apiUpdateProjectPolicies,
    apiValidateProjectPolicies,
    type AbacOperator,
    type AbacPolicyCondition,
    type AbacPolicyRule,
    type PolicySaveResult,
} from '@/services/CrmService'
import { qa } from '@/shared/qa'

/**
 * SCR-PRJSET-POLICIES (ABAC part) + SCR-PRJSET-ACCESS-SIMULATOR — E2-15.
 *
 * Visual ABAC-policy constructor over the CLOSED set of 10 operators (K2-abac),
 * live pre-validation by `AbacErrorCode`, dual-compile "Проверить" + save with
 * 207 accepted/rejected[] handling (FR-ABAC-22), anti-lockout (FR-ABAC-24), and
 * a built-in access simulator drawer driving the PDP `/access/simulate` (E2-09).
 *
 * Gating: read needs project membership; mutations need `project:manage`
 * (FR-MPRJ-26). FE gating is UX — backend guard is authoritative.
 *
 * `subjects` — subjects available in the constructor (enabled-module
 * policyCapabilities, FR-MPRJ-16); a subject of a disabled module is not offered
 * and its existing rules render as `inactive` (FR-ABAC-11, ST-16/17).
 */
interface AbacEditorProps {
    projectId?: string
    /** subjects from enabled modules' policyCapabilities (Contextual UI). */
    subjects?: string[]
}

const ACTION_OPTIONS = ['read', 'create', 'update', 'delete', 'manage']

const opOptions = ABAC_LEAF_OPS.map((op) => ({
    value: op,
    label: ABAC_OP_LABELS[op],
}))

const AbacEditor = ({ projectId, subjects = [] }: AbacEditorProps) => {
    const canManage = usePermission('project', 'manage')

    const [rules, setRules] = useState<AbacPolicyRule[]>([])
    const [sharingEnabled, setSharingEnabled] = useState(false)
    const [sharingNotify, setSharingNotify] = useState(false)
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [validation, setValidation] = useState<PolicySaveResult | null>(null)
    useUnsavedChangesGuard(dirty, `abac:${projectId ?? 'none'}`)

    // editor drawer (add/edit a single rule)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [editIndex, setEditIndex] = useState<number | null>(null)
    const [draft, setDraft] = useState<AbacPolicyRule>(emptyAbacRule())

    // simulator drawer (preview with current unsaved set, ST-30)
    const [simOpen, setSimOpen] = useState(false)

    const subjectOptions = useMemo(
        () =>
            (subjects.length ? subjects : ['contacts', 'companies', 'deals']).map(
                (s) => ({ value: s, label: s }),
            ),
        [subjects],
    )

    const load = () => {
        if (!projectId) return
        setLoading(true)
        setLoadError(null)
        apiGetProjectPolicies(projectId)
            .then((res) => {
                setRules(Array.isArray(res?.rules) ? res.rules : [])
                setSharingEnabled(!!res?.sharingEnabled)
                setSharingNotify(!!res?.sharingNotify)
                setDirty(false)
            })
            // ST-6: load error+retry (no silent swallow — fixes M-3).
            .catch(() => setLoadError('Не удалось загрузить политики.'))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId])

    const openCreate = () => {
        setEditIndex(null)
        setDraft(emptyAbacRule())
        setDrawerOpen(true)
    }
    const openEdit = (idx: number) => {
        setEditIndex(idx)
        setDraft(JSON.parse(JSON.stringify(rules[idx])))
        setDrawerOpen(true)
    }

    const draftErrors = useMemo(
        () => draft.conditions.map((c) => precheckCondition(c)),
        [draft],
    )
    const draftValid =
        !!draft.subject &&
        !!draft.action &&
        draft.conditions.length > 0 &&
        draftErrors.every((e) => e === null)

    const commitDraft = () => {
        if (!draftValid) return
        setRules((prev) => {
            const next = [...prev]
            if (editIndex === null) next.push(draft)
            else next[editIndex] = draft
            return next
        })
        setDirty(true)
        setValidation(null)
        setDrawerOpen(false)
    }

    const removeRule = (idx: number) => {
        setRules((prev) => prev.filter((_, i) => i !== idx))
        setDirty(true)
        setValidation(null)
    }

    const setCondition = (
        idx: number,
        patch: Partial<AbacPolicyCondition>,
    ) =>
        setDraft((d) => ({
            ...d,
            conditions: d.conditions.map((c, i) =>
                i === idx ? { ...c, ...patch } : c,
            ),
        }))

    const handleValidate = async () => {
        if (!projectId) return
        try {
            const res = await apiValidateProjectPolicies(projectId, rules)
            setValidation(res)
        } catch (e) {
            const code = (e as { response?: { data?: { code?: string } } })
                ?.response?.data?.code
            setValidation({
                accepted: [],
                rejected: [{ index: -1, code: code ?? 'POLICY_NOT_COMPILABLE' }],
            })
        }
    }

    const handleSave = async () => {
        if (!projectId) return
        setSaving(true)
        try {
            const res = await apiUpdateProjectPolicies(projectId, {
                rules,
                sharingEnabled,
                sharingNotify,
            })
            setValidation(res)
            // 207: keep rejected for display; otherwise success.
            if (res.rejected && res.rejected.length > 0) {
                toast.push(
                    <Notification title="Сохранено частично" type="warning">
                        Часть правил отклонена — см. причины ниже.
                    </Notification>,
                )
            } else {
                setDirty(false)
                toast.push(
                    <Notification title="Политики сохранены" type="success" />,
                )
            }
        } catch (e) {
            // 422 POLICY_NOT_COMPILABLE / 400 OWNER_LOCKOUT (FR-ABAC-24).
            const code = (e as { response?: { data?: { code?: string } } })
                ?.response?.data?.code
            toast.push(
                <Notification title="Не удалось сохранить" type="danger">
                    {abacErrorLabel(code)}
                </Notification>,
            )
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            <AdaptiveCard {...qa('host.projectSettings.abac.root')}>
                <div className="space-y-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-semibold">
                                Правила по условию
                            </h3>
                            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                                Правила доступа по атрибутам записи/пользователя
                                поверх ролей и видимости. Запрет имеет приоритет
                                над разрешением. Допустимы 10 операторов;
                                несовместимые с хранилищем условия отклоняются при
                                проверке.
                            </p>
                        </div>
                        {canManage && (
                            <Button
                                size="sm"
                                variant="solid"
                                icon={<PiPlusDuotone />}
                                onClick={openCreate}
                                {...qa('host.projectSettings.abac.addRule')}
                            >
                                Добавить правило
                            </Button>
                        )}
                    </div>

                    {loading && (
                        <div
                            className="flex justify-center py-8"
                            {...qa('host.projectSettings.abac.loading')}
                        >
                            <Spinner size={32} />
                        </div>
                    )}

                    {loadError && !loading && (
                        <div
                            className="py-4 text-sm text-red-600 dark:text-red-400"
                            {...qa('host.projectSettings.abac.loadError')}
                        >
                            {loadError}{' '}
                            <button
                                className="underline"
                                onClick={load}
                                {...qa('host.projectSettings.abac.retry')}
                            >
                                повторить
                            </button>
                        </div>
                    )}

                    {/* ST-3: no ABAC rules — RBAC + visibility still apply. */}
                    {!loading && !loadError && rules.length === 0 && (
                        <div
                            className="rounded-lg border border-dashed border-gray-300 py-8 text-center dark:border-gray-700"
                            {...qa('host.projectSettings.abac.empty')}
                        >
                            <p className="text-sm text-gray-500">
                                Правил нет — действуют роли и видимость записей.
                            </p>
                            {canManage && (
                                <Button
                                    className="mt-3"
                                    size="sm"
                                    variant="plain"
                                    onClick={openCreate}
                                    {...qa('host.projectSettings.abac.addFirstRule')}
                                >
                                    Добавить первое правило
                                </Button>
                            )}
                        </div>
                    )}

                    {!loading && rules.length > 0 && (
                        <div
                            className="space-y-2"
                            {...qa('host.projectSettings.abac.rulesList')}
                        >
                            {rules.map((rule, idx) => {
                                const rejected = validation?.rejected?.find(
                                    (r) => r.index === idx,
                                )
                                return (
                                    <div
                                        key={rule.id ?? idx}
                                        className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                                        {...qa('host.projectSettings.abac.rule', {
                                            rule: rule.id ?? idx,
                                        })}
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <Tag
                                                    className={
                                                        rule.effect === 'deny'
                                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                                    }
                                                >
                                                    {rule.effect === 'deny'
                                                        ? 'Запрет'
                                                        : 'Разрешить'}
                                                </Tag>
                                                {rule.inactive && (
                                                    <Tag className="bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                                        модуль выключен
                                                    </Tag>
                                                )}
                                            </div>
                                            <p className="mt-1 text-sm">
                                                {summarizeRule(rule)}
                                            </p>
                                            {rejected && (
                                                <p className="mt-1 flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                                                    <PiWarningDuotone />
                                                    {abacErrorLabel(rejected.code)}
                                                </p>
                                            )}
                                        </div>
                                        {canManage && (
                                            <div className="flex gap-1">
                                                <Button
                                                    size="xs"
                                                    variant="plain"
                                                    onClick={() => openEdit(idx)}
                                                    {...qa('host.projectSettings.abac.editRule', {
                                                        rule: rule.id ?? idx,
                                                    })}
                                                >
                                                    Изм.
                                                </Button>
                                                <button
                                                    className="rounded p-1.5 text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                                    title="Удалить"
                                                    onClick={() => removeRule(idx)}
                                                    {...qa('host.projectSettings.abac.deleteRule', {
                                                        rule: rule.id ?? idx,
                                                    })}
                                                >
                                                    <PiTrashDuotone className="h-4 w-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {/* Sharing toggles (EL-PLC-7). */}
                    {canManage && (
                        <div
                            className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700"
                            {...qa('host.projectSettings.abac.sharing')}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium">
                                        Разрешить шаринг записей
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        Участники могут делиться отдельными
                                        записями с коллегами/отделами.
                                    </div>
                                </div>
                                <Switcher
                                    checked={sharingEnabled}
                                    onChange={(v) => {
                                        setSharingEnabled(v)
                                        setDirty(true)
                                    }}
                                    {...qa('host.projectSettings.abac.sharingEnabled')}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium">
                                        Уведомлять о шаринге
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        Получатель доступа получает уведомление.
                                    </div>
                                </div>
                                <Switcher
                                    checked={sharingNotify}
                                    disabled={!sharingEnabled}
                                    onChange={(v) => {
                                        setSharingNotify(v)
                                        setDirty(true)
                                    }}
                                    {...qa('host.projectSettings.abac.sharingNotify')}
                                />
                            </div>
                        </div>
                    )}

                    {/* Validation summary (207 / 422). */}
                    {validation && (
                        <div
                            className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-800/50"
                            {...qa('host.projectSettings.abac.validation')}
                        >
                            {validation.rejected &&
                            validation.rejected.length > 0 ? (
                                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                                    <PiWarningDuotone />
                                    Отклонено правил:{' '}
                                    {validation.rejected.length}. Принято:{' '}
                                    {validation.accepted.length}.
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                                    <PiCheckCircleDuotone />
                                    Все правила компилируются.
                                </div>
                            )}
                            {validation.selfLockoutWarning && (
                                <p
                                    className="mt-1 text-amber-700 dark:text-amber-400"
                                    {...qa('host.projectSettings.abac.lockoutWarning')}
                                >
                                    Внимание: правило может ограничить ваш
                                    собственный доступ.
                                </p>
                            )}
                            {validation.ownerLockout && (
                                <p
                                    className="mt-1 text-red-700 dark:text-red-400"
                                    {...qa('host.projectSettings.abac.ownerLockout')}
                                >
                                    Правило заблокирует доступ владельца проекта.
                                </p>
                            )}
                            {(validation.affectedUsers?.count ?? 0) > 0 && (
                                <p className="mt-1 text-gray-600 dark:text-gray-300">
                                    Затронуто участников:{' '}
                                    {validation.affectedUsers?.count}. Пример:{' '}
                                    {(validation.affectedUsers?.sample ?? []).join(', ')}
                                </p>
                            )}
                            {(validation.affectedRecords ?? 0) > 0 && (
                                <p
                                    className="mt-1 text-gray-600 dark:text-gray-300"
                                    {...qa('host.projectSettings.abac.dryRunResults')}
                                >
                                    Оценка затронутых записей (dry-run):{' '}
                                    {validation.affectedRecords}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Action panel (EL-PLC-4..9). */}
                    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                        <Button
                            variant="plain"
                            icon={<PiFlaskDuotone />}
                            onClick={() => setSimOpen(true)}
                            {...qa('host.projectSettings.abac.simOpen')}
                        >
                            Симулятор
                        </Button>
                        {canManage && (
                            <>
                                <Button
                                    variant="default"
                                    disabled={!projectId || rules.length === 0}
                                    onClick={handleValidate}
                                    {...qa('host.projectSettings.abac.validate')}
                                >
                                    Проверить
                                </Button>
                                <Button
                                    variant="solid"
                                    color="primary"
                                    loading={saving}
                                    disabled={!projectId || !dirty}
                                    onClick={handleSave}
                                    {...qa('host.projectSettings.abac.save')}
                                >
                                    Сохранить
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </AdaptiveCard>

            {/* Rule constructor drawer. */}
            <Drawer
                isOpen={drawerOpen}
                title={editIndex === null ? 'Новое правило' : 'Изменить правило'}
                width={520}
                onClose={() => setDrawerOpen(false)}
                {...qa('host.projectSettings.abac.ruleDrawer')}
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="mb-1 block text-sm font-medium">
                                Ресурс (subject)
                            </label>
                            <Select<{ value: string; label: string }>
                                value={subjectOptions.find(
                                    (o) => o.value === draft.subject,
                                )}
                                options={subjectOptions}
                                onChange={(o) =>
                                    setDraft((d) => ({
                                        ...d,
                                        subject: o?.value ?? '',
                                    }))
                                }
                                {...qa('host.projectSettings.abac.subjectSelect')}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium">
                                Действие
                            </label>
                            <Select<{ value: string; label: string }>
                                value={{
                                    value: draft.action,
                                    label: draft.action,
                                }}
                                options={ACTION_OPTIONS.map((a) => ({
                                    value: a,
                                    label: a,
                                }))}
                                onChange={(o) =>
                                    setDraft((d) => ({
                                        ...d,
                                        action: o?.value ?? 'read',
                                    }))
                                }
                                {...qa('host.projectSettings.abac.actionSelect')}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium">
                            Эффект
                        </label>
                        <Select<{ value: 'allow' | 'deny'; label: string }>
                            value={{
                                value: draft.effect,
                                label:
                                    draft.effect === 'deny'
                                        ? 'Запретить'
                                        : 'Разрешить',
                            }}
                            options={[
                                { value: 'allow', label: 'Разрешить' },
                                { value: 'deny', label: 'Запретить' },
                            ]}
                            onChange={(o) =>
                                setDraft((d) => ({
                                    ...d,
                                    effect: o?.value ?? 'allow',
                                }))
                            }
                            {...qa('host.projectSettings.abac.effectSelect')}
                        />
                    </div>

                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <label className="text-sm font-medium">
                                Условия (все должны выполняться)
                            </label>
                            <Button
                                size="xs"
                                variant="plain"
                                icon={<PiPlusDuotone />}
                                onClick={() =>
                                    setDraft((d) => ({
                                        ...d,
                                        conditions: [
                                            ...d.conditions,
                                            emptyCondition(),
                                        ],
                                    }))
                                }
                                {...qa('host.projectSettings.abac.addCondition')}
                            >
                                Условие
                            </Button>
                        </div>
                        <div className="space-y-3">
                            {draft.conditions.map((c, i) => (
                                <div
                                    key={i}
                                    className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                                    {...qa('host.projectSettings.abac.condition', {
                                        index: i,
                                    })}
                                >
                                    <div className="grid grid-cols-3 gap-2">
                                        <Input
                                            placeholder="record.field"
                                            value={c.attribute}
                                            onChange={(e) =>
                                                setCondition(i, {
                                                    attribute: e.target.value,
                                                })
                                            }
                                        />
                                        <Select<{
                                            value: AbacOperator
                                            label: string
                                        }>
                                            value={opOptions.find(
                                                (o) => o.value === c.operator,
                                            )}
                                            options={opOptions}
                                            onChange={(o) =>
                                                setCondition(i, {
                                                    operator:
                                                        o?.value ?? 'eq',
                                                })
                                            }
                                        />
                                        <Input
                                            placeholder={
                                                isSetOperator(c.operator)
                                                    ? 'a, b, c'
                                                    : 'значение'
                                            }
                                            value={
                                                Array.isArray(c.value)
                                                    ? c.value.join(', ')
                                                    : String(c.value ?? '')
                                            }
                                            onChange={(e) =>
                                                setCondition(i, {
                                                    value: e.target.value,
                                                })
                                            }
                                        />
                                    </div>
                                    {draftErrors[i] && (
                                        <p className="text-xs text-red-600 dark:text-red-400">
                                            {abacErrorLabel(
                                                draftErrors[i] as string,
                                            )}
                                        </p>
                                    )}
                                    {draft.conditions.length > 1 && (
                                        <button
                                            className="text-xs text-red-500 underline"
                                            onClick={() =>
                                                setDraft((d) => ({
                                                    ...d,
                                                    conditions:
                                                        d.conditions.filter(
                                                            (_, j) => j !== i,
                                                        ),
                                                }))
                                            }
                                        >
                                            убрать условие
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            variant="plain"
                            onClick={() => setDrawerOpen(false)}
                            {...qa('host.projectSettings.abac.ruleCancel')}
                        >
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="primary"
                            disabled={!draftValid}
                            onClick={commitDraft}
                            {...qa('host.projectSettings.abac.ruleSave')}
                        >
                            {editIndex === null ? 'Добавить' : 'Сохранить'}
                        </Button>
                    </div>
                </div>
            </Drawer>

            {/* Simulator drawer (preview with current unsaved rules, ST-30). */}
            <Drawer
                isOpen={simOpen}
                title="Симулятор доступа"
                width={640}
                onClose={() => setSimOpen(false)}
                {...qa('host.projectSettings.abac.simDrawer')}
            >
                <AccessSimulator
                    projectId={projectId}
                    subjects={subjects}
                    draftRules={dirty ? rules : undefined}
                />
            </Drawer>
        </>
    )
}

export default AbacEditor
