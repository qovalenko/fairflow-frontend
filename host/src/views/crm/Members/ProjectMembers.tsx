import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { PiPlusBold, PiTrashDuotone, PiCrownDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Avatar from '@/components/ui/Avatar'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import Input from '@/components/ui/Input'
import Skeleton from '@/components/ui/Skeleton'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    apiGetProjectMembers,
    apiGetProject,
    apiUpdateProjectMemberRole,
    apiRemoveProjectMember,
    apiPreviewRemoveProjectMember,
    apiTransferProjectOwnership,
} from '@/services/CrmService'
import type { ProjectMember, ProjectRole } from '@/services/CrmService'
import {
    roleLabels,
    assignableRoleOptions,
    getInitials,
    memberErrorMessage,
} from './memberHelpers'
import { personDisplayName } from '@/utils/displayName'
import { qa } from '@/shared/qa'
import type { ColumnDef } from '@/components/shared/DataTable'

/** Backend gate for project-transfer is not yet shipped (see CrmService note +
 *  board dependency). Flip on once `POST /transfer-ownership` lands. */
const TRANSFER_ENABLED = false

const notify = (title: string, type: 'success' | 'danger' | 'warning') =>
    toast.push(<Notification title={title} type={type} />)

const sourceLabel = (source?: string): string => {
    switch (source) {
        case 'invited':
            return 'Приглашён'
        case 'department':
            return 'Из отдела'
        case 'personal':
            return 'Лично'
        default:
            return '—'
    }
}

/**
 * SCR-PRJSET-MEMBERS — участники проекта (standalone, route `/p/:pid/members`).
 * Реальные данные `GET /v1/projects/:pid/members`; смена роли / удаление —
 * мутации #30/#31 (TO-BE be). Состояния: ST-1 (skeleton) / ST-3 (только owner) /
 * ST-6 (load+retry) / ST-7 (409 LAST_OWNER, 403, 423) / ST-10/11 (нет manage —
 * read-only) / ST-22 (archived/pending — мутации заблокированы) / ST-29 (toast).
 * Объединяет дубль с MembersTab (D10 / M-4).
 */
