import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Alert from '@/components/ui/Alert'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import {
    apiAddProjectMember,
    apiGetEmployees,
    apiGetProject,
    apiGetProjectMembers,
    type OrgEmployee,
    type ProjectMember,
    type ProjectRole,
} from '@/services/CrmService'
import { assignableRoleOptions, memberErrorMessage } from './memberHelpers'
import { qa } from '@/shared/qa'

const notify = (title: string, type: 'success' | 'danger') =>
    toast.push(<Notification title={title} type={type} />)

/**
 * SCR-PRJSET-MEMBER-INVITE — добавление в проект (FR-PSET-120 / FR-PROJ-250).
 * Сотрудник системы — `{ userId, role }`; незарегистрированный email —
 * `{ email, role }` → ProjectInvitation + страница /auth/project-invite/:token.
 */
const InviteMember = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const canManage = usePermission('project', 'manage')

    const [userId, setUserId] = useState('')
    const [email, setEmail] = useState('')
    const [role, setRole] = useState<ProjectRole>('member')
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [locked, setLocked] = useState(false)
    const [employees, setEmployees] = useState<OrgEmployee[]>([])
    const [members, setMembers] = useState<ProjectMember[]>([])
    const [loadingCatalog, setLoadingCatalog] = useState(false)

    const backToMembers = () => {
        if (pid) navigate(`/p/${pid}/members`)
    }

    useEffect(() => {
        if (!pid) return
        let mounted = true
        apiGetProject<{ is_archived?: boolean; status?: string }>(pid)
            .then((res) => {
                if (!mounted) return
                setLocked(
                    Boolean(res?.is_archived) ||
                        res?.status === 'archived' ||
                        res?.status === 'pending_deletion',
                )
            })
            .catch(() => undefined)
        return () => {
            mounted = false
        }
    }, [pid])

    useEffect(() => {
        if (!pid || !canManage) return
        let mounted = true
        setLoadingCatalog(true)
        Promise.all([apiGetEmployees(), apiGetProjectMembers<ProjectMember[]>(pid)])
            .then(([empList, memberList]) => {
                if (!mounted) return
                setEmployees(Array.isArray(empList) ? empList : [])
                setMembers(Array.isArray(memberList) ? memberList : [])
            })
            .catch(() => {
                if (mounted) {
                    setEmployees([])
                    setMembers([])
                }
            })
            .finally(() => mounted && setLoadingCatalog(false))
        return () => {
            mounted = false
        }
    }, [pid, canManage])

    const memberUserIds = useMemo(() => new Set(members.map((m) => m.id)), [members])

    const inviteeOptions = useMemo(
        () =>
            employees
                .filter((e) => e.isActive !== false && e.userId && !memberUserIds.has(e.userId))
                .map((e) => ({
                    value: e.userId,
                    label: e.name?.trim() ? `${e.name} (${e.email})` : e.email || e.userId,
                })),
        [employees, memberUserIds],
    )

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    const canSubmit = Boolean(userId) || emailValid

    const handleInvite = async () => {
        if (!pid || !canSubmit || sending || locked) return
        setSending(true)
        setError(null)
        try {
            const res = (await apiAddProjectMember(
                pid,
                userId ? { userId, role } : { email: email.trim(), role },
            )) as { invitationId?: string; inviteUrl?: string; emailSent?: boolean }
            if (res?.invitationId) {
                if (res.inviteUrl && res.emailSent === false) {
                    try {
                        await navigator.clipboard.writeText(res.inviteUrl)
                    } catch {
                        /* ignore */
                    }
                    notify('Приглашение создано, ссылка скопирована', 'success')
                } else {
                    notify('Приглашение отправлено на почту', 'success')
                }
            } else {
                notify('Участник добавлен в проект', 'success')
            }
            backToMembers()
        } catch (err) {
            setError(memberErrorMessage(err, 'Не удалось добавить участника'))
        } finally {
            setSending(false)
        }
    }

    if (!pid) {
        return (
            <Container>
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">Проект не выбран.</p>
                </AdaptiveCard>
            </Container>
        )
    }

    if (!canManage) {
        return (
            <Container>
                <div className="max-w-xl">
                    <AdaptiveCard>
                        <Alert showIcon type="info">
                            У вас нет прав добавлять участников в этот проект.
                        </Alert>
                        <div className="mt-4">
                            <Button variant="plain" onClick={backToMembers}>
                                К списку участников
                            </Button>
                        </div>
                    </AdaptiveCard>
                </div>
            </Container>
        )
    }

    return (
        <Container>
            <div className="max-w-xl">
                <AdaptiveCard {...qa('host.projectMembers.invite.root')}>
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold">Добавить в проект</h2>

                        {locked && (
                            <Alert
                                {...qa('host.projectMembers.invite.locked')}
                                showIcon
                                type="warning"
                            >
                                Проект в архиве или помечен на удаление — изменения
                                участников недоступны.
                            </Alert>
                        )}

                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Сотрудник
                            </label>
                            <div {...qa('host.projectMembers.inviteEmployeeSelect')}>
                                <Select<{ value: string; label: string }>
                                    {...qa('host.projectMembers.invite.employee')}
                                    placeholder={
                                        loadingCatalog
                                            ? 'Загрузка…'
                                            : inviteeOptions.length
                                              ? 'Выберите сотрудника'
                                              : 'Нет доступных сотрудников'
                                    }
                                    isLoading={loadingCatalog}
                                    isDisabled={locked}
                                    options={inviteeOptions}
                                    value={inviteeOptions.find((o) => o.value === userId) ?? null}
                                    onChange={(opt) => setUserId(opt?.value ?? '')}
                                />
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                                Список строится из сотрудников системы; уже добавленные
                                в проект скрыты. Либо пригласите нового человека по email.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">
                                Email (если человека ещё нет в системе)
                            </label>
                            <Input
                                {...qa('host.projectMembers.invite.email')}
                                type="email"
                                placeholder="name@example.com"
                                value={email}
                                disabled={locked || Boolean(userId)}
                                {...qa('host.projectMembers.inviteEmail')}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Роль</label>
                            <div {...qa('host.projectMembers.inviteRoleSelect')}>
                                <Select<{ value: ProjectRole; label: string }>
                                    {...qa('host.projectMembers.invite.role')}
                                    options={assignableRoleOptions}
                                    isDisabled={locked}
                                    value={
                                        assignableRoleOptions.find((o) => o.value === role) ?? null
                                    }
                                    onChange={(opt) => setRole(opt?.value ?? 'member')}
                                />
                            </div>
                        </div>

                        {error && (
                            <Alert {...qa('host.projectMembers.invite.error')} showIcon type="danger">
                                {error}
                            </Alert>
                        )}

                        <div className="flex justify-end gap-2 pt-4">
                            <Button
                                {...qa('host.projectMembers.invite.cancel')}
                                variant="plain"
                                onClick={backToMembers}
                            >
                                Отмена
                            </Button>
                            <Button
                                {...qa('host.projectMembers.invite.submit')}
                                variant="solid"
                                loading={sending}
                                disabled={locked || !canSubmit || loadingCatalog}
                                {...qa('host.projectMembers.inviteSubmit')}
                                onClick={handleInvite}
                            >
                                Добавить
                            </Button>
                        </div>
                    </div>
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default InviteMember
