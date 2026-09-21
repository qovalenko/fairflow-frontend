import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    PiQuestion,
    PiShareNetworkDuotone,
    PiTrashDuotone,
    PiWarningDuotone,
} from 'react-icons/pi'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Select from '@/components/ui/Select'
import Tooltip from '@/components/ui/Tooltip'
import usePermission from '@/utils/hooks/usePermission'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import { useSessionUser } from '@/store/authStore'
import { PROJECT_MANAGE_ROLES } from '@/configs/permission.config'
import {
    apiGetMembers,
    apiListRecordShares,
    apiShareRecord,
    apiUnshareRecord,
    type RecordShare,
    type ShareableResource,
} from '@/services/CrmService'
import { qa } from '@/shared/qa'

type Member = { id: string; name?: string; email?: string }

/** «?»-подсказка box-паттерном (placeholder-поля без текстовой подписи). */
const HelpIcon = ({ title }: { title: string }) => (
    <Tooltip title={title}>
        <span className="flex cursor-help text-gray-400 hover:text-gray-500">
            <PiQuestion className="text-base" />
        </span>
    </Tooltip>
)

/**
 * BOX-MODEL-FINAL §6-D4/§7.2 — доступ к записи (ACL) выдаётся НА ВРЕМЯ по
 * умолчанию: у формы есть срок, «постоянный» доступ — осознанный выбор
 * (чекбокс + предупреждение). Список показывает активные шары с датой
 * истечения и кнопкой отзыва.
 *
 * Бэкенд (control.recordShare.expiresAt) уже поддерживает срок и сам
 * отфильтровывает истёкшие из списка — форма лишь перестаёт молча выдавать
 * вечный доступ по умолчанию.
 */
const TTL_OPTIONS = [
    { value: 7, label: '7 дней' },
    { value: 30, label: '30 дней' },
    { value: 90, label: '90 дней' },
    { value: 180, label: '180 дней' },
] as const

const DEFAULT_TTL_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * TODO-279: разбор отказа ручек `/v1/projects/:id/shares*`. 403 обязан читаться
 * как «нет права», а не молча превращаться в пустой список — иначе панель врёт
 * («запись ни с кем не расшарена»), хотя гранты есть и просто не видны.
 */
const shareErrorMessage = (e: unknown, fallback: string): string => {
    const resp = (
        e as {
            response?: {
                status?: number
                data?: { code?: string; message?: string }
            }
        }
    )?.response
    if (resp?.status === 403 || resp?.data?.code === 'PERMISSION_DENIED') {
        return 'Недостаточно прав: доступом к записи управляют владелец записи, руководитель или администратор проекта.'
    }
    const message = resp?.data?.message
    return typeof message === 'string' && message
        ? `${fallback}: ${message}`
        : fallback
}

const formatDate = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ru-RU')
}

/**
 * Phase 4d (spec §13.4): share a single CRM record with project members.
 * Records you share become visible to the grantee regardless of their
 * role-based visibility level (except the strict "only own" level).
 *
 * Sharing with whole departments is supported by the API; this control exposes
 * user-level sharing (the common case).
 */
