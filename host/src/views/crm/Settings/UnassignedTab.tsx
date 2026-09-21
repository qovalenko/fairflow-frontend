import { useCallback, useEffect, useMemo, useState } from 'react'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import Tag from '@/components/ui/Tag'
import Checkbox from '@/components/ui/Checkbox'
import toast from '@/components/ui/toast'
import {
    apiBulkReassignUnassigned,
    apiGetProjectMembers,
    apiListUnassigned,
    type ProjectMember,
    type UnassignedRecord,
} from '@/services/CrmService'
import { qa } from '@/shared/qa'

const RESOURCE_OPTIONS = [
    { value: 'all', label: 'Все типы' },
    { value: 'contact', label: 'Контакты' },
    { value: 'deal', label: 'Сделки' },
    { value: 'order', label: 'Заказы' },
    { value: 'company', label: 'Компании' },
    { value: 'activity', label: 'Активности' },
    { value: 'document', label: 'Документы' },
]

const entityLabel = (t: string) =>
    RESOURCE_OPTIONS.find((o) => o.value === t)?.label ?? t

const formatTime = (value?: string) => {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

type UnassignedTabProps = {
    projectId?: string
}

/** SCR-MORG-UNASSIGNED / FR-ORG-530 — records without owner in a project. */
const UnassignedTab = ({ projectId }: UnassignedTabProps) => {
    const [resource, setResource] = useState('all')
    const [rows, setRows] = useState<UnassignedRecord[]>([])
    const [total, setTotal] = useState(0)
    const [nextCursor, setNextCursor] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [members, setMembers] = useState<ProjectMember[]>([])
    const [newOwnerId, setNewOwnerId] = useState('')
    const [isReassigning, setIsReassigning] = useState(false)

    const rowKey = (r: UnassignedRecord) => `${r.entityType}:${r.entityId}`

    const load = useCallback(
        async (cursor = '', append = false) => {
            if (!projectId) return
            setIsLoading(true)
            setError(null)
            try {
                const res = await apiListUnassigned(projectId, {
                    resource,
                    limit: 50,
                    cursor: cursor || undefined,
                })
                const list = Array.isArray(res.list) ? res.list : []
                setRows((prev) => (append ? [...prev, ...list] : list))
                setTotal(Number(res.total ?? list.length))
                setNextCursor(res.nextCursor ?? '')
                if (!append) setSelected(new Set())
            } catch (e) {
                console.error('Load unassigned failed:', e)
                setError('Не удалось загрузить записи без владельца.')
            } finally {
                setIsLoading(false)
            }
        },
        [projectId, resource],
    )

    useEffect(() => {
        load()
    }, [load])

    useEffect(() => {
        if (!projectId) return
        apiGetProjectMembers<ProjectMember>(projectId)
            .then((list) => setMembers(Array.isArray(list) ? list : []))
            .catch(() => setMembers([]))
    }, [projectId])

    const memberOptions = useMemo(
        () => members.map((m) => ({ value: m.id, label: m.name || m.email || m.id })),
        [members],
    )

    const toggleRow = (key: string) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    const toggleAll = () => {
        if (selected.size === rows.length) {
            setSelected(new Set())
        } else {
            setSelected(new Set(rows.map(rowKey)))
        }
    }

    const handleBulkReassign = async () => {
        if (!projectId || !newOwnerId || selected.size === 0) return
        setIsReassigning(true)
        try {
            const items = rows
                .filter((r) => selected.has(rowKey(r)))
                .map((r) => ({ entityType: r.entityType, entityId: r.entityId }))
            const res = await apiBulkReassignUnassigned(projectId, {
                newOwnerUserId: newOwnerId,
                items,
            })
            toast.push(
                <span>Переназначено записей: {res.reassigned ?? items.length}</span>,
                { placement: 'top-center' },
            )
            await load()
        } catch (e) {
            console.error('Bulk reassign failed:', e)
            toast.push(<span>Не удалось переназначить записи</span>, {
                placement: 'top-center',
            })
        } finally {
            setIsReassigning(false)
        }
    }

    if (!projectId) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.unassigned.noProject')}>
                <p className="text-sm text-gray-500 py-8 text-center">Проект не выбран.</p>
            </AdaptiveCard>
        )
    }

    return (
        <div className="space-y-4" {...qa('host.projectSettings.unassigned.root')}>
            <AdaptiveCard>
                <div className="flex flex-wrap items-end gap-4 mb-4">
                    <div className="min-w-[200px]">
                        <Select
                            {...qa('host.projectSettings.unassigned.resourceFilter')}
                            value={RESOURCE_OPTIONS.find((o) => o.value === resource)}
                            options={RESOURCE_OPTIONS}
                            onChange={(opt) => setResource(opt?.value ?? 'all')}
                            {...qa('host.projectSettings.unassigned.filterResource')}
                        />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Без владельца: <strong>{total}</strong>
                    </p>
                </div>

                {selected.size > 0 && (
                    <div className="flex flex-wrap items-end gap-3 mb-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <span className="text-sm">Выбрано: {selected.size}</span>
                        <div className="min-w-[220px] flex-1">
                            <Select
                                {...qa('host.projectSettings.unassigned.newOwner')}
                                placeholder="Новый владелец"
                                options={memberOptions}
                                value={memberOptions.find((o) => o.value === newOwnerId)}
                                onChange={(opt) => setNewOwnerId(opt?.value ?? '')}
                                {...qa('host.projectSettings.unassigned.newOwner')}
                            />
                        </div>
                        <Button
                            variant="solid"
                            color="primary"
                            loading={isReassigning}
                            disabled={!newOwnerId}
                            onClick={handleBulkReassign}
                            {...qa('host.projectSettings.unassigned.reassign')}
                        >
                            Переназначить
                        </Button>
                    </div>
                )}

                {isLoading && rows.length === 0 && (
                    <div
                        className="flex justify-center py-12"
                        {...qa('host.projectSettings.unassigned.loading')}
                    >
                        <Spinner size={40} />
                    </div>
                )}
                {error && !isLoading && (
                    <p
                        className="text-sm text-red-600 dark:text-red-400 py-4"
                        {...qa('host.projectSettings.unassigned.error')}
                    >
                        {error}
                    </p>
                )}
                {!isLoading && !error && rows.length === 0 && (
                    <p
                        className="text-sm text-gray-500 py-8 text-center"
                        {...qa('host.projectSettings.unassigned.empty')}
                    >
                        Все записи имеют владельца.
                    </p>
                )}

                {rows.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-3 pb-2 border-b border-gray-100 dark:border-gray-800 text-sm font-medium text-gray-500">
                            <Checkbox
                                checked={selected.size === rows.length && rows.length > 0}
                                onChange={toggleAll}
                                {...qa('host.projectSettings.unassigned.selectAll')}
                            />
                            <span className="flex-1">Запись</span>
                            <span className="w-36">Тип</span>
                            <span className="w-40">Обновлено</span>
                        </div>
                        {rows.map((row) => {
                            const key = rowKey(row)
                            return (
                                <div
                                    key={key}
                                    className="flex items-center gap-3 py-2 border-b last:border-0 border-gray-50 dark:border-gray-800 text-sm"
                                    {...qa('host.projectSettings.unassigned.row', {
                                        entityType: row.entityType,
                                        entity: row.entityId,
                                        entityId: row.entityId,
                                    })}
                                >
                                    <Checkbox
                                        checked={selected.has(key)}
                                        onChange={() => toggleRow(key)}
                                        {...qa('host.projectSettings.unassigned.rowSelect', {
                                            entityType: row.entityType,
                                            entity: row.entityId,
                                        })}
                                    />
                                    <span className="flex-1 truncate font-medium">
                                        {row.title || row.entityId}
                                    </span>
                                    <span className="w-36">
                                        <Tag className="bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                                            {entityLabel(row.entityType)}
                                        </Tag>
                                    </span>
                                    <span className="w-40 text-gray-500">
                                        {formatTime(row.updatedAt)}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                )}

                {nextCursor && (
                    <div className="flex justify-center pt-4">
                        <Button
                            variant="plain"
                            loading={isLoading}
                            onClick={() => load(nextCursor, true)}
                            {...qa('host.projectSettings.unassigned.loadMore')}
                        >
                            Загрузить ещё
                        </Button>
                    </div>
                )}
            </AdaptiveCard>
        </div>
    )
}

export default UnassignedTab
