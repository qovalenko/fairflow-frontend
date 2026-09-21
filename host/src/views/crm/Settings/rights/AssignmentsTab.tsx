import { useMemo, useState } from 'react'
import useSWR from 'swr'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import Segment from '@/components/ui/Segment'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import usePermission from '@/utils/hooks/usePermission'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import { notify } from '@/utils/notify'
import {
    PiUserPlusDuotone,
    PiQuestion,
    PiWarningDuotone,
    PiTrashDuotone,
    PiBuildingsDuotone,
} from 'react-icons/pi'
import {
    apiGetProjectRoles,
    apiGetRoleAssignments,
    apiGrantDepartmentRole,
    apiRevokeDepartmentRole,
} from '@/services/PermissionService'
import type {
    RoleAssignment,
    GranteeType,
} from '@/services/PermissionService'
import { apiGetDepartments, apiGetEmployees } from '@/services/CrmService'
import type { OrgDepartment, OrgEmployee } from '@/services/CrmService'
import type { AxiosError } from 'axios'
import { qa } from '@/shared/qa'

/**
 * SCR-PRJSET-ASSIGN — под-раздел «Назначения» раздела «Доступ» (BOX-ACCESS-UI-V2 §4).
 *
 * Мастер «Выдать доступ» (Drawer): кому (Человек | Отдел | Группа) → что (роль
 * целиком / отдельное право) → превью перед сохранением. В v1 АКТИВНА только ветка
 * `Отдел → роль` — единственный полностью готовый путь на box (BFF
 * `POST projects/:pid/departments/:deptId/roles`). Человек / Группа / отдельный
 * грант — задизейблены с честным тултипом «появится позже», чтобы не плодить 404 до
 * того, как соответствующие пути (`members/:userId/roles`,
 * `access-units/:unitId/roles`, `grants`) будут прошиты в UI следующей волной.
 *
 * Роль описывает, ЧТО человек умеет (subject:action); ОХВАТ записей («чьи видит»)
 * настраивается отдельно на «Обзоре» (visibility) — здесь эти оси намеренно не
 * смешиваются (§4). Экран целиком гейтится `project:manage` — родительский AccessTab
 * уже прячет вкладку без права; дублируем проверку тут (fail-closed).
 *
 * Список назначений (с тегом источника «через отдел …») читается через
 * `apiGetRoleAssignments` → `GET .../role-assignments` (FR-ACCESS-590).
 */

const GRANTEE_LABELS: Record<GranteeType, string> = {
    user: 'Человек',
    department: 'Отдел',
    unit: 'Группа',
}

function errCode(e: unknown): { status?: number; code?: string } {
    const ax = e as AxiosError<{ code?: string }>
    return {
        status: ax?.response?.status,
        code: ax?.response?.data?.code,
    }
}

