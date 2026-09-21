import { useEffect, useState } from 'react'
import {
    PiCheckCircleDuotone,
    PiXCircleDuotone,
    PiMinusCircleDuotone,
} from 'react-icons/pi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import usePermission from '@/utils/hooks/usePermission'
import {
    apiSimulateAccess,
    apiGetProjectMembers,
    type AccessSimulateResult,
    type AccessTraceStep,
    type AbacPolicyRule,
    type ProjectMember,
} from '@/services/CrmService'
import { qa } from '@/shared/qa'

/**
 * SCR-PRJSET-ACCESS-SIMULATOR — PDP access simulator (E2-09 / E2-15).
 *
 * "given user + resource + recordId? + action → allow/deny with per-layer trace".
 * Drives `POST /api/v1/projects/:pid/access/simulate` (K3fe-be) — same engine as
 * enforcement (`explain=true`), no parallel logic. Shows the explain-trace by
 * RBAC → ABAC → visibility → sharing layers with deny>allow priority (FR-MPRJ-18).
 *
 * Access: `roles:read` (RBAC) / admin+ for the ABAC layer (FR-ABAC-20). FE gating
 * is UX only — backend guard is authoritative.
 *
 * `draftRules` (optional): the UNSAVED policy set from SCR-PRJSET-POLICIES — when
 * present the result is marked "preview of unsaved policy" (ST-30).
 */
interface AccessSimulatorProps {
    projectId?: string
    /** subjects available in the policy constructor (enabled modules). */
    subjects?: string[]
    /** unsaved rule set for the "preview" path (ST-30). */
    draftRules?: AbacPolicyRule[]
}

const ACTION_OPTIONS = [
    { value: 'read', label: 'Просмотр (read)' },
    { value: 'create', label: 'Создание (create)' },
    { value: 'update', label: 'Изменение (update)' },
    { value: 'delete', label: 'Удаление (delete)' },
    { value: 'manage', label: 'Управление (manage)' },
]

const LAYER_LABELS: Record<AccessTraceStep['layer'], string> = {
    rbac: 'Роли (RBAC)',
    abac: 'Атрибуты (ABAC)',
    visibility: 'Видимость',
    sharing: 'Шаринг',
}

const effectIcon = (effect: AccessTraceStep['effect']) => {
    if (effect === 'allow' || effect === 'pass' || effect === 'grant')
        return <PiCheckCircleDuotone className="h-5 w-5 text-emerald-500" />
    if (effect === 'deny')
        return <PiXCircleDuotone className="h-5 w-5 text-red-500" />
    // narrow / anything else — layer applied but was not decisive.
    return <PiMinusCircleDuotone className="h-5 w-5 text-gray-400" />
}

