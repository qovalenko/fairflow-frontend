import { useState, useEffect, useCallback, useMemo } from 'react'
import { PiCaretDownDuotone, PiCaretRightDuotone } from 'react-icons/pi'
import SystemSettingsLayout from './SystemSettingsLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import Tag from '@/components/ui/Tag'
import Button from '@/components/ui/Button'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import useOrgPermission from '@/utils/hooks/useOrgPermission'
import { apiGetOrgAudit, type OrgAuditEntry } from '@/services/CrmService'
import { qa } from '@/shared/qa'

/** Audit action → human label + entity bucket (for filtering). */
const ACTION_META: Record<string, { label: string; entity: string }> = {
    'organization.updated': { label: 'Изменён профиль организации', entity: 'organization' },
    'employee.added': { label: 'Добавлен сотрудник', entity: 'employee' },
    'employee.updated': { label: 'Изменён сотрудник', entity: 'employee' },
    'employee.removed': { label: 'Удалён сотрудник', entity: 'employee' },
    'department.created': { label: 'Создан отдел', entity: 'department' },
    'department.updated': { label: 'Изменён отдел', entity: 'department' },
    'department.deleted': { label: 'Удалён отдел', entity: 'department' },
    'invitation.created': { label: 'Создано приглашение', entity: 'invitation' },
    'invitation.revoked': { label: 'Отозвано приглашение', entity: 'invitation' },
    'invitation.resent': { label: 'Повторно отправлено приглашение', entity: 'invitation' },
    'invitation.accepted': { label: 'Принято приглашение', entity: 'invitation' },
}

const ENTITY_LABELS: Record<string, string> = {
    organization: 'Организация',
    employee: 'Сотрудник',
    department: 'Отдел',
    invitation: 'Приглашение',
}

const actionLabel = (action: string) => ACTION_META[action]?.label ?? action
const actionEntity = (e: OrgAuditEntry) =>
    ACTION_META[e.action]?.entity ?? e.entityType

