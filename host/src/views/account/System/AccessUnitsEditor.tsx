import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    PiPlusDuotone,
    PiUsersDuotone,
    PiTreeStructureDuotone,
    PiTrashDuotone,
    PiCrownDuotone,
} from 'react-icons/pi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Drawer from '@/components/ui/Drawer'
import Tag from '@/components/ui/Tag'
import Spinner from '@/components/ui/Spinner'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import useOrgPermission from '@/utils/hooks/useOrgPermission'
import { qa } from '@/shared/qa'
import {
    apiGetAccessUnits,
    apiCreateAccessUnit,
    apiUpdateAccessUnit,
    apiSetAccessUnitParent,
    apiArchiveAccessUnit,
    apiGetAccessUnitMembers,
    apiAddAccessUnitMember,
    apiRemoveAccessUnitMember,
    apiPreviewUnitComposition,
    apiGetEmployees,
    ACCESS_UNIT_KINDS,
    ACCESS_UNIT_KIND_LABELS,
    type AccessUnit,
    type AccessUnitKind,
    type AccessUnitMember,
    type AccessUnitMemberType,
    type AccessUnitScopeType,
    type CompositionPreview,
    type OrgEmployee,
} from '@/services/CrmService'

/**
 * SCR-MORG-DEPARTMENTS structural editor — E2-16 (RFC-ACCESS-GROUPS).
 *
 * AccessUnit groups editor over the K3-groups BFF `/api/v1/access-units*`:
 *   - parentId hierarchy (tree, own_subgroups walks ONLY this);
 *   - memberType='group' composition (DAG, affects only effectiveUsers);
 *   - leader (leaderUserId);
 *   - membership (users + nested groups).
 *
 * Two axes are kept VISUALLY distinct (RFC §2.1, NORMATIVE): the tree shows the
 * hierarchy (parentId); composition (group-in-group) is edited as a member of
 * type "group" in the members drawer. Record visibility (охват записей) for box is
 * edited on the single simple surface — проект → Настройки → Доступ → «Обзор»
 * (5 legacy levels, `visibilityConfig`). The V2-primitive per-role editor was
 * removed in box (BX-MODEL-4): the box project-update path persists only the 5
 * legacy levels, so a V2 write surface would silently drop `{rules}` policies.
 *
 * Migration Department→AccessUnit is transparent (id preserved); legacy enum
 * levels are a 1:1 special case. Gating: `organization:manage` (FE UX only).
 */
interface AccessUnitsEditorProps {
    scopeType: AccessUnitScopeType
    scopeId?: string
}