const RecordShareControl = ({
    projectId,
    resource,
    recordId,
    recordOwnerUserId,
}: {
    projectId?: string
    resource: ShareableResource
    recordId?: string
    /** CRM owner/assignee — member who may share this record (FR-ACCESS-400). */
    recordOwnerUserId?: string
}) => {
    const [shares, setShares] = useState<RecordShare[]>([])
    const [members, setMembers] = useState<Member[]>([])
    const [selected, setSelected] = useState<string>('')
    const [ttlDays, setTtlDays] = useState<number>(DEFAULT_TTL_DAYS)
    const [permanent, setPermanent] = useState(false)
    const [loading, setLoading] = useState(false)
    const [busy, setBusy] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)

    /**
     * FR-ACCESS-400/420: share/unshare is owner/admin (`project:manage`),
     * manager, or the record owner. Gate lives inside the control so remotes
     * cannot forget it. Backend still fail-closes.
     */
    const canManage = usePermission('project', 'manage')
    const { projects } = useWorkspaceRole()
    const sessionUserId = useSessionUser((s) => s.user.userId)
    const projectRole = projects.find((p) => p.id === projectId)?.role
    const isManagerPlus = Boolean(
        projectRole && PROJECT_MANAGE_ROLES.includes(projectRole),
    )
    const isRecordOwner = Boolean(
        recordOwnerUserId && sessionUserId && recordOwnerUserId === sessionUserId,
    )
    const canShare = canManage || isManagerPlus || isRecordOwner

    const load = useCallback(async () => {
        if (!projectId || !recordId || !canShare) return
        setLoading(true)
        setLoadError(null)
        try {
            const [shareList, memberList] = await Promise.all([
                apiListRecordShares(projectId, resource, recordId),
                // projectId явно: список участников обязан быть от ТОГО же проекта,
                // что и список шар выше, — иначе «Кому выдать доступ» покажет чужих
                // (или никого, если стор ещё не догнал переключение проекта).
                apiGetMembers<Member[]>({ projectId }).catch(() => [] as Member[]),
            ])
            setShares(Array.isArray(shareList) ? shareList : [])
            setMembers(Array.isArray(memberList) ? memberList : [])
        } catch (e) {
            // Пустой catch здесь означал «грантов нет» при любом отказе — теперь
            // список не подменяется молчанием, причина видна.
            setShares([])
            setLoadError(shareErrorMessage(e, 'Не удалось загрузить доступы к записи'))
        } finally {
            setLoading(false)
        }
    }, [projectId, resource, recordId, canShare])

    useEffect(() => {
        void load()
    }, [load])

    const memberName = useCallback(
        (userId: string) => members.find((m) => m.id === userId)?.name || userId,
        [members],
    )

    const userShares = useMemo(
        () => shares.filter((s) => s.grantee_type === 'user'),
        [shares],
    )

    // Candidates = members not already shared with.
    const candidateOptions = useMemo(() => {
        const taken = new Set(userShares.map((s) => s.grantee_id))
        return members
            .filter((m) => !taken.has(m.id))
            .map((m) => ({ value: m.id, label: m.name || m.email || m.id }))
    }, [members, userShares])

    const ttlValue = useMemo(
        () => TTL_OPTIONS.find((o) => o.value === ttlDays) ?? null,
        [ttlDays],
    )

    const addShare = async () => {
        if (!projectId || !recordId || !selected) return
        setBusy(true)
        setActionError(null)
        try {
            const expiresAt = permanent
                ? undefined
                : new Date(Date.now() + ttlDays * DAY_MS).toISOString()
            await apiShareRecord(projectId, {
                resource,
                recordId,
                granteeType: 'user',
                granteeId: selected,
                expiresAt,
            })
            setSelected('')
            setPermanent(false)
            setTtlDays(DEFAULT_TTL_DAYS)
            await load()
        } catch (e) {
            setActionError(shareErrorMessage(e, 'Не удалось выдать доступ'))
        } finally {
            setBusy(false)
        }
    }

    const removeShare = async (shareId: string) => {
        if (!projectId) return
        setBusy(true)
        setActionError(null)
        try {
            await apiUnshareRecord(projectId, shareId)
            await load()
        } catch (e) {
            setActionError(shareErrorMessage(e, 'Не удалось отозвать доступ'))
        } finally {
            setBusy(false)
        }
    }

    if (!projectId || !recordId) return null
    if (!canShare) return null

    const canRevoke = (share: RecordShare) =>
        canManage ||
        isManagerPlus ||
        Boolean(sessionUserId && share.created_by && share.created_by === sessionUserId)

    const header = (
        <div className="flex items-center gap-2">
            <PiShareNetworkDuotone className="w-5 h-5 text-gray-500" />
            <h6 className="font-semibold">Доступ к записи</h6>
        </div>
    )

    // ST-error: список не прочитан — показываем причину и «Повторить», а НЕ
    // форму выдачи поверх пустого списка (иначе отказ выглядит как «грантов нет»).
    if (loadError) {
        return (
            <div className="space-y-3">
                {header}
                <Alert showIcon type="danger" className="text-sm">
                    {loadError}
                </Alert>
                <Button size="sm" loading={loading} onClick={() => void load()}>
                    Повторить
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-3" {...qa('host.recordShare.root')}>
            {header}

            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <div className="flex-1">
                        <Select<{ value: string; label: string }>
                            placeholder="Поделиться с участником…"
                            isDisabled={busy || loading || candidateOptions.length === 0}
                            value={candidateOptions.find((o) => o.value === selected) ?? null}
                            options={candidateOptions}
                            onChange={(opt) => setSelected(opt?.value ?? '')}
                            {...qa('host.recordShare.member')}
                        />
                    </div>
                    <Button
                        size="sm"
                        variant="solid"
                        color="primary"
                        loading={busy}
                        disabled={!selected}
                        onClick={addShare}
                    >
                        Поделиться
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <div className="w-40">
                        <Select<{ value: number; label: string }>
                            placeholder="Срок доступа"
                            isDisabled={busy || permanent}
                            value={ttlValue}
                            options={
                                TTL_OPTIONS as unknown as {
                                    value: number
                                    label: string
                                }[]
                            }
                            onChange={(opt) => setTtlDays(opt?.value ?? DEFAULT_TTL_DAYS)}
                        />
                    </div>
                    <HelpIcon title="Доступ к карточке выдаётся на срок и автоматически истекает — так лишний доступ не остаётся навсегда." />
                    <Checkbox checked={permanent} onChange={(val) => setPermanent(val)}>
                        Постоянный доступ
                    </Checkbox>
                </div>

                {permanent && (
                    <Alert showIcon type="warning" className="text-sm">
                        Постоянный доступ не истечёт сам — участник будет видеть эту
                        карточку, пока вы не отзовёте доступ вручную. Используйте срок,
                        если доступ нужен временно.
                    </Alert>
                )}

                {actionError && (
                    <Alert showIcon type="danger" className="text-sm">
                        {actionError}
                    </Alert>
                )}
            </div>

            <div className="space-y-1">
                {userShares.length === 0 ? (
                    <p className="text-sm text-gray-500">Запись ни с кем не расшарена.</p>
                ) : (
                    userShares.map((s) => (
                        <div
                            key={s.id}
                            className="flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700"
                        >
                            <div className="flex flex-col">
                                <span className="text-sm">{memberName(s.grantee_id)}</span>
                                {s.expires_at ? (
                                    <span className="text-xs text-gray-500">
                                        до {formatDate(s.expires_at)}
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
                                        <PiWarningDuotone className="w-3.5 h-3.5" />
                                        постоянный доступ
                                    </span>
                                )}
                            </div>
                            {canRevoke(s) && (
                                <button
                                    type="button"
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-red-500"
                                    title="Отозвать доступ"
                                    aria-label="Отозвать доступ"
                                    onClick={() => removeShare(s.id)}
                                >
                                    <PiTrashDuotone className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

export default RecordShareControl
