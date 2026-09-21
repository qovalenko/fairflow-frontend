import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    PiPlusDuotone,
    PiEnvelopeSimpleDuotone,
    PiSignOutDuotone,
    PiCrownDuotone,
    PiXBold,
    PiArrowsClockwiseDuotone,
    PiQuestion,
} from 'react-icons/pi'
import SystemSettingsLayout from './SystemSettingsLayout'
import OffboardDrawer from './OffboardDrawer'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Spinner from '@/components/ui/Spinner'
import Drawer from '@/components/ui/Drawer'
import Tooltip from '@/components/ui/Tooltip'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import useOrgPermission from '@/utils/hooks/useOrgPermission'
import { personDisplayName, initialsFromName } from '@/utils/displayName'
import {
    apiGetEmployees,
    apiGetDepartments,
    apiAddEmployee,
    apiUpdateEmployee,
    apiTransferOrgOwnership,
    apiGetInvitations,
    apiCreateInvitation,
    apiRevokeInvitation,
    apiResendInvitation,
    type OrgEmployee,
    type OrgDepartment,
    type OrgInvitation,
} from '@/services/CrmService'
import { qa, qaWithAlias } from '@/shared/qa'

/** «?»-иконка с подсказкой при наведении (поля без подписей). */
const HelpIcon = ({ title }: { title: string }) => (
    <Tooltip title={title}>
        <span className="flex cursor-help text-gray-400 hover:text-gray-200">
            <PiQuestion className="text-lg" />
        </span>
    </Tooltip>
)

const roleLabels: Record<string, string> = {
    platform_owner: 'Владелец',
    platform_admin: 'Администратор',
    employee: 'Сотрудник',
}

const roleTagColors: Record<string, string> = {
    platform_owner: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    platform_admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    employee: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
}

// T-010: единая цепочка ФИО→email→UUID (BE может вернуть name=login/UUID).
const empDisplayName = (emp: OrgEmployee) =>
    personDisplayName({ name: emp.name, email: emp.email, id: emp.userId })

/** Просроченный pending-инвайт читается как «истекло». */
const inviteStatus = (inv: OrgInvitation): string => {
    if (inv.status === 'pending' && inv.expiresAt) {
        const exp = new Date(inv.expiresAt).getTime()
        if (Number.isFinite(exp) && exp < Date.now()) return 'expired'
    }
    return inv.status
}

// BX-EMP1: единый экран «Сотрудники» = активные участники + приглашённые.
// Строка списка — либо действующий сотрудник, либо приглашение (ещё не принято).
type Row =
    | { kind: 'employee'; emp: OrgEmployee }
    | { kind: 'invitation'; inv: OrgInvitation }