const AssignmentsTab = ({ projectId }: { projectId?: string }) => {
    const canManage = usePermission('project', 'manage')
    const { systemId } = useWorkspaceRole()

    // ── data ────────────────────────────────────────────────────────────────────
    const {
        data: departments,
        error: deptError,
        isLoading: deptLoading,
        mutate: refetchDepartments,
    } = useSWR(
        systemId ? ['org/departments', systemId] : null,
        () => apiGetDepartments(),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const { data: roles } = useSWR(
        projectId ? ['project/roles', projectId] : null,
        () => apiGetProjectRoles(projectId!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // Only for the «(N чел.)» hint in the preview — best-effort, never blocks.
    const { data: employees } = useSWR(
        systemId ? ['org/employees', systemId] : null,
        () => apiGetEmployees(),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const {
        data: assignments,
        error: assignError,
        isLoading: assignLoading,
        mutate: refetchAssignments,
    } = useSWR(
        projectId ? ['project/role-assignments', projectId] : null,
        () => apiGetRoleAssignments(projectId!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // ── wizard state ──────────────────────────────────────────────────────────────
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [granteeType, setGranteeType] = useState<GranteeType>('department')
    const [whatKind, setWhatKind] = useState<'role' | 'grant'>('role')
    const [deptId, setDeptId] = useState('')
    const [roleId, setRoleId] = useState('')
    const [saving, setSaving] = useState(false)
    const [revoking, setRevoking] = useState<RoleAssignment | null>(null)
    const [busyRevoke, setBusyRevoke] = useState(false)

    const activeRoles = useMemo(
        () => (roles ?? []).filter((r) => !r.archived),
        [roles],
    )

    const deptById = useMemo(() => {
        const m = new Map<string, OrgDepartment>()
        for (const d of departments ?? []) m.set(d.id, d)
        return m
    }, [departments])

    const memberCount = useMemo(() => {
        if (!deptId) return undefined
        const list = employees as OrgEmployee[] | undefined
        if (!list) return undefined
        return list.filter(
            (e) => e.departmentId === deptId && e.isActive !== false,
        ).length
    }, [employees, deptId])

    const deptOptions = useMemo(
        () => (departments ?? []).map((d) => ({ value: d.id, label: d.name })),
        [departments],
    )
    const roleOptions = useMemo(
        () => activeRoles.map((r) => ({ value: r.id, label: r.name })),
        [activeRoles],
    )

    const selectedRole = activeRoles.find((r) => r.id === roleId)
    const selectedDept = deptById.get(deptId)

    // v1: only «Отдел → роль» is a real path; everything else is disabled.
    const branchReady = granteeType === 'department' && whatKind === 'role'
    const canSubmit = branchReady && !!deptId && !!roleId && !saving

    const previewText = useMemo(() => {
        if (!branchReady || !selectedDept || !selectedRole) return ''
        const count =
            typeof memberCount === 'number' ? ` (${memberCount} чел.)` : ''
        return `Отделу «${selectedDept.name}»${count} будет выдана роль «${selectedRole.name}».`
    }, [branchReady, selectedDept, selectedRole, memberCount])

    const openWizard = () => {
        setGranteeType('department')
        setWhatKind('role')
        setDeptId('')
        setRoleId('')
        setDrawerOpen(true)
    }

    const handleGrant = async () => {
        if (!projectId || !canSubmit) return
        setSaving(true)
        try {
            await apiGrantDepartmentRole(projectId, deptId, { roleId })
            notify('Роль выдана отделу', 'success')
            setDrawerOpen(false)
            await refetchAssignments()
        } catch (e) {
            const { code } = errCode(e)
            const msg =
                code === 'SELF_ESCALATION'
                    ? 'Нельзя выдать права шире собственных'
                    : code === 'ROLE_NOT_FOUND'
                      ? 'Роль не найдена — обновите список'
                      : 'Не удалось выдать роль'
            notify(msg, 'danger')
        } finally {
            setSaving(false)
        }
    }

    const handleRevoke = async () => {
        if (!projectId || !revoking) return
        // Only department assignments have a wired revoke path in v1.
        if (revoking.granteeType !== 'department') {
            setRevoking(null)
            return
        }
        setBusyRevoke(true)
        try {
            await apiRevokeDepartmentRole(
                projectId,
                revoking.granteeId,
                revoking.id,
            )
            notify('Назначение снято', 'success')
            setRevoking(null)
            await refetchAssignments()
        } catch {
            notify('Не удалось снять назначение', 'danger')
        } finally {
            setBusyRevoke(false)
        }
    }

    // ── gate ──────────────────────────────────────────────────────────────────────
    if (!canManage) {
        return (
            <p
                className="text-sm text-gray-500 py-8 text-center"
                {...qa('host.projectSettings.assignments.noManage')}
            >
                Назначать доступ может только тот, кто управляет проектом.
            </p>
        )
    }

    const rows: RoleAssignment[] = (assignments ?? []).map((a) => {
        const dept =
            a.granteeType === 'department'
                ? deptById.get(a.granteeId)
                : undefined
        const roleName =
            a.roleName ?? activeRoles.find((r) => r.id === a.roleId)?.name
        return {
            ...a,
            granteeName: a.granteeName ?? dept?.name,
            roleName,
            source:
                a.source ?? (dept ? `через отдел «${dept.name}»` : undefined),
        }
    })

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">Назначения</h3>
                    <Tooltip title="Кому выдать доступ: роль целиком или отдельное право — отделу, группе или человеку. Здесь видно, у кого какой доступ и откуда он взялся (например «через отдел Продажи»).">
                        <span className="flex cursor-help text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <PiQuestion className="text-lg" />
                        </span>
                    </Tooltip>
                </div>
                <Button
                    variant="solid"
                    size="sm"
                    icon={<PiUserPlusDuotone />}
                    disabled={!projectId}
                    onClick={openWizard}
                    {...qa('host.projectSettings.assignments.grant')}
                >
                    Выдать доступ
                </Button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Роль или отдельное право выдаётся отделу, группе или человеку.
                Роль описывает, что человек умеет; охват записей настраивается
                отдельно на «Обзоре». Перед сохранением всегда показывается превью
                — ничего не применяется молча.
            </p>

            {/* ── список назначений ─────────────────────────────────────────────── */}
            {assignLoading ? (
                <AdaptiveCard {...qa('host.projectSettings.assignments.loading')}>
                    <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
                        <Spinner /> Загрузка назначений…
                    </div>
                </AdaptiveCard>
            ) : assignError ? (
                <AdaptiveCard {...qa('host.projectSettings.assignments.error')}>
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                        <PiWarningDuotone className="h-8 w-8 text-red-500" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Не удалось загрузить назначения.
                        </p>
                        <Button
                            size="sm"
                            onClick={() => refetchAssignments()}
                            {...qa('host.projectSettings.assignments.retry')}
                        >
                            Повторить
                        </Button>
                    </div>
                </AdaptiveCard>
            ) : rows.length === 0 ? (
                <AdaptiveCard {...qa('host.projectSettings.assignments.empty')}>
                    <div className="flex flex-col items-center gap-3 py-10 text-center">
                        <PiUserPlusDuotone className="w-9 h-9 text-gray-400" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Назначений пока нет. Нажмите «Выдать доступ», чтобы дать
                            отделу роль.
                        </p>
                    </div>
                </AdaptiveCard>
            ) : (
                <AdaptiveCard {...qa('host.projectSettings.assignments.list')}>
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {rows.map((a) => (
                            <li
                                key={a.id}
                                className="flex items-center justify-between gap-3 py-3"
                                {...qa('host.projectSettings.assignments.row', {
                                    assignment: a.id,
                                })}
                            >
                                <div className="flex items-center gap-3">
                                    <PiBuildingsDuotone className="h-5 w-5 text-gray-400" />
                                    <div>
                                        <p className="text-sm font-medium">
                                            {a.granteeName ?? a.granteeId}
                                            <span className="text-gray-400">
                                                {' → '}
                                            </span>
                                            {a.roleName ?? a.roleId}
                                        </p>
                                        {a.source && (
                                            <Tag className="mt-1 bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                                                {a.source}
                                            </Tag>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    variant="plain"
                                    size="xs"
                                    icon={<PiTrashDuotone />}
                                    disabled={a.granteeType !== 'department'}
                                    onClick={() => setRevoking(a)}
                                    {...qa('host.projectSettings.assignments.revoke', {
                                        assignment: a.id,
                                    })}
                                >
                                    Снять
                                </Button>
                            </li>
                        ))}
                    </ul>
                </AdaptiveCard>
            )}

            {/* ── мастер «Выдать доступ» ─────────────────────────────────────────── */}
            <Drawer
                isOpen={drawerOpen}
                title="Выдать доступ"
                onClose={() => setDrawerOpen(false)}
                {...qa('host.projectSettings.assignments.drawer')}
            >
                <div className="space-y-6">
                    {/* Шаг 1 — Кому */}
                    <div>
                        <label className="mb-1 block text-sm font-medium">
                            Шаг 1 — Кому выдаём
                        </label>
                        <Segment
                            value={granteeType}
                            onChange={(val) => {
                                const v = Array.isArray(val) ? val[0] : val
                                if (v === 'department')
                                    setGranteeType('department')
                            }}
                            {...qa('host.projectSettings.assignments.granteeSegment')}
                        >
                            {(
                                ['department', 'user', 'unit'] as GranteeType[]
                            ).map((g) => (
                                <Segment.Item
                                    key={g}
                                    value={g}
                                    disabled={g !== 'department'}
                                    title={
                                        g !== 'department'
                                            ? 'Появится позже'
                                            : undefined
                                    }
                                    {...qa(
                                        'host.projectSettings.assignments.granteeSegment.item',
                                        { grantee: g },
                                    )}
                                >
                                    {GRANTEE_LABELS[g]}
                                </Segment.Item>
                            ))}
                        </Segment>
                        <p className="mt-1 text-xs text-gray-500">
                            Пока доступно назначение отделу. Человек и группа
                            появятся позже.
                        </p>

                        {deptLoading ? (
                            <div
                                className="mt-3 flex items-center gap-2 text-sm text-gray-400"
                                {...qa('host.projectSettings.assignments.deptLoading')}
                            >
                                <Spinner size={18} /> Загрузка отделов…
                            </div>
                        ) : deptError ? (
                            <div
                                className="mt-3 flex items-center gap-2 text-sm text-gray-500"
                                {...qa('host.projectSettings.assignments.deptError')}
                            >
                                Не удалось загрузить отделы.
                                <Button
                                    size="xs"
                                    onClick={() => refetchDepartments()}
                                    {...qa('host.projectSettings.assignments.deptRetry')}
                                >
                                    Повторить
                                </Button>
                            </div>
                        ) : deptOptions.length === 0 ? (
                            <p
                                className="mt-3 text-sm text-gray-500"
                                {...qa('host.projectSettings.assignments.deptEmpty')}
                            >
                                Отделов пока нет — создайте отдел в разделе
                                «Организация».
                            </p>
                        ) : (
                            <div className="mt-3">
                                <Select<{ value: string; label: string }>
                                    placeholder="Выберите отдел"
                                    value={
                                        deptOptions.find(
                                            (o) => o.value === deptId,
                                        ) ?? null
                                    }
                                    options={deptOptions}
                                    onChange={(o) => setDeptId(o?.value ?? '')}
                                    {...qa('host.projectSettings.assignments.deptSelect')}
                                />
                            </div>
                        )}
                    </div>

                    {/* Шаг 2 — Что выдаём */}
                    <div>
                        <label className="mb-1 block text-sm font-medium">
                            Шаг 2 — Что выдаём
                        </label>
                        <Segment
                            value={whatKind}
                            onChange={(val) => {
                                const v = Array.isArray(val) ? val[0] : val
                                if (v === 'role') setWhatKind('role')
                            }}
                            {...qa('host.projectSettings.assignments.whatSegment')}
                        >
                            <Segment.Item
                                value="role"
                                {...qa(
                                    'host.projectSettings.assignments.whatSegment.item',
                                    { kind: 'role' },
                                )}
                            >
                                Роль целиком
                            </Segment.Item>
                            <Segment.Item
                                disabled
                                value="grant"
                                title="Появится позже"
                                {...qa(
                                    'host.projectSettings.assignments.whatSegment.item',
                                    { kind: 'grant' },
                                )}
                            >
                                Отдельное право
                            </Segment.Item>
                        </Segment>
                        <p className="mt-1 text-xs text-gray-500">
                            Роль — готовый набор прав. Выдача отдельного права
                            (тонкая настройка) появится позже.
                        </p>

                        <div className="mt-3">
                            <Select<{ value: string; label: string }>
                                placeholder="Выберите роль"
                                value={
                                    roleOptions.find(
                                        (o) => o.value === roleId,
                                    ) ?? null
                                }
                                options={roleOptions}
                                onChange={(o) => setRoleId(o?.value ?? '')}
                                {...qa('host.projectSettings.assignments.roleSelect')}
                            />
                        </div>
                    </div>

                    {/* Превью */}
                    {previewText && (
                        <div
                            className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-gray-700/40"
                            {...qa('host.projectSettings.assignments.preview')}
                        >
                            <p className="font-medium text-gray-700 dark:text-gray-200">
                                Превью
                            </p>
                            <p className="mt-1 text-gray-600 dark:text-gray-300">
                                {previewText} Охват записей роль не меняет — он
                                настраивается на «Обзоре».
                            </p>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            variant="plain"
                            onClick={() => setDrawerOpen(false)}
                            {...qa('host.projectSettings.assignments.cancel')}
                        >
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="primary"
                            loading={saving}
                            disabled={!canSubmit}
                            onClick={handleGrant}
                            {...qa('host.projectSettings.assignments.apply')}
                        >
                            Применить
                        </Button>
                    </div>
                </div>
            </Drawer>

            <ConfirmDialog
                isOpen={!!revoking}
                type="danger"
                title="Снять назначение"
                confirmText="Снять"
                cancelText="Отмена"
                confirmButtonProps={{ loading: busyRevoke }}
                onClose={() => setRevoking(null)}
                onCancel={() => setRevoking(null)}
                onConfirm={handleRevoke}
                {...qa('host.projectSettings.assignments.revokeConfirm')}
            >
                <p>
                    Снять роль «{revoking?.roleName ?? revoking?.roleId}» с «
                    {revoking?.granteeName ?? revoking?.granteeId}»? Люди отдела
                    потеряют права этой роли.
                </p>
            </ConfirmDialog>
        </div>
    )
}

export default AssignmentsTab