const AccessUnitsEditor = ({ scopeType, scopeId }: AccessUnitsEditorProps) => {
    // P8-T4.3: редактор групп гейтится `units:manage` от реальной орг-проекции
    // Системы (→ `org:units:manage`), fail-closed при загрузке. Гейтинг проектной
    // поверхности остаётся вне scope этой задачи.
    const canManage = useOrgPermission()('units', 'manage')

    const [units, setUnits] = useState<AccessUnit[]>([])
    const [employees, setEmployees] = useState<OrgEmployee[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())

    // unit create/edit drawer
    const [unitDrawer, setUnitDrawer] = useState(false)
    const [editing, setEditing] = useState<AccessUnit | null>(null)
    const [name, setName] = useState('')
    const [kind, setKind] = useState<AccessUnitKind>('department')
    const [parentId, setParentId] = useState('')
    const [leaderUserId, setLeaderUserId] = useState('')
    const [saving, setSaving] = useState(false)

    // members drawer
    const [membersDrawer, setMembersDrawer] = useState(false)
    const [membersUnit, setMembersUnit] = useState<AccessUnit | null>(null)
    const [members, setMembers] = useState<AccessUnitMember[]>([])
    const [membersLoading, setMembersLoading] = useState(false)
    const [addType, setAddType] = useState<AccessUnitMemberType>('user')
    const [addMemberId, setAddMemberId] = useState('')
    // BX-MODEL-8 §7.2: expanded-member preview при вложении группы (композиции).
    const [preview, setPreview] = useState<CompositionPreview | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)

    const load = useCallback(async () => {
        if (!scopeId) return
        setLoading(true)
        setError(null)
        try {
            const [u, e] = await Promise.all([
                apiGetAccessUnits({ scopeType, scopeId }),
                // employees for leader/member pickers (org scope only)
                scopeType === 'ORGANIZATION'
                    ? apiGetEmployees()
                    : Promise.resolve([] as OrgEmployee[]),
            ])
            setUnits(Array.isArray(u) ? u.filter((x) => !x.archivedAt) : [])
            setEmployees(Array.isArray(e) ? e : [])
        } catch {
            setError('Не удалось загрузить группы доступа.')
        } finally {
            setLoading(false)
        }
    }, [scopeType, scopeId])

    useEffect(() => {
        load()
    }, [load])

    // BX-MODEL-8 §7.2: подгрузка expanded-member preview при вложении группы.
    // Только для addType==='group' с выбранной группой; user-режим не смотрим.
    // Ошибку глотаем тихо — preview информативен и не блокирует основной флоу.
    useEffect(() => {
        if (addType !== 'group' || !addMemberId || !membersUnit) {
            setPreview(null)
            setPreviewLoading(false)
            return
        }
        let cancelled = false
        setPreviewLoading(true)
        setPreview(null)
        apiPreviewUnitComposition(membersUnit.id, addMemberId)
            .then((p) => {
                if (!cancelled) setPreview(p)
            })
            .catch(() => {
                if (!cancelled) setPreview(null)
            })
            .finally(() => {
                if (!cancelled) setPreviewLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [addType, addMemberId, membersUnit])

    const childrenOf = useMemo(() => {
        const map = new Map<string | null, AccessUnit[]>()
        for (const u of units) {
            const key = u.parentId ?? null
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(u)
        }
        return map
    }, [units])

    const employeeName = useCallback(
        (uid: string) =>
            employees.find((e) => e.userId === uid)?.name || uid,
        [employees],
    )
    const unitName = useCallback(
        (id: string) => units.find((u) => u.id === id)?.name || id,
        [units],
    )

    const toggle = (id: string) =>
        setExpanded((prev) => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })

    const openCreate = () => {
        setEditing(null)
        setName('')
        setKind('department')
        setParentId('')
        setLeaderUserId('')
        setUnitDrawer(true)
    }
    const openEdit = (u: AccessUnit) => {
        setEditing(u)
        setName(u.name)
        setKind(u.kind)
        setParentId(u.parentId ?? '')
        setLeaderUserId(u.leaderUserId ?? '')
        setUnitDrawer(true)
    }

    const handleSaveUnit = async () => {
        if (!scopeId || !name.trim()) return
        setSaving(true)
        try {
            if (editing) {
                await apiUpdateAccessUnit(editing.id, {
                    name: name.trim(),
                    kind,
                    leaderUserId: leaderUserId || null,
                })
                // SetUnitParent is a distinct axis/endpoint (RFC §7.3).
                if ((editing.parentId ?? '') !== parentId) {
                    await apiSetAccessUnitParent(editing.id, parentId || null)
                }
            } else {
                await apiCreateAccessUnit({
                    scopeType,
                    scopeId,
                    name: name.trim(),
                    kind,
                    parentId: parentId || null,
                    leaderUserId: leaderUserId || null,
                })
            }
            setUnitDrawer(false)
            await load()
        } catch (e) {
            // M3.1 cycle / M1.1 cross-scope / M6.1 authz → surfaced as toast.
            const status = (e as { response?: { status?: number } })?.response
                ?.status
            toast.push(
                <Notification title="Не удалось сохранить" type="danger">
                    {status === 409
                        ? 'Недопустимая структура (цикл или конфликт уровней).'
                        : status === 403
                          ? 'Недостаточно прав для изменения этой группы.'
                          : 'Ошибка сохранения группы.'}
                </Notification>,
            )
        } finally {
            setSaving(false)
        }
    }

    const handleArchive = async (u: AccessUnit) => {
        if (!window.confirm(`Архивировать группу «${u.name}»?`)) return
        try {
            await apiArchiveAccessUnit(u.id)
            await load()
        } catch {
            toast.push(
                <Notification title="Не удалось архивировать" type="danger" />,
            )
        }
    }

    const openMembers = async (u: AccessUnit) => {
        setMembersUnit(u)
        setMembersDrawer(true)
        setMembersLoading(true)
        setMembers([])
        setAddType('user')
        setAddMemberId('')
        try {
            const m = await apiGetAccessUnitMembers(u.id)
            setMembers(Array.isArray(m) ? m : [])
        } catch {
            toast.push(
                <Notification title="Не удалось загрузить состав" type="danger" />,
            )
        } finally {
            setMembersLoading(false)
        }
    }

    const handleAddMember = async () => {
        if (!membersUnit || !addMemberId) return
        try {
            await apiAddAccessUnitMember(membersUnit.id, {
                memberType: addType,
                memberId: addMemberId,
            })
            const m = await apiGetAccessUnitMembers(membersUnit.id)
            setMembers(Array.isArray(m) ? m : [])
            setAddMemberId('')
        } catch (e) {
            // M6.4/B3: composition-add of a group needs manage on BOTH groups.
            const status = (e as { response?: { status?: number } })?.response
                ?.status
            toast.push(
                <Notification title="Не удалось добавить" type="danger">
                    {status === 403
                        ? 'Для вложения группы нужны права управления на обе группы.'
                        : status === 409
                          ? 'Циклическая вложенность недопустима.'
                          : 'Ошибка добавления участника.'}
                </Notification>,
            )
        }
    }

    const handleRemoveMember = async (m: AccessUnitMember) => {
        if (!membersUnit) return
        try {
            await apiRemoveAccessUnitMember(membersUnit.id, {
                memberType: m.memberType,
                memberId: m.memberId,
            })
            setMembers((prev) =>
                prev.filter(
                    (x) =>
                        !(
                            x.memberType === m.memberType &&
                            x.memberId === m.memberId
                        ),
                ),
            )
        } catch {
            toast.push(
                <Notification title="Не удалось убрать участника" type="danger" />,
            )
        }
    }

    const kindOptions = ACCESS_UNIT_KINDS.map((k) => ({
        value: k,
        label: ACCESS_UNIT_KIND_LABELS[k],
    }))
    const parentOptions = useMemo(
        () => [
            { value: '', label: 'Без родителя (верхний уровень)' },
            ...units
                .filter((u) => u.id !== editing?.id)
                .map((u) => ({ value: u.id, label: u.name })),
        ],
        [units, editing],
    )
    const leaderOptions = useMemo(
        () => [
            { value: '', label: 'Не назначен' },
            ...employees.map((e) => ({
                value: e.userId,
                label: e.name || e.userId,
            })),
        ],
        [employees],
    )
    const addMemberOptions = useMemo(() => {
        if (addType === 'group') {
            return units
                .filter((u) => u.id !== membersUnit?.id)
                .map((u) => ({ value: u.id, label: u.name }))
        }
        return employees.map((e) => ({
            value: e.userId,
            label: e.name || e.userId,
        }))
    }, [addType, units, employees, membersUnit])

    const renderUnit = (u: AccessUnit, level = 0) => {
        const kids = childrenOf.get(u.id) ?? []
        const isExpanded = expanded.has(u.id)
        return (
            <div key={u.id} className="mb-1">
                <div
                    className="flex items-center gap-2 rounded-lg p-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                    style={{ paddingLeft: `${level * 20 + 12}px` }}
                    {...qa('host.settings.accessUnits.row', { unit: u.id })}
                >
                    {kids.length > 0 ? (
                        <button
                            type="button"
                            className="text-gray-400"
                            onClick={() => toggle(u.id)}
                            {...qa('host.settings.accessUnits.rowExpand', { unit: u.id })}
                        >
                            {isExpanded ? '▾' : '▸'}
                        </button>
                    ) : (
                        <span className="w-3" />
                    )}
                    <div className="flex flex-1 items-center gap-2">
                        <span className="font-medium">{u.name}</span>
                        <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                            {ACCESS_UNIT_KIND_LABELS[u.kind]}
                        </Tag>
                        {u.leaderUserId && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                                <PiCrownDuotone className="h-3.5 w-3.5 text-amber-500" />
                                {employeeName(u.leaderUserId)}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            size="xs"
                            variant="plain"
                            icon={<PiUsersDuotone />}
                            onClick={() => openMembers(u)}
                            {...qa('host.settings.accessUnits.membersOpen', { unit: u.id })}
                        >
                            Состав
                        </Button>
                        {canManage && (
                            <>
                                <Button
                                    size="xs"
                                    variant="plain"
                                    onClick={() => openEdit(u)}
                                    {...qa('host.settings.accessUnits.editOpen', { unit: u.id })}
                                >
                                    Изм.
                                </Button>
                                <button
                                    type="button"
                                    className="rounded p-1.5 text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    title="Архивировать"
                                    onClick={() => handleArchive(u)}
                                    {...qa('host.settings.accessUnits.archive', { unit: u.id })}
                                >
                                    <PiTrashDuotone className="h-4 w-4" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
                {kids.length > 0 && isExpanded && (
                    <div>{kids.map((c) => renderUnit(c, level + 1))}</div>
                )}
            </div>
        )
    }

    const roots = childrenOf.get(null) ?? []

    return (
        <>
            <AdaptiveCard {...qa('host.projectSettings.accessUnits.root')}>
                <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="flex items-center gap-2 text-lg font-semibold">
                                <PiTreeStructureDuotone className="h-5 w-5 text-primary" />
                                Группы доступа
                            </h3>
                            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                                Вложенная структура групп. Иерархия (родитель)
                                определяет «свои + подчинённых»; вложение группы в
                                состав другой (композиция) расширяет состав, но не
                                иерархию. Руководитель видит записи поддерева.
                            </p>
                        </div>
                        {canManage && (
                            <Button
                                {...qa('host.projectSettings.accessUnits.create')}
                                size="sm"
                                variant="solid"
                                icon={<PiPlusDuotone />}
                                onClick={openCreate}
                                {...qa('host.settings.accessUnits.create')}
                            >
                                Создать группу
                            </Button>
                        )}
                    </div>

                    {loading && (
                        <div {...qa('host.projectSettings.accessUnits.loading')} className="flex justify-center py-8">
                            <Spinner size={32} />
                        </div>
                    )}
                    {error && !loading && (
                        <div {...qa('host.projectSettings.accessUnits.error')} className="py-4 text-sm text-red-600 dark:text-red-400">
                            {error}{' '}
                            <button
                                {...qa('host.projectSettings.accessUnits.retry')}
                                type="button"
                                className="underline"
                                onClick={load}
                            >
                                повторить
                            </button>
                        </div>
                    )}
                    {!loading && !error && roots.length === 0 && (
                        <p {...qa('host.projectSettings.accessUnits.empty')} className="py-8 text-center text-sm text-gray-500">
                            Групп пока нет.
                        </p>
                    )}
                    {!loading && roots.length > 0 && (
                        <div {...qa('host.projectSettings.accessUnits.list')} className="space-y-1">
                            {roots.map((u) => renderUnit(u))}
                        </div>
                    )}
                </div>
            </AdaptiveCard>

            {/* Create / edit unit drawer. */}
            <Drawer
                {...qa('host.projectSettings.accessUnits.unitDrawer')}
                isOpen={unitDrawer}
                title={editing ? 'Изменить группу' : 'Создать группу'}
                onClose={() => setUnitDrawer(false)}
            >
                <div className="space-y-4">
                    <div>
                        <label className="mb-1 block text-sm font-medium">
                            Название
                        </label>
                        <Input
                            value={name}
                            placeholder="Название группы"
                            onChange={(e) => setName(e.target.value)}
                            {...qa('host.settings.accessUnits.unitName')}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium">
                            Тип
                        </label>
                        <Select<{ value: AccessUnitKind; label: string }>
                            value={kindOptions.find((o) => o.value === kind)}
                            options={kindOptions}
                            onChange={(o) => setKind(o?.value ?? 'department')}
                            {...qa('host.settings.accessUnits.unitKind')}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium">
                            Родительская группа (иерархия)
                        </label>
                        <Select<{ value: string; label: string }>
                            value={parentOptions.find(
                                (o) => o.value === parentId,
                            )}
                            options={parentOptions}
                            onChange={(o) => setParentId(o?.value ?? '')}
                            {...qa('host.settings.accessUnits.unitParent')}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            Определяет «свои + подчинённых». Вложение по составу
                            (композиция) — в разделе «Состав».
                        </p>
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium">
                            Руководитель
                        </label>
                        <Select<{ value: string; label: string }>
                            value={leaderOptions.find(
                                (o) => o.value === leaderUserId,
                            )}
                            options={leaderOptions}
                            onChange={(o) => setLeaderUserId(o?.value ?? '')}
                            {...qa('host.settings.accessUnits.unitLeader')}
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            variant="plain"
                            onClick={() => setUnitDrawer(false)}
                        >
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="primary"
                            loading={saving}
                            disabled={!name.trim()}
                            onClick={handleSaveUnit}
                        >
                            {editing ? 'Сохранить' : 'Создать'}
                        </Button>
                    </div>
                </div>
            </Drawer>

            {/* Members drawer (users + nested groups). */}
            <Drawer
                isOpen={membersDrawer}
                title={`Состав: ${membersUnit?.name ?? ''}`}
                width={480}
                onClose={() => setMembersDrawer(false)}
            >
                <div className="space-y-4">
                    {membersLoading ? (
                        <div className="flex justify-center py-8">
                            <Spinner size={28} />
                        </div>
                    ) : members.length === 0 ? (
                        <p className="py-4 text-sm text-gray-500">
                            В группе пока нет участников.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {members.map((m) => (
                                <div
                                    key={`${m.memberType}-${m.memberId}`}
                                    className="flex items-center justify-between rounded-lg border border-gray-200 p-2.5 dark:border-gray-700"
                                    {...qa('host.settings.accessUnits.memberRow', {
                                        unit: membersUnit!.id,
                                        memberType: m.memberType,
                                        member: m.memberId,
                                    })}
                                >
                                    <div className="flex items-center gap-2">
                                        <Tag
                                            className={
                                                m.memberType === 'group'
                                                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                            }
                                        >
                                            {m.memberType === 'group'
                                                ? 'группа'
                                                : 'участник'}
                                        </Tag>
                                        <span className="text-sm">
                                            {m.memberName ??
                                                (m.memberType === 'group'
                                                    ? unitName(m.memberId)
                                                    : employeeName(m.memberId))}
                                        </span>
                                    </div>
                                    {canManage && (
                                        <button
                                            type="button"
                                            className="rounded p-1.5 text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                            title="Убрать"
                                            onClick={() =>
                                                handleRemoveMember(m)
                                            }
                                            {...qa('host.settings.accessUnits.memberRemove', {
                                                unit: membersUnit!.id,
                                                memberType: m.memberType,
                                                member: m.memberId,
                                            })}
                                        >
                                            <PiTrashDuotone className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {canManage && (
                        <div className="space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                            <div className="text-sm font-medium">
                                Добавить участника
                            </div>
                            <Select<{
                                value: AccessUnitMemberType
                                label: string
                            }>
                                value={{
                                    value: addType,
                                    label:
                                        addType === 'group'
                                            ? 'Вложенная группа (композиция)'
                                            : 'Пользователь',
                                }}
                                options={[
                                    { value: 'user', label: 'Пользователь' },
                                    {
                                        value: 'group',
                                        label: 'Вложенная группа (композиция)',
                                    },
                                ]}
                                onChange={(o) => {
                                    setAddType(o?.value ?? 'user')
                                    setAddMemberId('')
                                }}
                                {...qa('host.settings.accessUnits.addMemberType')}
                            />
                            <Select<{ value: string; label: string }>
                                placeholder={
                                    addType === 'group'
                                        ? 'Выберите группу'
                                        : 'Выберите пользователя'
                                }
                                value={addMemberOptions.find(
                                    (o) => o.value === addMemberId,
                                )}
                                options={addMemberOptions}
                                onChange={(o) => setAddMemberId(o?.value ?? '')}
                                {...qa('host.settings.accessUnits.addMemberPicker')}
                            />
                            {addType === 'group' && (
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                    Вложение группы требует прав управления на обе
                                    группы.
                                </p>
                            )}
                            {/* BX-MODEL-8 §7.2: expanded-member preview до нажатия «Добавить». */}
                            {addType === 'group' && addMemberId && (
                                <div
                                    className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800/60"
                                    {...qa('host.settings.accessUnits.compositionPreview', {
                                        unit: membersUnit!.id,
                                        nested: addMemberId,
                                    })}
                                >
                                    {previewLoading ? (
                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                            <Spinner size={16} />
                                            Расчёт эффективного состава…
                                        </div>
                                    ) : preview ? (
                                        <div className="space-y-1.5">
                                            {preview.addedUserCount > 0 ? (
                                                <p className="text-sm text-gray-700 dark:text-gray-200">
                                                    Состав вырастет:{' '}
                                                    <span className="font-medium">
                                                        {preview.currentUserCount}
                                                    </span>{' '}
                                                    →{' '}
                                                    <span className="font-medium">
                                                        {
                                                            preview.projectedUserCount
                                                        }
                                                    </span>{' '}
                                                    (+{preview.addedUserCount}{' '}
                                                    польз.)
                                                </p>
                                            ) : (
                                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                                    Новых пользователей не добавит.
                                                </p>
                                            )}
                                            {preview.crossScopeDropped > 0 && (
                                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                                    {preview.crossScopeDropped}{' '}
                                                    участник(ов) из другого
                                                    пространства не будут добавлены
                                                    (изоляция скоупов).
                                                </p>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            )}
                            <Button
                                size="sm"
                                variant="solid"
                                color="primary"
                                disabled={!addMemberId}
                                onClick={handleAddMember}
                            >
                                Добавить
                            </Button>
                        </div>
                    )}
                </div>
            </Drawer>
        </>
    )
}

export default AccessUnitsEditor