const Employees = () => {
    const { system, systemId, isSystemOwner } = useWorkspaceRole()
    const orgId = systemId
    // FR-MORG-34 / P8-T4.3: мутации сотрудников гейтятся `employees:write|delete`
    // и приглашений `invitations:write|revoke|resend` от РЕАЛЬНОЙ орг-проекции
    // бэка. Fail-closed при загрузке проекции (deny до ответа PDP).
    const canOrg = useOrgPermission()
    const canManage = canOrg('employees', 'write')
    const canRemoveEmp = canOrg('employees', 'delete')
    const canInvite = canOrg('invitations', 'write')
    const canRevokeInv = canOrg('invitations', 'revoke')
    const canResendInv = canOrg('invitations', 'resend')

    const [employees, setEmployees] = useState<OrgEmployee[]>([])
    const [invitations, setInvitations] = useState<OrgInvitation[]>([])
    const [departments, setDepartments] = useState<OrgDepartment[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [busyId, setBusyId] = useState<string | null>(null)

    // Добавить существующего пользователя по ID.
    const [addOpen, setAddOpen] = useState(false)
    const [newUserId, setNewUserId] = useState('')
    const [newRole, setNewRole] = useState('employee')
    const [newDept, setNewDept] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    // Пригласить по email.
    const [inviteOpen, setInviteOpen] = useState(false)
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteRole, setInviteRole] = useState('employee')
    const [inviteDept, setInviteDept] = useState('')
    const [isInviting, setIsInviting] = useState(false)
    const [inviteError, setInviteError] = useState<string | null>(null)

    // SCR-MORG-EMPLOYEE-OFFBOARD — мастер увольнения вместо жёсткого DELETE.
    const [offboardEmp, setOffboardEmp] = useState<OrgEmployee | null>(null)
    // «Передать владельца» — только текущий владелец, подтверждение по имени орг.
    const [transferTarget, setTransferTarget] = useState<OrgEmployee | null>(null)
    const [transferConfirm, setTransferConfirm] = useState('')
    const [isTransferring, setIsTransferring] = useState(false)
    const orgName = system?.name ?? ''

    const load = useCallback(async () => {
        if (!orgId) return
        setIsLoading(true)
        setError(null)
        try {
            const [emps, invs, depts] = await Promise.all([
                apiGetEmployees(),
                apiGetInvitations(),
                apiGetDepartments(),
            ])
            setEmployees(Array.isArray(emps) ? emps : [])
            setInvitations(Array.isArray(invs) ? invs : [])
            setDepartments(Array.isArray(depts) ? depts : [])
        } catch (e) {
            console.error('Load employees failed:', e)
            setError('Не удалось загрузить сотрудников.')
        } finally {
            setIsLoading(false)
        }
    }, [orgId])

    useEffect(() => {
        load()
    }, [load])

    const deptName = useCallback(
        (id: string | null) => departments.find((d) => d.id === id)?.name ?? '—',
        [departments],
    )

    const deptOptions = useMemo(
        () => [
            { value: '', label: 'Без отдела' },
            ...departments.map((d) => ({ value: d.id, label: d.name })),
        ],
        [departments],
    )

    const roleOptions = [
        { value: 'employee', label: roleLabels.employee },
        { value: 'platform_admin', label: roleLabels.platform_admin },
    ]

    // Единый список: сначала действующие сотрудники, затем незакрытые
    // приглашения (принятые уже присутствуют как сотрудники — не дублируем).
    const pendingInvites = useMemo(
        () => invitations.filter((inv) => inviteStatus(inv) !== 'accepted'),
        [invitations],
    )

    const rows = useMemo<Row[]>(
        () => [
            ...employees.map((emp) => ({ kind: 'employee' as const, emp })),
            ...pendingInvites.map((inv) => ({ kind: 'invitation' as const, inv })),
        ],
        [employees, pendingInvites],
    )

    const filtered = rows.filter((row) => {
        if (!search) return true
        const q = search.toLowerCase()
        if (row.kind === 'employee') {
            return (
                row.emp.name.toLowerCase().includes(q) ||
                row.emp.email.toLowerCase().includes(q)
            )
        }
        return row.inv.email.toLowerCase().includes(q)
    })

    const pendingCount = pendingInvites.filter(
        (inv) => inviteStatus(inv) === 'pending',
    ).length

    const handleAdd = async () => {
        if (!orgId || !newUserId.trim()) return
        setIsSaving(true)
        setSaveError(null)
        try {
            await apiAddEmployee({
                userId: newUserId.trim(),
                role: newRole,
                departmentId: newDept || undefined,
            })
            setAddOpen(false)
            setNewUserId('')
            setNewRole('employee')
            setNewDept('')
            await load()
        } catch (e) {
            console.error('Add employee failed:', e)
            setSaveError('Не удалось добавить сотрудника. Проверьте ID пользователя.')
        } finally {
            setIsSaving(false)
        }
    }

    const copyInviteLink = async (inviteUrl: string | undefined, email: string) => {
        if (!inviteUrl) {
            toast.push(
                <Notification title="Ссылка недоступна" type="warning">
                    Повторно отправьте приглашение, чтобы получить новую ссылку.
                </Notification>,
            )
            return
        }
        try {
            await navigator.clipboard.writeText(inviteUrl)
            toast.push(
                <Notification title="Ссылка скопирована" type="success">
                    Ссылка-приглашение для {email} в буфере обмена.
                </Notification>,
            )
        } catch (e) {
            console.error('Copy invite link failed:', e)
            toast.push(
                <Notification title="Не удалось скопировать" type="danger">
                    Скопируйте ссылку вручную: {inviteUrl}
                </Notification>,
            )
        }
    }

    const handleInvite = async () => {
        if (!orgId || !inviteEmail.trim()) return
        setIsInviting(true)
        setInviteError(null)
        try {
            const created = await apiCreateInvitation({
                email: inviteEmail.trim(),
                role: inviteRole,
                departmentId: inviteDept || undefined,
            })
            setInviteOpen(false)
            setInviteEmail('')
            setInviteRole('employee')
            setInviteDept('')
            await load()
            toast.push(
                <Notification title="Приглашение создано" type="success">
                    {created.emailSent === false
                        ? 'Письмо не отправлено — скопируйте ссылку вручную.'
                        : 'Письмо отправлено. Ссылку можно скопировать ещё раз.'}
                </Notification>,
            )
            if (created.inviteUrl) {
                await copyInviteLink(created.inviteUrl, created.email)
            }
        } catch (e) {
            console.error('Create invitation failed:', e)
            setInviteError('Не удалось отправить приглашение. Проверьте email.')
        } finally {
            setIsInviting(false)
        }
    }

    // ST-7: единый разбор кодов ошибок мутаций сотрудника (Д-7, дефект #14).
    // cannot_remove_owner / already_member (409), seat_limit_reached (402).
    const showMutationError = (e: unknown, fallback: string) => {
        console.error(fallback, e)
        const status = (e as { response?: { status?: number } })?.response?.status
        let msg = fallback
        if (status === 402) {
            msg = 'Достигнут лимит лицензий (seats) — освободите место или докупите.'
        } else if (status === 409) {
            msg = 'Конфликт: владельца нельзя удалить/изменить, либо сотрудник уже состоит в организации.'
        }
        toast.push(
            <Notification title="Не удалось выполнить" type="danger">
                {msg}
            </Notification>,
        )
    }

    const handleRoleChange = async (emp: OrgEmployee, role: string) => {
        if (!orgId || role === emp.role) return
        try {
            await apiUpdateEmployee(emp.userId, { role })
            await load()
        } catch (e) {
            showMutationError(e, 'Не удалось сменить роль сотрудника.')
            await load() // откат оптимистичного значения Select
        }
    }

    const handleDeptChange = async (emp: OrgEmployee, departmentId: string) => {
        if (!orgId) return
        try {
            await apiUpdateEmployee(emp.userId, { departmentId: departmentId || null })
            await load()
        } catch (e) {
            showMutationError(e, 'Не удалось сменить отдел сотрудника.')
            await load()
        }
    }

    // EL-EMP-6: увольнение через мастер OFFBOARD (каскад §3.4), не жёсткий DELETE.
    const handleOffboard = (emp: OrgEmployee) => {
        if (!orgId) return
        setOffboardEmp(emp)
    }

    const handleRevoke = async (inv: OrgInvitation) => {
        if (!orgId) return
        setBusyId(inv.id)
        try {
            await apiRevokeInvitation(inv.id)
            toast.push(
                <Notification title="Приглашение отозвано" type="success">
                    Приглашение для {inv.email} отозвано.
                </Notification>,
            )
            await load()
        } catch (e) {
            console.error('Revoke invitation failed:', e)
            toast.push(
                <Notification title="Не удалось отозвать" type="danger">
                    Попробуйте обновить страницу и повторить.
                </Notification>,
            )
        } finally {
            setBusyId(null)
        }
    }

    const handleResend = async (inv: OrgInvitation) => {
        if (!orgId) return
        setBusyId(inv.id)
        try {
            const resent = await apiResendInvitation(inv.id)
            toast.push(
                <Notification title="Приглашение отправлено" type="success">
                    Повторно отправлено на {inv.email}.
                </Notification>,
            )
            if (resent.inviteUrl) {
                await copyInviteLink(resent.inviteUrl, inv.email)
            }
            await load()
        } catch (e) {
            console.error('Resend invitation failed:', e)
            toast.push(
                <Notification title="Не удалось отправить" type="danger">
                    Попробуйте позже.
                </Notification>,
            )
        } finally {
            setBusyId(null)
        }
    }

    const openTransfer = (emp: OrgEmployee) => {
        setTransferConfirm('')
        setTransferTarget(emp)
    }

    const closeTransfer = () => {
        setTransferTarget(null)
        setTransferConfirm('')
    }

    // Передать владельца: атомарный обмен ролями на бэке (новый→владелец,
    // текущий→администратор). Подтверждение вводом имени организации.
    const handleTransfer = async () => {
        if (!orgId || !transferTarget) return
        setIsTransferring(true)
        try {
            await apiTransferOrgOwnership(transferTarget.userId)
            closeTransfer()
            toast.push(
                <Notification title="Владелец передан" type="success">
                    {`«${empDisplayName(transferTarget)}» теперь владелец организации. Вы стали администратором — войдите заново, чтобы обновить права.`}
                </Notification>,
            )
            await load()
        } catch (e) {
            showMutationError(e, 'Не удалось передать владельца.')
        } finally {
            setIsTransferring(false)
        }
    }

    /** Статус-тег строки: активный сотрудник или состояние приглашения. */
    const statusTag = (status: 'active' | string) => {
        switch (status) {
            case 'active':
                return (
                    <Tag className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                        Активен
                    </Tag>
                )
            case 'pending':
                return (
                    <Tag className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                        Приглашён
                    </Tag>
                )
            case 'expired':
                return (
                    <Tag className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                        Истекло
                    </Tag>
                )
            case 'revoked':
                return (
                    <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        Отозвано
                    </Tag>
                )
            default:
                return <Tag>{status}</Tag>
        }
    }

    const renderEmployee = (emp: OrgEmployee) => {
        const isOwner = emp.role === 'platform_owner'
        return (
            <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
                {canManage && !isOwner ? (
                    <>
                        <div className="w-full md:w-44">
                            <Select
                                size="sm"
                                value={deptOptions.find(
                                    (o) => o.value === (emp.departmentId ?? ''),
                                )}
                                options={deptOptions}
                                onChange={(opt) =>
                                    handleDeptChange(emp, opt?.value ?? '')
                                }
                                {...qa('host.settings.employees.deptSelect', { user: emp.userId })}
                            />
                        </div>
                        <div className="w-full md:w-40">
                            <Select
                                size="sm"
                                value={roleOptions.find((o) => o.value === emp.role)}
                                options={roleOptions}
                                onChange={(opt) =>
                                    handleRoleChange(emp, opt?.value ?? 'employee')
                                }
                                {...qa('host.settings.employees.roleSelect', { user: emp.userId })}
                            />
                        </div>
                        {statusTag('active')}
                        {isSystemOwner && (
                            <button
                                type="button"
                                className="p-2 rounded text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                title="Передать владельца"
                                onClick={() => openTransfer(emp)}
                                {...qa('host.settings.employees.transferOwnership', { user: emp.userId })}
                            >
                                <PiCrownDuotone className="w-5 h-5" />
                            </button>
                        )}
                        {canRemoveEmp && (
                            <button
                                type="button"
                                className="p-2 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                title="Уволить (мастер)"
                                onClick={() => handleOffboard(emp)}
                                {...qa('host.settings.employees.offboard', { user: emp.userId })}
                            >
                                <PiSignOutDuotone className="w-5 h-5" />
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <span className="text-sm text-gray-500">
                            {deptName(emp.departmentId)}
                        </span>
                        <Tag className={roleTagColors[emp.role] ?? roleTagColors.employee}>
                            {roleLabels[emp.role] ?? emp.role}
                        </Tag>
                        {statusTag('active')}
                    </>
                )}
            </div>
        )
    }

    const renderInvitation = (inv: OrgInvitation) => {
        const status = inviteStatus(inv)
        const isBusy = busyId === inv.id
        return (
            <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
                <span className="text-sm text-gray-500">
                    {deptName(inv.departmentId)}
                </span>
                <Tag className={roleTagColors[inv.role] ?? roleTagColors.employee}>
                    {roleLabels[inv.role] ?? inv.role}
                </Tag>
                {statusTag(status)}
                {status === 'pending' && canRevokeInv && (
                    <button
                        type="button"
                        disabled={isBusy}
                        className="p-2 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                        title="Отозвать приглашение"
                        onClick={() => handleRevoke(inv)}
                        {...qa('host.settings.employees.revokeInvite', { invite: inv.id })}
                    >
                        <PiXBold className="w-4 h-4" />
                    </button>
                )}
                {(status === 'expired' || status === 'revoked') && canResendInv && (
                    <button
                        type="button"
                        disabled={isBusy}
                        className="p-2 rounded text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                        title="Отправить повторно"
                        onClick={() => handleResend(inv)}
                        {...qa('host.settings.employees.resendInvite', { invite: inv.id })}
                    >
                        <PiArrowsClockwiseDuotone className="w-4 h-4" />
                    </button>
                )}
            </div>
        )
    }

    return (
        <SystemSettingsLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-bold">Сотрудники</h2>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                            {employees.length}{' '}
                            {employees.length === 1 ? 'сотрудник' : 'сотрудников'}
                            {pendingCount > 0 && ` · ${pendingCount} приглашённых`}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {canInvite && (
                            <Button
                                variant="default"
                                icon={<PiEnvelopeSimpleDuotone />}
                                onClick={() => setInviteOpen(true)}
                                {...qa('host.settings.employees.inviteOpen')}
                            >
                                Пригласить
                            </Button>
                        )}
                        {canManage && (
                            <Button
                                variant="solid"
                                color="primary"
                                icon={<PiPlusDuotone />}
                                onClick={() => setAddOpen(true)}
                                {...qa('host.settings.employees.addOpen')}
                            >
                                Добавить
                            </Button>
                        )}
                    </div>
                </div>

                <AdaptiveCard>
                    <div className="mb-4">
                        <Input
                            placeholder="Поиск по имени или email..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            {...qa('host.settings.employees.search')}
                        />
                    </div>

                    {isLoading && (
                        <div className="flex justify-center py-12">
                            <Spinner size={40} />
                        </div>
                    )}
                    {error && !isLoading && (
                        <p className="text-sm text-red-600 dark:text-red-400 py-4">{error}</p>
                    )}
                    {/* ST-3 Empty vs ST-4 Empty-filter (дефект #12 — разделены) */}
                    {!isLoading && !error && filtered.length === 0 && (
                        <div className="py-8 text-center">
                            {rows.length === 0 ? (
                                <p className="text-sm text-gray-500">
                                    Сотрудников и приглашений пока нет.
                                </p>
                            ) : (
                                <>
                                    <p className="text-sm text-gray-500">
                                        По запросу «{search}» ничего не найдено.
                                    </p>
                                    <Button
                                        className="mt-3"
                                        variant="plain"
                                        size="sm"
                                        onClick={() => setSearch('')}
                                    >
                                        Сбросить поиск
                                    </Button>
                                </>
                            )}
                        </div>
                    )}

                    {!isLoading && filtered.length > 0 && (
                        <div className="space-y-2">
                            {filtered.map((row) => {
                                const key =
                                    row.kind === 'employee'
                                        ? `emp:${row.emp.id}`
                                        : `inv:${row.inv.id}`
                                const name =
                                    row.kind === 'employee'
                                        ? empDisplayName(row.emp)
                                        : row.inv.email
                                const secondary =
                                    row.kind === 'employee' &&
                                    row.emp.email &&
                                    row.emp.email !== name
                                        ? row.emp.email
                                        : null
                                return (
                                    <div
                                        key={key}
                                        className="flex flex-col md:flex-row md:items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                                        {...qaWithAlias(
                                            row.kind === 'employee'
                                                ? 'host.settings.employees.row'
                                                : 'host.settings.employees.inviteRow',
                                            'host.employees.row',
                                        )}
                                        {...qa(
                                            row.kind === 'employee'
                                                ? 'host.settings.employees.row'
                                                : 'host.settings.employees.inviteRow',
                                            row.kind === 'employee'
                                                ? { user: row.emp.userId, id: row.emp.id }
                                                : { invite: row.inv.id, id: row.inv.id },
                                        )}
                                    >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                                                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                                    {initialsFromName(name)}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-medium truncate">
                                                    {name}
                                                </div>
                                                {secondary && (
                                                    <div className="text-sm text-gray-500 truncate">
                                                        {secondary}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {row.kind === 'employee'
                                            ? renderEmployee(row.emp)
                                            : renderInvitation(row.inv)}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </AdaptiveCard>

                {/* Добавить существующего пользователя платформы по ID */}
                <Drawer
                    isOpen={addOpen}
                    title="Добавить сотрудника"
                    onClose={() => setAddOpen(false)}
                >
                    <div className="space-y-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Добавление существующего пользователя платформы по его ID.
                            Чтобы пригласить нового человека по email — используйте кнопку
                            «Пригласить».
                        </p>
                        <div>
                            <Input
                                value={newUserId}
                                placeholder="ID пользователя"
                                suffix={<HelpIcon title="ID пользователя платформы (обязательно)" />}
                                onChange={(e) => setNewUserId(e.target.value)}
                                {...qa('host.settings.employees.addUserId')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Отдел</label>
                            <Select
                                value={deptOptions.find((o) => o.value === newDept)}
                                options={deptOptions}
                                onChange={(opt) => setNewDept(opt?.value ?? '')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Системная роль
                            </label>
                            <Select
                                value={roleOptions.find((o) => o.value === newRole)}
                                options={roleOptions}
                                onChange={(opt) => setNewRole(opt?.value ?? 'employee')}
                            />
                        </div>
                        {saveError && (
                            <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
                        )}
                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="plain" onClick={() => setAddOpen(false)}>
                                Отмена
                            </Button>
                            <Button
                                variant="solid"
                                color="primary"
                                loading={isSaving}
                                onClick={handleAdd}
                                {...qa('host.settings.employees.addSubmit')}
                            >
                                Добавить
                            </Button>
                        </div>
                    </div>
                </Drawer>

                {/* Пригласить нового человека по email */}
                <Drawer
                    isOpen={inviteOpen}
                    title="Пригласить сотрудника"
                    onClose={() => setInviteOpen(false)}
                >
                    <div className="space-y-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            На указанный email придёт ссылка-приглашение. Если у человека ещё
                            нет аккаунта Fairflow, он создаст его при принятии приглашения.
                        </p>
                        <div>
                            <Input
                                type="email"
                                value={inviteEmail}
                                placeholder="name@company.ru"
                                suffix={<HelpIcon title="Email (обязательно)" />}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                {...qa('host.settings.employees.inviteEmail')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Отдел</label>
                            <Select
                                value={deptOptions.find((o) => o.value === inviteDept)}
                                options={deptOptions}
                                onChange={(opt) => setInviteDept(opt?.value ?? '')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Системная роль
                            </label>
                            <Select
                                value={roleOptions.find((o) => o.value === inviteRole)}
                                options={roleOptions}
                                onChange={(opt) => setInviteRole(opt?.value ?? 'employee')}
                            />
                        </div>
                        {inviteError && (
                            <p className="text-sm text-red-600 dark:text-red-400">{inviteError}</p>
                        )}
                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="plain" onClick={() => setInviteOpen(false)}>
                                Отмена
                            </Button>
                            <Button
                                variant="solid"
                                color="primary"
                                loading={isInviting}
                                onClick={handleInvite}
                            >
                                Отправить приглашение
                            </Button>
                        </div>
                    </div>
                </Drawer>

                {/* Передать владельца — подтверждение вводом имени организации */}
                <ConfirmDialog
                    isOpen={transferTarget !== null}
                    type="warning"
                    title="Передать владельца?"
                    confirmText="Передать"
                    cancelText="Отмена"
                    confirmButtonProps={{
                        loading: isTransferring,
                        disabled: Boolean(orgName) && transferConfirm !== orgName,
                    }}
                    onClose={closeTransfer}
                    onRequestClose={closeTransfer}
                    onCancel={closeTransfer}
                    onConfirm={handleTransfer}
                >
                    <p className="mb-3">
                        «{transferTarget ? empDisplayName(transferTarget) : ''}» станет
                        владельцем организации, а вы — администратором. Действие необратимо.
                        Для подтверждения введите название организации.
                    </p>
                    <Input
                        placeholder={orgName}
                        value={transferConfirm}
                        suffix={<HelpIcon title={`Введите «${orgName}» для подтверждения`} />}
                        onChange={(e) => setTransferConfirm(e.target.value)}
                        {...qa('host.settings.employees.transferConfirm')}
                    />
                </ConfirmDialog>

                {/* SCR-MORG-EMPLOYEE-OFFBOARD */}
                <OffboardDrawer
                    isOpen={!!offboardEmp}
                    employee={offboardEmp}
                    onClose={() => setOffboardEmp(null)}
                    onDone={load}
                />
            </div>
        </SystemSettingsLayout>
    )
}

export default Employees