const formatTime = (value?: string | number): string => {
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

/** Short human summary from an entry's metadata. */
const describe = (e: OrgAuditEntry): string => {
    const m = e.metadata ?? {}
    const email = typeof m.email === 'string' ? m.email : ''
    const role = typeof m.role === 'string' ? m.role : ''
    const name = typeof m.name === 'string' ? m.name : ''
    switch (e.action) {
        case 'invitation.created':
        case 'invitation.revoked':
        case 'invitation.resent':
        case 'invitation.accepted':
            return email || '—'
        case 'employee.added':
            return role ? `роль: ${role}` : ''
        case 'department.created':
        case 'department.updated':
            return name || ''
        case 'organization.updated':
            return Array.isArray(m.fields) ? `поля: ${(m.fields as string[]).join(', ')}` : ''
        default:
            return ''
    }
}

const SystemAudit = () => {
    const { systemId } = useWorkspaceRole()
    const orgId = systemId
    // FR-MORG-40 / P8-T4.3: журнал гейтится `orgAudit:read`, теперь от РЕАЛЬНОЙ
    // орг-проекции бэка (маппится в канонический `org:audit:read`). employee не
    // получает `org:audit:read` из PDP → журнал закрыт и по прямому URL.
    // Fail-closed при загрузке проекции (deny до ответа).
    const canOrg = useOrgPermission()
    const canReadAudit = canOrg('orgAudit', 'read')

    const [entries, setEntries] = useState<OrgAuditEntry[]>([])
    const [nextCursor, setNextCursor] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [userFilter, setUserFilter] = useState('')
    const [actionTypes, setActionTypes] = useState<string[]>([])
    const [entityFilter, setEntityFilter] = useState('')

    const load = useCallback(
        async (cursor = '', append = false) => {
            if (!orgId) return
            setIsLoading(true)
            setError(null)
            try {
                const res = await apiGetOrgAudit({
                    limit: 100,
                    cursor: cursor || undefined,
                    entityType: entityFilter || undefined,
                    from: dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
                    to: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
                })
                const rows = res.list
                setEntries((prev) => (append ? [...prev, ...rows] : rows))
                setNextCursor(res.nextCursor)
            } catch (e) {
                console.error('Load org audit failed:', e)
                setError('Не удалось загрузить журнал аудита.')
            } finally {
                setIsLoading(false)
            }
        },
        [orgId, entityFilter, dateFrom, dateTo],
    )

    useEffect(() => {
        load()
    }, [load])

    const toggleRow = (id: string) => {
        setExpandedRows((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const actorName = (e: OrgAuditEntry) => e.name || (e.userId ? e.userId : 'Система')

    const users = useMemo(
        () => Array.from(new Set(entries.map((e) => actorName(e)))),
        [entries],
    )

    const actionTypeOptions = useMemo(() => {
        const present = Array.from(new Set(entries.map((e) => e.action)))
        return present.map((a) => ({ value: a, label: actionLabel(a) }))
    }, [entries])

    const entityOptions = useMemo(
        () => [
            { value: '', label: 'Все сущности' },
            ...Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label })),
        ],
        [],
    )

    const filtered = useMemo(() => {
        return entries.filter((entry) => {
            if (userFilter && actorName(entry) !== userFilter) return false
            if (actionTypes.length > 0 && !actionTypes.includes(entry.action)) return false
            if (entityFilter && actionEntity(entry) !== entityFilter) return false
            if (dateFrom || dateTo) {
                const d = entry.createdAt ? new Date(entry.createdAt) : null
                if (!d || Number.isNaN(d.getTime())) return false
                const iso = d.toISOString().slice(0, 10)
                if (dateFrom && iso < dateFrom) return false
                if (dateTo && iso > dateTo) return false
            }
            return true
        })
    }, [entries, userFilter, actionTypes, entityFilter, dateFrom, dateTo])

    const hasActiveFilters = Boolean(
        userFilter || actionTypes.length > 0 || entityFilter || dateFrom || dateTo,
    )
    const resetFilters = () => {
        setUserFilter('')
        setActionTypes([])
        setEntityFilter('')
        setDateFrom('')
        setDateTo('')
    }

    // ST-10 No-perm route: без `orgAudit:read` журнал недоступен (FR-MORG-40).
    if (!canReadAudit) {
        return (
            <SystemSettingsLayout>
                <div className="space-y-6">
                    <h2 className="text-2xl font-bold">Журнал аудита</h2>
                    <AdaptiveCard>
                        <p className="text-sm text-gray-500 py-12 text-center">
                            У вас нет доступа к журналу аудита организации.
                        </p>
                    </AdaptiveCard>
                </div>
            </SystemSettingsLayout>
        )
    }

    return (
        <SystemSettingsLayout>
            <div className="space-y-6">
                <h2 className="text-2xl font-bold">Журнал аудита</h2>

                <AdaptiveCard>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-4 items-end">
                        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
                            <Input
                                type="date"
                                value={dateFrom}
                                placeholder="От"
                                className="flex-1 min-w-0"
                                onChange={(e) => setDateFrom(e.target.value)}
                                {...qa('host.settings.audit.filterDateFrom')}
                            />
                            <Input
                                type="date"
                                value={dateTo}
                                placeholder="До"
                                className="flex-1 min-w-0"
                                onChange={(e) => setDateTo(e.target.value)}
                                {...qa('host.settings.audit.filterDateTo')}
                            />
                        </div>
                        <Select
                            value={[
                                { value: '', label: 'Все пользователи' },
                                ...users.map((u) => ({ value: u, label: u })),
                            ].find((opt) => opt.value === userFilter)}
                            options={[
                                { value: '', label: 'Все пользователи' },
                                ...users.map((u) => ({ value: u, label: u })),
                            ]}
                            placeholder="Пользователь"
                            className="min-w-0"
                            onChange={(opt) => setUserFilter(opt?.value || '')}
                            {...qa('host.settings.audit.filterUser')}
                        />
                        <Select
                            isMulti
                            value={actionTypeOptions.filter((opt) =>
                                actionTypes.includes(opt.value),
                            )}
                            options={actionTypeOptions}
                            placeholder="Тип действия"
                            className="min-w-0"
                            onChange={(opts) =>
                                setActionTypes(
                                    Array.isArray(opts) ? opts.map((o) => o.value) : [],
                                )
                            }
                            {...qa('host.settings.audit.filterAction')}
                        />
                        <Select
                            value={entityOptions.find((opt) => opt.value === entityFilter)}
                            options={entityOptions}
                            placeholder="Сущность"
                            className="min-w-0"
                            onChange={(opt) => setEntityFilter(opt?.value || '')}
                            {...qa('host.settings.audit.filterEntity')}
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
                    {/* ST-3 Empty vs ST-4 Empty-filter (дефект #25 — разделены) */}
                    {!isLoading && !error && filtered.length === 0 && (
                        <div className="py-8 text-center">
                            {entries.length > 0 && hasActiveFilters ? (
                                <>
                                    <p className="text-sm text-gray-500">
                                        По заданным фильтрам записей не найдено.
                                    </p>
                                    <Button
                                        className="mt-3"
                                        variant="plain"
                                        size="sm"
                                        onClick={resetFilters}
                                    >
                                        Сбросить фильтры
                                    </Button>
                                </>
                            ) : (
                                <p className="text-sm text-gray-500">
                                    Записей в журнале пока нет.
                                </p>
                            )}
                        </div>
                    )}

                    {!isLoading && filtered.length > 0 && (
                        <div className="space-y-2">
                            {filtered.map((entry) => {
                                const hasMeta =
                                    entry.metadata && Object.keys(entry.metadata).length > 0
                                return (
                                    <div
                                        key={entry.id}
                                        className="border-b last:border-0 border-gray-100 dark:border-gray-800 pb-2"
                                        {...qa('host.settings.audit.row', { audit: entry.id })}
                                    >
                                        <div className="flex items-center gap-4 py-2">
                                            {hasMeta ? (
                                                <button
                                                    type="button"
                                                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                                    onClick={() => toggleRow(entry.id)}
                                                    {...qa('host.settings.audit.rowExpand', { audit: entry.id })}
                                                >
                                                    {expandedRows.has(entry.id) ? (
                                                        <PiCaretDownDuotone className="w-4 h-4" />
                                                    ) : (
                                                        <PiCaretRightDuotone className="w-4 h-4" />
                                                    )}
                                                </button>
                                            ) : (
                                                <span className="w-6" />
                                            )}
                                            <div className="flex-1 grid grid-cols-12 gap-4 text-sm">
                                                <div className="col-span-3 text-gray-500">
                                                    {formatTime(entry.createdAt)}
                                                </div>
                                                <div className="col-span-3 truncate">
                                                    {actorName(entry)}
                                                </div>
                                                <div className="col-span-3">
                                                    <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                                        {actionLabel(entry.action)}
                                                    </Tag>
                                                </div>
                                                <div className="col-span-3 truncate text-gray-600 dark:text-gray-300">
                                                    {describe(entry)}
                                                </div>
                                            </div>
                                        </div>
                                        {expandedRows.has(entry.id) && hasMeta && (
                                            <div
                                                className="ml-10 mt-1 p-3 bg-gray-50 dark:bg-gray-800 rounded"
                                                {...qa('host.settings.audit.rowMeta', { audit: entry.id })}
                                            >
                                                <pre className="text-xs whitespace-pre-wrap break-all text-gray-600 dark:text-gray-300">
                                                    {JSON.stringify(entry.metadata, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}

                    {nextCursor && !isLoading && (
                        <div className="flex justify-center pt-4">
                            <Button variant="plain" onClick={() => load(nextCursor, true)}>
                                Загрузить ещё
                            </Button>
                        </div>
                    )}
                </AdaptiveCard>
            </div>
        </SystemSettingsLayout>
    )
}

export default SystemAudit