const ProjectMembers = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const canManage = usePermission('project', 'manage')

    const [members, setMembers] = useState<ProjectMember[]>([])
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [reload, setReload] = useState(0)
    const triggerReload = () => setReload((n) => n + 1)

    // Project lifecycle status drives ST-22 (archived / pending-deletion read-only).
    const [projectStatus, setProjectStatus] = useState<'active' | 'archived' | 'pending_deletion'>(
        'active',
    )

    const [busyUserId, setBusyUserId] = useState<string | null>(null)
    const [removeTarget, setRemoveTarget] = useState<ProjectMember | null>(null)
    const [removeOwnedCount, setRemoveOwnedCount] = useState(0)
    const [removePreviewFailed, setRemovePreviewFailed] = useState(false)
    const [reassignToUserId, setReassignToUserId] = useState('')
    const [transferTarget, setTransferTarget] = useState<ProjectMember | null>(null)
    const [confirmName, setConfirmName] = useState('')
    const [acting, setActing] = useState(false)
    const [actionError, setActionError] = useState<string | null>(null)

    useEffect(() => {
        if (!pid) return
        let mounted = true
        setLoading(true)
        setLoadError(null)
        apiGetProjectMembers<ProjectMember[]>(pid)
            .then((res) => {
                if (mounted) setMembers(Array.isArray(res) ? res : [])
            })
            .catch((err) => {
                if (mounted)
                    setLoadError(
                        memberErrorMessage(err, 'Не удалось загрузить список участников'),
                    )
            })
            .finally(() => mounted && setLoading(false))
        return () => {
            mounted = false
        }
    }, [pid, reload])

    // Lifecycle status (best-effort — failure leaves the list usable, just no
    // archived banner; mutations still surface 423 from the server).
    useEffect(() => {
        if (!pid) return
        let mounted = true
        apiGetProject<{ is_archived?: boolean; status?: string }>(pid)
            .then((res) => {
                if (!mounted) return
                setProjectStatus(
                    res?.status === 'pending_deletion'
                        ? 'pending_deletion'
                        : res?.is_archived || res?.status === 'archived'
                          ? 'archived'
                          : 'active',
                )
            })
            .catch(() => undefined)
        return () => {
            mounted = false
        }
    }, [pid, reload])

    const isArchived = projectStatus === 'archived'
    const isPendingDeletion = projectStatus === 'pending_deletion'
    const mutationsLocked = isArchived || isPendingDeletion
    const canMutate = canManage && !mutationsLocked

    const projectName = useMemo(
        () => members.find((m) => m.role === 'owner')?.name,
        [members],
    )

    const handleChangeRole = async (member: ProjectMember, role: ProjectRole) => {
        if (!pid || role === member.role) return
        setBusyUserId(member.id)
        const prev = members
        // ST-29 optimistic + rollback.
        setMembers((cur) => cur.map((m) => (m.id === member.id ? { ...m, role } : m)))
        try {
            await apiUpdateProjectMemberRole(pid, member.id, role)
            notify('Роль участника обновлена', 'success')
        } catch (err) {
            setMembers(prev)
            notify(memberErrorMessage(err, 'Не удалось изменить роль'), 'danger')
        } finally {
            setBusyUserId(null)
        }
    }

    const handleRemove = async () => {
        if (!pid || !removeTarget) return
        setActing(true)
        setActionError(null)
        try {
            await apiRemoveProjectMember(pid, removeTarget.id, {
                reassignToUserId: reassignToUserId || undefined,
            })
            setMembers((cur) => cur.filter((m) => m.id !== removeTarget.id))
            setRemoveTarget(null)
            setRemoveOwnedCount(0)
            setRemovePreviewFailed(false)
            setReassignToUserId('')
            notify('Участник удалён из проекта', 'success')
        } catch (err) {
            setActionError(memberErrorMessage(err, 'Не удалось удалить участника'))
        } finally {
            setActing(false)
        }
    }

    const openRemoveDialog = async (member: ProjectMember) => {
        setRemoveTarget(member)
        setReassignToUserId('')
        setActionError(null)
        setRemovePreviewFailed(false)
        if (!pid) {
            setRemoveOwnedCount(0)
            return
        }
        try {
            const preview = await apiPreviewRemoveProjectMember(pid, member.id)
            setRemoveOwnedCount(preview?.ownedCount ?? 0)
        } catch {
            setRemoveOwnedCount(0)
            setRemovePreviewFailed(true)
            setActionError(
                'Не удалось проверить записи участника. Удаление заблокировано, пока проверка недоступна.',
            )
        }
    }

    const handleTransfer = async () => {
        if (!pid || !transferTarget) return
        setActing(true)
        setActionError(null)
        try {
            await apiTransferProjectOwnership(pid, transferTarget.id, confirmName)
            setTransferTarget(null)
            setConfirmName('')
            notify('Права владельца переданы', 'success')
            triggerReload()
        } catch (err) {
            setActionError(memberErrorMessage(err, 'Не удалось передать права владельца'))
        } finally {
            setActing(false)
        }
    }

    const columns: ColumnDef<ProjectMember>[] = useMemo(
        () => [
            {
                header: 'Участник',
                accessorKey: 'name',
                cell: ({ row }) => {
                    const member = row.original
                    // T-010: ФИО→email→UUID (BE может отдать name=UUID/login).
                    const display = personDisplayName({
                        name: member.name,
                        email: member.email,
                        id: member.id,
                    })
                    return (
                        <div className="flex items-center gap-3">
                            <Avatar
                                size="sm"
                                className="bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400"
                            >
                                {getInitials(display)}
                            </Avatar>
                            <div>
                                <div className="font-medium">{display}</div>
                                {member.email && member.email !== display && (
                                    <div className="text-sm text-gray-500">
                                        {member.email}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                },
            },
            {
                header: 'Роль',
                accessorKey: 'role',
                cell: ({ row }) => {
                    const member = row.original
                    if (member.role === 'owner' || !canMutate) {
                        const info = roleLabels[member.role]
                        return (
                            <Tag
                                {...(member.role === 'owner'
                                    ? qa('host.projectMembers.ownerRole', {
                                          member: member.id,
                                      })
                                    : {})}
                                className={info?.className}
                            >
                                {info?.label ?? member.role}
                            </Tag>
                        )
                    }
                    return (
                        <div className="w-44" {...qa('host.projectMembers.roleSelect', { member: member.id })}>
                            <Select
                                {...qa('host.projectMembers.roleSelect', {
                                    member: member.id,
                                })}
                                size="sm"
                                isDisabled={busyUserId === member.id}
                                value={assignableRoleOptions.find((o) => o.value === member.role)}
                                options={assignableRoleOptions}
                                onChange={(opt) =>
                                    opt && handleChangeRole(member, opt.value as ProjectRole)
                                }
                            />
                        </div>
                    )
                },
            },
            {
                header: 'Источник доступа',
                accessorKey: 'source',
                cell: ({ row }) => {
                    // BX-HIER: показываем не только откуда доступ, но и через какой
                    // отдел он выдан (иерархия/доступ явно виден на строке участника).
                    const member = row.original
                    return (
                        <div className="text-gray-600 dark:text-gray-400">
                            <div>{sourceLabel(member.source)}</div>
                            {member.department && (
                                <div className="text-xs text-gray-500">
                                    Отдел: {member.department}
                                </div>
                            )}
                        </div>
                    )
                },
            },
            {
                header: 'Действия',
                id: 'actions',
                cell: ({ row }) => {
                    const member = row.original
                    if (member.role === 'owner' || !canMutate) return null
                    return (
                        <div className="flex items-center gap-1">
                            {TRANSFER_ENABLED && (
                                <button
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-amber-500"
                                    disabled={busyUserId === member.id}
                                    title="Передать права владельца"
                                    onClick={() => {
                                        setActionError(null)
                                        setConfirmName('')
                                        setTransferTarget(member)
                                    }}
                                >
                                    <PiCrownDuotone className="w-4 h-4" />
                                </button>
                            )}
                            <button
                                {...qa('host.projectMembers.remove', {
                                    member: member.id,
                                })}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-red-500"
                                disabled={busyUserId === member.id}
                                title="Удалить из проекта"
                                aria-label="Удалить из проекта"
                                {...qa('host.projectMembers.remove', { member: member.id })}
                                onClick={() => {
                                    setActionError(null)
                                    openRemoveDialog(member)
                                }}
                            >
                                <PiTrashDuotone className="w-4 h-4" />
                            </button>
                        </div>
                    )
                },
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [canMutate, busyUserId, members],
    )

    // ST-19 — проект не выбран.
    if (!pid) {
        return (
            <Container>
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">
                        Проект не выбран. Выберите проект в шапке, чтобы управлять участниками.
                    </p>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <AdaptiveCard {...qa('host.projectMembers.root')}>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-semibold">Участники проекта</h3>
                        {canMutate && (
                            <Button
                                {...qa('host.projectMembers.invite')}
                                variant="solid"
                                color="primary"
                                size="sm"
                                icon={<PiPlusBold />}
                                {...qa('host.projectMembers.invite')}
                                onClick={() => navigate(`/p/${pid}/members/invite`)}
                            >
                                Пригласить
                            </Button>
                        )}
                    </div>

                    {/* ST-22 — archived / pending-deletion read-only banner. */}
                    {mutationsLocked && (
                        <Alert showIcon type={isPendingDeletion ? 'danger' : 'warning'}>
                            {isPendingDeletion
                                ? 'Проект помечен на удаление — управление участниками недоступно.'
                                : 'Проект в архиве — управление участниками недоступно. Разархивируйте проект, чтобы вносить изменения.'}
                        </Alert>
                    )}

                    {/* ST-11 — member без manage: read-only список. */}
                    {!canManage && !loading && !loadError && (
                        <Alert showIcon type="info">
                            У вас нет прав на управление участниками — список доступен только
                            для просмотра.
                        </Alert>
                    )}

                    {/* ST-6 — ошибка загрузки + retry. */}
                    {loadError && (
                        <Alert {...qa('host.projectMembers.loadError')} showIcon type="danger">
                            <div className="flex items-center justify-between gap-3">
                                <span>{loadError}</span>
                                <Button
                                    {...qa('host.projectMembers.retry')}
                                    size="xs"
                                    variant="solid"
                                    onClick={triggerReload}
                                >
                                    Повторить
                                </Button>
                            </div>
                        </Alert>
                    )}

                    {/* ST-1 — skeleton. */}
                    {loading && !loadError ? (
                        <div className="space-y-3">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <Skeleton variant="circle" width={36} height={36} />
                                    <Skeleton height={16} width="40%" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        !loadError && (
                            <DataTable
                                {...qa('host.projectMembers.table')}
                                columns={columns}
                                data={members}
                                qaIdPrefix="host.projectMembers"
                                noData={members.length === 0}
                                pagingData={{
                                    total: members.length,
                                    pageIndex: 1,
                                    pageSize: Math.max(members.length, 10),
                                }}
                            />
                        )
                    )}

                    {/* ST-3 — пусто (только владелец). */}
                    {!loading && !loadError && members.length <= 1 && (
                        <div
                            {...qa('host.projectMembers.empty')}
                            className="text-sm text-gray-500"
                        >
                            {members.length === 0
                                ? 'Список участников пуст.'
                                : 'Пока вы единственный участник проекта.'}
                            {canMutate && (
                                <>
                                    {' '}
                                    <button
                                        {...qa('host.projectMembers.inviteLink')}
                                        className="text-blue-600 hover:underline"
                                        {...qa('host.projectMembers.inviteHint')}
                                        onClick={() => navigate(`/p/${pid}/members/invite`)}
                                    >
                                        Пригласить участника
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </AdaptiveCard>

            {/* ST-26 — remove confirm. */}
            <ConfirmDialog
                {...qa('host.projectMembers.removeDialog')}
                isOpen={removeTarget !== null}
                type="danger"
                title="Удалить участника?"
                confirmButtonProps={{
                    ...qa('host.projectMembers.removeConfirm'),
                    loading: acting,
                    disabled:
                        removePreviewFailed ||
                        (removeOwnedCount > 0 && !reassignToUserId),
                }}
                cancelButtonProps={{
                    ...qa('host.projectMembers.removeCancel'),
                }}
                confirmText="Удалить"
                cancelText="Отмена"
                onClose={() => {
                    setRemoveTarget(null)
                    setRemoveOwnedCount(0)
                    setRemovePreviewFailed(false)
                    setReassignToUserId('')
                    setActionError(null)
                }}
                onRequestClose={() => {
                    setRemoveTarget(null)
                    setRemoveOwnedCount(0)
                    setRemovePreviewFailed(false)
                    setReassignToUserId('')
                    setActionError(null)
                }}
                onCancel={() => {
                    setRemoveTarget(null)
                    setRemoveOwnedCount(0)
                    setRemovePreviewFailed(false)
                    setReassignToUserId('')
                    setActionError(null)
                }}
                onConfirm={handleRemove}
            >
                <p>
                    Участник «{removeTarget?.name || removeTarget?.email}» будет удалён из
                    проекта и потеряет доступ к его данным.
                </p>
                {removeOwnedCount > 0 && (
                    <div className="mt-3 space-y-2">
                        <Alert showIcon type="warning">
                            У участника {removeOwnedCount} записей во владении. Выберите, кому
                            передать их перед удалением.
                        </Alert>
                        <div {...qa('host.projectMembers.reassignSelect')}>
                            <Select<{ value: string; label: string }>
                                {...qa('host.projectMembers.reassignSelect')}
                                placeholder="Новый ответственный"
                                options={members
                                    .filter((m) => m.id !== removeTarget?.id)
                                    .map((m) => ({
                                        value: m.id,
                                        label: m.name?.trim()
                                            ? `${m.name} (${m.email})`
                                            : m.email || m.id,
                                    }))}
                                value={
                                    members
                                        .filter((m) => m.id === reassignToUserId)
                                        .map((m) => ({
                                            value: m.id,
                                            label: m.name || m.email || m.id,
                                        }))[0] ?? null
                                }
                                onChange={(opt) => setReassignToUserId(opt?.value ?? '')}
                            />
                        </div>
                    </div>
                )}
                {actionError && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{actionError}</p>
                )}
            </ConfirmDialog>

            {/* ST-26 — transfer ownership confirm (gated by TRANSFER_ENABLED). */}
            <ConfirmDialog
                isOpen={transferTarget !== null}
                type="warning"
                title="Передать права владельца?"
                confirmButtonProps={{
                    loading: acting,
                    disabled: Boolean(projectName) && confirmName !== projectName,
                }}
                confirmText="Передать"
                cancelText="Отмена"
                onClose={() => {
                    setTransferTarget(null)
                    setConfirmName('')
                    setActionError(null)
                }}
                onRequestClose={() => {
                    setTransferTarget(null)
                    setConfirmName('')
                    setActionError(null)
                }}
                onCancel={() => {
                    setTransferTarget(null)
                    setConfirmName('')
                    setActionError(null)
                }}
                onConfirm={handleTransfer}
            >
                <p className="mb-3">
                    «{transferTarget?.name || transferTarget?.email}» станет владельцем проекта,
                    а вы — администратором. Действие необратимо. Для подтверждения введите
                    название проекта.
                </p>
                <Input
                    placeholder={projectName}
                    value={confirmName}
                    onChange={(e) => setConfirmName(e.target.value)}
                />
                {actionError && (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-400">{actionError}</p>
                )}
            </ConfirmDialog>
        </Container>
    )
}

export default ProjectMembers
