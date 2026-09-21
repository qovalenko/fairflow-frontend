import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    PiCaretDownDuotone,
    PiCaretRightDuotone,
    PiPlusDuotone,
    PiPencilDuotone,
    PiTrashDuotone,
} from 'react-icons/pi'
import SystemSettingsLayout from './SystemSettingsLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import useOrgPermission from '@/utils/hooks/useOrgPermission'
import {
    apiGetDepartments,
    apiGetEmployees,
    apiCreateDepartment,
    apiUpdateDepartment,
    apiDeleteDepartment,
    apiGetDepartmentSummary,
    type OrgDepartment,
    type OrgEmployee,
    type DepartmentSummary,
} from '@/services/CrmService'
import { qa, qaWithAlias } from '@/shared/qa'

const Departments = () => {
    const { systemId } = useWorkspaceRole()
    const orgId = systemId
    // FR-MORG-34 / P8-T4.3: гейтинг по праву `departments:write|delete` от РЕАЛЬНОЙ
    // орг-проекции бэка (маппится в `org:departments:manage`). Fail-closed при
    // загрузке проекции (deny до ответа PDP).
    const canOrg = useOrgPermission()
    const canWrite = canOrg('departments', 'write')
    const canDelete = canOrg('departments', 'delete')
    const canManage = canWrite
    const canRemove = canDelete

    const [departments, setDepartments] = useState<OrgDepartment[]>([])
    const [employees, setEmployees] = useState<OrgEmployee[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [summaries, setSummaries] = useState<Record<string, DepartmentSummary>>({})

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formName, setFormName] = useState('')
    const [formParent, setFormParent] = useState('')
    const [formLeader, setFormLeader] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!orgId) return
        setIsLoading(true)
        setError(null)
        try {
            const [depts, emps] = await Promise.all([
                apiGetDepartments(),
                apiGetEmployees(),
            ])
            const list = Array.isArray(depts) ? depts : []
            setDepartments(list)
            setEmployees(Array.isArray(emps) ? emps : [])
            const pairs = await Promise.all(
                list.map((d) =>
                    apiGetDepartmentSummary(d.id)
                        .then((s) => [d.id, s] as const)
                        .catch(() => null),
                ),
            )
            const next: Record<string, DepartmentSummary> = {}
            for (const p of pairs) if (p) next[p[0]] = p[1]
            setSummaries(next)
        } catch (e) {
            console.error('Load departments failed:', e)
            setError('Не удалось загрузить подразделения.')
        } finally {
            setIsLoading(false)
        }
    }, [orgId])

    useEffect(() => {
        load()
    }, [load])

    const childrenOf = useMemo(() => {
        const map = new Map<string | null, OrgDepartment[]>()
        for (const d of departments) {
            const key = d.parentId ?? null
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(d)
        }
        return map
    }, [departments])

    const employeeCount = useCallback(
        (deptId: string) => employees.filter((e) => e.departmentId === deptId).length,
        [employees],
    )

    // BX-HIER: имя руководителя отдела (иерархия видна на строке, не только в форме).
    const employeeName = useMemo(() => {
        const map = new Map<string, string>()
        for (const e of employees) map.set(e.userId, e.name || e.email || e.userId)
        return map
    }, [employees])
    const leaderName = useCallback(
        (leaderUserId: string | null) =>
            leaderUserId ? (employeeName.get(leaderUserId) ?? leaderUserId) : null,
        [employeeName],
    )

    const toggleExpand = (id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else {
                next.add(id)
                if (!summaries[id]) {
                    apiGetDepartmentSummary(id)
                        .then((s) => setSummaries((m) => ({ ...m, [id]: s })))
                        .catch(() => undefined)
                }
            }
            return next
        })
    }

    const summaryLine = (deptId: string) => {
        const s = summaries[deptId]
        const parts = [`${employeeCount(deptId)} сотрудников`]
        if (s) {
            if (s.pendingInvitations > 0) {
                parts.push(`${s.pendingInvitations} приглашений`)
            }
            parts.push(`${s.activeSeats} мест`)
        }
        return parts.join(' · ')
    }

    const openCreate = () => {
        setEditingId(null)
        setFormName('')
        setFormParent('')
        setFormLeader('')
        setSaveError(null)
        setDrawerOpen(true)
    }

    const openEdit = (dept: OrgDepartment) => {
        setEditingId(dept.id)
        setFormName(dept.name)
        setFormParent(dept.parentId ?? '')
        setFormLeader(dept.leaderUserId ?? '')
        setSaveError(null)
        setDrawerOpen(true)
    }

    const handleSave = async () => {
        if (!orgId || !formName.trim()) return
        setIsSaving(true)
        setSaveError(null)
        try {
            if (editingId) {
                await apiUpdateDepartment(editingId, {
                    name: formName.trim(),
                    parentId: formParent || null,
                    leaderUserId: formLeader || null,
                })
            } else {
                await apiCreateDepartment({
                    name: formName.trim(),
                    parentId: formParent || undefined,
                    leaderUserId: formLeader || undefined,
                })
            }
            setDrawerOpen(false)
            await load()
        } catch (e) {
            console.error('Save department failed:', e)
            setSaveError('Не удалось сохранить отдел.')
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (dept: OrgDepartment) => {
        if (!orgId) return
        // TO-BE: подтверждение перед рисковым удалением (AS-IS дефект — без confirm).
        const ok = window.confirm(
            `Удалить отдел «${dept.name}»? Это действие нельзя отменить.`,
        )
        if (!ok) return
        try {
            await apiDeleteDepartment(dept.id)
            toast.push(
                <Notification title="Отдел удалён" type="success">
                    «{dept.name}» удалён.
                </Notification>,
            )
            await load()
        } catch (e) {
            // ST-7: ранее ошибка только в console (дефект #7). Теперь — тост.
            // department_not_empty (409, FR-MORG-21) — узел с сотрудниками/детьми.
            console.error('Delete department failed:', e)
            const status = (e as { response?: { status?: number } })?.response?.status
            toast.push(
                <Notification title="Не удалось удалить" type="danger">
                    {status === 409
                        ? 'В отделе есть сотрудники или вложенные отделы — сначала переведите их.'
                        : 'Не удалось удалить отдел. Попробуйте позже.'}
                </Notification>,
            )
        }
    }

    // Leader options: any employee (their record is the department head).
    const leaderOptions = useMemo(
        () => [
            { value: '', label: 'Не назначен' },
            ...employees.map((e) => ({ value: e.userId, label: e.name || e.userId })),
        ],
        [employees],
    )

    // Parent options exclude the node being edited (can't be its own parent).
    const parentOptions = useMemo(
        () => [
            { value: '', label: 'Без родительского отдела' },
            ...departments
                .filter((d) => d.id !== editingId)
                .map((d) => ({ value: d.id, label: d.name })),
        ],
        [departments, editingId],
    )

    const renderDepartment = (dept: OrgDepartment, level = 0) => {
        const kids = childrenOf.get(dept.id) ?? []
        const hasChildren = kids.length > 0
        const isExpanded = expanded.has(dept.id)
        return (
            <div key={dept.id} className="mb-1">
                <div
                    className="flex items-center gap-2 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    style={{ paddingLeft: `${level * 24 + 12}px` }}
                    {...qaWithAlias('host.settings.departments.row', 'host.departments.item')}
                    {...qa('host.settings.departments.row', { department: dept.id, id: dept.id })}
                >
                    {hasChildren ? (
                        <button
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                            onClick={() => toggleExpand(dept.id)}
                            {...qa('host.settings.departments.expand', { department: dept.id })}
                        >
                            {isExpanded ? (
                                <PiCaretDownDuotone className="w-4 h-4" />
                            ) : (
                                <PiCaretRightDuotone className="w-4 h-4" />
                            )}
                        </button>
                    ) : (
                        <div className="w-6" />
                    )}
                    <div className="flex-1 flex items-center gap-3">
                        <div className="flex-1">
                            <div className="font-medium">{dept.name}</div>
                            <div className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
                                {summaryLine(dept.id)}
                                {leaderName(dept.leaderUserId) && (
                                    <>
                                        {' · '}
                                        <span className="text-gray-500 dark:text-gray-500">
                                            Руководитель:
                                        </span>{' '}
                                        {leaderName(dept.leaderUserId)}
                                    </>
                                )}
                            </div>
                        </div>
                        {(canManage || canRemove) && (
                            <div className="flex items-center gap-1">
                                {canManage && (
                                    <button
                                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                                        title="Редактировать"
                                        onClick={() => openEdit(dept)}
                                        {...qa('host.settings.departments.edit', { department: dept.id })}
                                    >
                                        <PiPencilDuotone className="w-4 h-4" />
                                    </button>
                                )}
                                {canRemove && (
                                    <button
                                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-red-500"
                                        title="Удалить"
                                        onClick={() => handleDelete(dept)}
                                        {...qaWithAlias(
                                            'host.settings.departments.delete',
                                            'host.departments.delete',
                                        )}
                                        {...qa('host.settings.departments.delete', {
                                            department: dept.id,
                                            id: dept.id,
                                        })}
                                    >
                                        <PiTrashDuotone className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                {hasChildren && isExpanded && (
                    <div>{kids.map((child) => renderDepartment(child, level + 1))}</div>
                )}
            </div>
        )
    }

    const roots = childrenOf.get(null) ?? []

    return (
        <SystemSettingsLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Подразделения</h2>
                    {canManage && (
                        <Button
                            variant="solid"
                            color="primary"
                            icon={<PiPlusDuotone />}
                            onClick={openCreate}
                            {...qa('host.settings.departments.create')}
                        >
                            Создать отдел
                        </Button>
                    )}
                </div>

                <AdaptiveCard>
                    {isLoading && (
                        <div className="flex justify-center py-12">
                            <Spinner size={40} />
                        </div>
                    )}
                    {error && !isLoading && (
                        <p className="text-sm text-red-600 dark:text-red-400 py-4">{error}</p>
                    )}
                    {!isLoading && !error && roots.length === 0 && (
                        <p className="text-sm text-gray-500 py-8 text-center">
                            Подразделений пока нет.
                        </p>
                    )}
                    {!isLoading && roots.length > 0 && (
                        <div className="space-y-1">
                            {roots.map((dept) => renderDepartment(dept))}
                        </div>
                    )}
                </AdaptiveCard>

                {/* BX-MODEL-4 — одна сущность «Команды/Отделы» на экране: этот
                    экран показывает иерархию отделов (Department: parentId +
                    руководитель — то, что используют охваты «свой отдел / свои +
                    подчинённых»). Группы доступа AccessUnit (композиция, состав)
                    редактируются в единственном box-месте — проект → Настройки →
                    Доступ → «Команды»; их дублирующий редактор убран отсюда, чтобы
                    один экран не смешивал две сущности групп (BOX-MODEL-FINAL §5.3). */}

                <Drawer
                    isOpen={drawerOpen}
                    title={editingId ? 'Редактировать отдел' : 'Создать отдел'}
                    onClose={() => setDrawerOpen(false)}
                >
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Название</label>
                            <Input
                                value={formName}
                                placeholder="Введите название отдела"
                                onChange={(e) => setFormName(e.target.value)}
                                {...qa('host.settings.departments.drawerName')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Родительский отдел
                            </label>
                            <Select<{ value: string; label: string }>
                                value={parentOptions.find((o) => o.value === formParent)}
                                options={parentOptions}
                                onChange={(opt) => setFormParent(opt?.value || '')}
                                {...qa('host.settings.departments.drawerParent')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Руководитель
                            </label>
                            <Select<{ value: string; label: string }>
                                value={leaderOptions.find((o) => o.value === formLeader)}
                                options={leaderOptions}
                                onChange={(opt) => setFormLeader(opt?.value || '')}
                                {...qa('host.settings.departments.drawerLeader')}
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Видит записи сотрудников этого отдела и под-отделов (уровень «свои
                                + подчинённых»).
                            </p>
                        </div>
                        {saveError && (
                            <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
                        )}
                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="plain" onClick={() => setDrawerOpen(false)}>
                                Отмена
                            </Button>
                            <Button
                                variant="solid"
                                color="primary"
                                loading={isSaving}
                                onClick={handleSave}
                                {...qa('host.settings.departments.drawerSave')}
                            >
                                {editingId ? 'Сохранить' : 'Создать'}
                            </Button>
                        </div>
                    </div>
                </Drawer>
            </div>
        </SystemSettingsLayout>
    )
}

export default Departments