const AccessSimulator = ({
    projectId,
    subjects = [],
    draftRules,
}: AccessSimulatorProps) => {
    const canRead = usePermission('roles', 'read')

    const [members, setMembers] = useState<ProjectMember[]>([])
    const [userId, setUserId] = useState('')
    const [subject, setSubject] = useState(subjects[0] ?? '')
    const [action, setAction] = useState('read')
    const [recordId, setRecordId] = useState('')

    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState<AccessSimulateResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [inputError, setInputError] = useState<string | null>(null)

    // member picker (subject of the simulation)
    useEffect(() => {
        if (!projectId) return
        let mounted = true
        apiGetProjectMembers<ProjectMember[]>(projectId)
            .then((res) => mounted && setMembers(Array.isArray(res) ? res : []))
            .catch(() => undefined)
        return () => {
            mounted = false
        }
    }, [projectId])

    const userOptions = members.map((m) => ({
        value: m.id,
        label: `${m.name || m.email || m.id} · ${m.role}`,
    }))
    const subjectOptions = (subjects.length ? subjects : ['contacts', 'deals']).map(
        (s) => ({ value: s, label: s }),
    )

    const handleSimulate = async () => {
        if (!projectId) return
        // ST-7: invalid input → inline (no user / no action).
        if (!userId) {
            setInputError('Выберите пользователя.')
            return
        }
        if (!action || !subject) {
            setInputError('Укажите ресурс и действие.')
            return
        }
        setInputError(null)
        setError(null)
        setLoading(true)
        setResult(null)
        try {
            const res = await apiSimulateAccess(projectId, {
                userId,
                subject,
                action,
                recordId: recordId.trim() || undefined,
                draftRules,
            })
            setResult(res)
        } catch (e) {
            // ST-6 simulate error+retry; 403 = cross-project isolation (FR-ABAC-20).
            const status = (e as { response?: { status?: number } })?.response?.status
            setError(
                status === 403
                    ? 'Нет прав для симуляции в этом проекте.'
                    : 'Не удалось выполнить симуляцию. Повторите.',
            )
        } finally {
            setLoading(false)
        }
    }

    // ST-10/ST-11: no roles:read → no access to the simulator.
    if (!canRead) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.access.simulator.noRead')}>
                <p className="py-6 text-center text-sm text-gray-500">
                    Симулятор доступа доступен пользователям с правом просмотра
                    ролей.
                </p>
            </AdaptiveCard>
        )
    }

    return (
        <AdaptiveCard {...qa('host.projectSettings.access.simulator.root')}>
            <div className="space-y-5">
                <div>
                    <h3 className="text-lg font-semibold">Симулятор доступа</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        «Что увидит / сможет сделать пользователь» — пошаговая
                        трасса по слоям: роли → атрибуты → видимость → шаринг.
                        Приоритет запрета над разрешением.
                    </p>
                    {draftRules && (
                        <Tag
                            className="mt-2 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            {...qa('host.projectSettings.access.simulator.previewTag')}
                        >
                            Предпросмотр несохранённой политики
                        </Tag>
                    )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-sm font-medium">
                            Пользователь
                        </label>
                        <Select<{ value: string; label: string }>
                            placeholder="Выберите участника"
                            value={userOptions.find((o) => o.value === userId)}
                            options={userOptions}
                            onChange={(o) => setUserId(o?.value ?? '')}
                            {...qa('host.projectSettings.access.simulator.userSelect')}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium">
                            Ресурс
                        </label>
                        <Select<{ value: string; label: string }>
                            value={subjectOptions.find((o) => o.value === subject)}
                            options={subjectOptions}
                            onChange={(o) => setSubject(o?.value ?? '')}
                            {...qa('host.projectSettings.access.simulator.subjectSelect')}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium">
                            Действие
                        </label>
                        <Select<{ value: string; label: string }>
                            value={ACTION_OPTIONS.find((o) => o.value === action)}
                            options={ACTION_OPTIONS}
                            onChange={(o) => setAction(o?.value ?? 'read')}
                            {...qa('host.projectSettings.access.simulator.actionSelect')}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium">
                            ID записи (необязательно)
                        </label>
                        <Input
                            value={recordId}
                            placeholder="напр. конкретная сделка"
                            onChange={(e) => setRecordId(e.target.value)}
                            {...qa('host.projectSettings.access.simulator.recordId')}
                        />
                    </div>
                </div>

                {inputError && (
                    <p
                        className="text-sm text-red-600 dark:text-red-400"
                        {...qa('host.projectSettings.access.simulator.inputError')}
                    >
                        {inputError}
                    </p>
                )}

                <div className="flex items-center gap-3">
                    <Button
                        {...qa('host.projectSettings.access.simulator.run')}
                        variant="solid"
                        color="primary"
                        loading={loading}
                        disabled={!projectId}
                        onClick={handleSimulate}
                    >
                        Симулировать
                    </Button>
                    {error && (
                        <span
                            className="text-sm text-red-600 dark:text-red-400"
                            {...qa('host.projectSettings.access.simulator.error')}
                        >
                            {error}{' '}
                            <button
                                className="underline"
                                onClick={handleSimulate}
                                {...qa('host.projectSettings.access.simulator.retry')}
                            >
                                повторить
                            </button>
                        </span>
                    )}
                </div>

                {result && (
                    <div
                        {...qa('host.projectSettings.access.simulator.result')}
                        className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700"
                    >
                        <div
                            className="flex items-center gap-3"
                            {...qa('host.projectSettings.access.simulator.decision', {
                                decision: result.decision,
                            })}
                        >
                            {result.decision === 'allow' ? (
                                <PiCheckCircleDuotone className="h-7 w-7 text-emerald-500" />
                            ) : (
                                <PiXCircleDuotone className="h-7 w-7 text-red-500" />
                            )}
                            <span
                                className={`text-lg font-semibold ${
                                    result.decision === 'allow'
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : 'text-red-600 dark:text-red-400'
                                }`}
                            >
                                {result.decision === 'allow'
                                    ? 'Доступ разрешён'
                                    : 'Доступ запрещён'}
                            </span>
                        </div>
                        {result.reason && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {result.reason}
                            </p>
                        )}
                        <div
                            className="space-y-2"
                            {...qa('host.projectSettings.access.simulator.trace')}
                        >
                            {result.trace.map((step, idx) => (
                                <div
                                    key={`${step.layer}-${idx}`}
                                    className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                                    {...qa('host.projectSettings.access.simulator.traceStep', {
                                        layer: step.layer,
                                        step: idx,
                                    })}
                                >
                                    {effectIcon(step.effect)}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium">
                                                {LAYER_LABELS[step.layer]}
                                            </span>
                                            {step.effect === 'deny' && (
                                                <Tag className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                                    запрет решает
                                                </Tag>
                                            )}
                                            {step.inactive && (
                                                <Tag className="bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                                    слой не проверялся
                                                </Tag>
                                            )}
                                        </div>
                                        {step.reason && (
                                            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                                                {step.reason}
                                            </p>
                                        )}
                                        {step.ruleId && (
                                            <p className="mt-0.5 text-xs text-gray-400">
                                                правило: {step.ruleId}
                                            </p>
                                        )}
                                        {step.matchedKeys &&
                                            step.matchedKeys.length > 0 && (
                                                <p className="mt-0.5 text-xs text-gray-400">
                                                    ключи: {step.matchedKeys.join(', ')}
                                                </p>
                                            )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </AdaptiveCard>
    )
}

export default AccessSimulator
