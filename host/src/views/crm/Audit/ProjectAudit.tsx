import { useState, useEffect, useMemo, useCallback } from 'react'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import usePermissionStatus from '@/utils/hooks/usePermissionStatus'
import { PiMagnifyingGlassDuotone, PiLockKeyDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Spinner from '@/components/ui/Spinner'
import Tag from '@/components/ui/Tag'
import Button from '@/components/ui/Button'
import { apiGetProjectAudit, type ProjectAuditEntry } from '@/services/CrmService'
import { qa } from '@/shared/qa'
import type { ColumnDef } from '@/components/shared/DataTable'

/**
 * Project audit `event_name` → human label. Mirrors the project-settings
 * «Аудит» tab (views/crm/Settings/Settings.tsx) and gateway `HISTORY_EVENT_LABELS`
 * / `crm.*` routing keys (shared/routing-keys.ts). Unknown actions fall back to
 * the raw event name.
 */
const EVENT_LABELS: Record<string, string> = {
    'crm.contact.created': 'Контакт создан',
    'crm.contact.updated': 'Изменены данные контакта',
    'crm.contact.deleted': 'Контакт удалён',
    'crm.contact.restored': 'Контакт восстановлен',
    'crm.contact.merged': 'Контакты объединены',
    'crm.contact.transferred': 'Контакт передан',
    'crm.company.created': 'Компания создана',
    'crm.company.updated': 'Изменены данные компании',
    'crm.company.deleted': 'Компания удалена',
    'crm.company.restored': 'Компания восстановлена',
    'crm.company.merged': 'Компании объединены',
    'crm.company.transferred': 'Компания передана',
    'crm.deal.created': 'Сделка создана',
    'crm.deal.updated': 'Сделка изменена',
    'crm.deal.deleted': 'Сделка удалена',
    'crm.deal.stage_changed': 'Изменена стадия сделки',
    'crm.deal.won': 'Сделка выиграна',
    'crm.deal.lost': 'Сделка проиграна',
    'crm.deal.assigned': 'Сделка назначена',
    'crm.deal.reassigned': 'Сделка переназначена',
    'crm.order.created': 'Заказ создан',
    'crm.order.updated': 'Заказ изменён',
    'crm.order.deleted': 'Заказ удалён',
    'crm.order.status_changed': 'Изменён статус заказа',
    'crm.order.stage_changed': 'Изменён этап заказа',
    'crm.order.cancelled': 'Заказ отменён',
    'crm.order_type.created': 'Создан тип продажи',
    'crm.order_type.updated': 'Изменён тип продажи',
    'crm.order_type.deleted': 'Удалён тип продажи',
    'crm.order_type.archived': 'Тип продажи архивирован',
    'crm.product.created': 'Продукт создан',
    'crm.product.updated': 'Продукт изменён',
    'crm.product.deleted': 'Продукт удалён',
    'crm.product.price_changed': 'Изменена цена продукта',
    'crm.product.archived': 'Продукт архивирован',
    'crm.product.restored': 'Продукт восстановлен',
    'crm.activity.created': 'Создана активность',
    'crm.activity.updated': 'Активность изменена',
    'crm.activity.deleted': 'Активность удалена',
    'crm.activity.completed': 'Активность завершена',
    'crm.activity.reassigned': 'Активность переназначена',
    'crm.import.completed': 'Импорт завершён',
    'chat.message.edited': 'Сообщение изменено',
    'chat.message.deleted': 'Сообщение удалено',
    'module.installed': 'Модуль установлен',
    'module.enabled': 'Модуль включён',
    'module.disabled': 'Модуль выключен',
    'module.uninstalled': 'Модуль удалён из проекта',
    'module.upgraded': 'Модуль обновлён',
    'module.runtime_resumed': 'Доставка модуля возобновлена',
}

/**
 * Журнал отдаёт routing-key (`control.module.enabled`); короткий `action`
 * (`module.enabled`) — запасной ключ из RoleAuditLog.
 */
const eventLabel = (action: string) =>
    EVENT_LABELS[action] ?? EVENT_LABELS[action.replace(/^control\./, '')] ?? action

const formatAuditTime = (value?: string | number): string => {
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

const auditActorName = (e: ProjectAuditEntry) => e.name || 'Система'

/** Short human summary from an audit entry's metadata / entity. */
const describeAudit = (e: ProjectAuditEntry): string => {
    const m = e.metadata ?? {}
    const pick = (...keys: string[]): string => {
        for (const k of keys) {
            const v = m[k]
            if (typeof v === 'string' && v) return v
            if (typeof v === 'number') return String(v)
        }
        return ''
    }
    const name = pick('name', 'title', 'fullName', 'displayName', 'companyName')
    if (name) return name
    const email = pick('email')
    if (email) return email
    const originalText = pick('originalText')
    if (originalText) {
        const preview =
            originalText.length > 80 ? `${originalText.slice(0, 80)}…` : originalText
        return `оригинал: ${preview}`
    }
    if (Array.isArray(m.changedFields) || Array.isArray(m.changes)) {
        const raw = (
            Array.isArray(m.changedFields) ? m.changedFields : m.changes
        ) as Record<string, unknown>[]
        const fields = raw
            .map((c) => (typeof c?.field === 'string' ? c.field : ''))
            .filter(Boolean)
        if (fields.length > 0) return `поля: ${fields.join(', ')}`
    }
    return e.entityType || '—'
}

/**
 * SCR-PROJECT-AUDIT — standalone project audit journal (`/audit`).
 * Real data from `GET /v1/projects/:id/audit/events` (the immutable audit chain,
 * projected from the `crm.*` bus). Client-side search + user/action filters over
 * the loaded rows. Loading/error/empty states mirror the settings «Аудит» tab.
 */
const ProjectAudit = () => {
    const projectId = useCurrentProjectId()
    // TODO-274: экран читает `GET /v1/projects/:id/audit/events`, который на
    // gateway закрыт `@RequirePermission('project','manage')`
    // (v1-data-bff.controller.ts). Гейт на клиенте — ТОТ ЖЕ (кнопка показывается
    // по тому же праву, что проверяет сервер), иначе рядовой участник открывает
    // экран и получает голый 403 вместо честной заглушки.
    const canManage = usePermission('project', 'manage')
    const { isLoading: permLoading, hasProject } = usePermissionStatus()
    const permissionDenied = hasProject && !permLoading && !canManage

    const [entries, setEntries] = useState<ProjectAuditEntry[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const [search, setSearch] = useState('')
    const [userFilter, setUserFilter] = useState('')
    const [actionFilter, setActionFilter] = useState('')

    const load = useCallback(async () => {
        if (!projectId) return
        // Fail-closed: без project:manage запрос не отправляем вовсе — иначе
        // экран под заглушкой всё равно спамит 403 в gateway.
        if (permissionDenied || permLoading) return
        setIsLoading(true)
        setError(null)
        try {
            const rows = await apiGetProjectAudit(projectId, 200)
            setEntries(Array.isArray(rows) ? rows : [])
        } catch (e) {
            console.error('Load project audit failed:', e)
            setError('Не удалось загрузить журнал аудита.')
        } finally {
            setIsLoading(false)
        }
    }, [projectId, permissionDenied, permLoading])

    useEffect(() => {
        load()
    }, [load])

    const users = useMemo(
        () => Array.from(new Set(entries.map((e) => auditActorName(e)))),
        [entries],
    )
    const actionOptions = useMemo(() => {
        const present = Array.from(new Set(entries.map((e) => e.action)))
        return present.map((a) => ({ value: a, label: eventLabel(a) }))
    }, [entries])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return entries.filter((entry) => {
            if (userFilter && auditActorName(entry) !== userFilter) return false
            if (actionFilter && entry.action !== actionFilter) return false
            if (q) {
                const haystack = [
                    auditActorName(entry),
                    eventLabel(entry.action),
                    describeAudit(entry),
                ]
                    .join(' ')
                    .toLowerCase()
                if (!haystack.includes(q)) return false
            }
            return true
        })
    }, [entries, search, userFilter, actionFilter])

    // Пока проекция прав в полёте — это ЗАГРУЗКА, а не «записей нет»
    // (запрос ещё не отправлен, см. `load`).
    const showLoading = isLoading || permLoading

    const hasActiveFilters = Boolean(search || userFilter || actionFilter)
    const resetFilters = () => {
        setSearch('')
        setUserFilter('')
        setActionFilter('')
    }

    const columns: ColumnDef<ProjectAuditEntry>[] = useMemo(
        () => [
            {
                header: 'Время',
                cell: ({ row }) => formatAuditTime(row.original.createdAt),
            },
            {
                header: 'Пользователь',
                cell: ({ row }) => (
                    <span className="font-medium">
                        {auditActorName(row.original)}
                    </span>
                ),
            },
            {
                header: 'Действие',
                cell: ({ row }) => (
                    <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        {eventLabel(row.original.action)}
                    </Tag>
                ),
            },
            {
                header: 'Объект',
                cell: ({ row }) => (
                    <span className="text-gray-600 dark:text-gray-400">
                        {describeAudit(row.original)}
                    </span>
                ),
            },
        ],
        [],
    )

    // ST-10 — нет права project:manage → честная заглушка вместо 403.
    if (permissionDenied) {
        return (
            <Container>
                <AdaptiveCard {...qa('host.projectAudit.denied')}>
                    <div className="flex flex-col items-center gap-2 py-10 text-center">
                        <PiLockKeyDuotone className="h-8 w-8 text-gray-400" />
                        <h4 className="text-base font-semibold">Нет доступа</h4>
                        <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
                            Журнал аудита проекта доступен только тем, у кого есть
                            право «Управление проектом» (project:manage).
                        </p>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <AdaptiveCard {...qa('host.projectAudit.root')}>
                <div className="flex flex-col gap-4">
                    <h3 className="text-xl font-semibold">Журнал аудита</h3>

                    <div className="flex flex-col md:flex-row gap-3 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                            <Input
                                {...qa('host.projectAudit.search')}
                                placeholder="Поиск по пользователю, действию, объекту..."
                                prefix={
                                    <PiMagnifyingGlassDuotone className="w-4 h-4" />
                                }
                                value={search}
                                {...qa('host.projectAudit.search')}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="w-[180px]" {...qa('host.projectAudit.userFilter')}>
                            <Select
                                {...qa('host.projectAudit.userFilter')}
                                isClearable
                                placeholder="Пользователь"
                                options={users.map((u) => ({
                                    value: u,
                                    label: u,
                                }))}
                                value={
                                    users
                                        .map((u) => ({ value: u, label: u }))
                                        .find((o) => o.value === userFilter) ??
                                    null
                                }
                                onChange={(opt) => setUserFilter(opt?.value ?? '')}
                            />
                        </div>
                        <div className="w-[220px]" {...qa('host.projectAudit.actionFilter')}>
                            <Select
                                {...qa('host.projectAudit.actionFilter')}
                                isClearable
                                placeholder="Тип действия"
                                options={actionOptions}
                                value={
                                    actionOptions.find(
                                        (o) => o.value === actionFilter,
                                    ) ?? null
                                }
                                onChange={(opt) =>
                                    setActionFilter(opt?.value ?? '')
                                }
                            />
                        </div>
                    </div>

                    {showLoading && (
                        <div className="flex justify-center py-12">
                            <Spinner size={40} />
                        </div>
                    )}
                    {error && !showLoading && (
                        <div className="flex flex-col items-start gap-3 py-4">
                            <p
                                {...qa('host.projectAudit.error')}
                                className="text-sm text-red-600 dark:text-red-400"
                            >
                                {error}
                            </p>
                            <Button
                                size="sm"
                                variant="solid"
                                {...qa('host.projectAudit.retry')}
                                onClick={() => void load()}
                            >
                                Повторить
                            </Button>
                        </div>
                    )}
                    {!showLoading && !error && filtered.length === 0 && (
                        <div {...qa('host.projectAudit.empty')} className="py-8 text-center">
                            {entries.length > 0 && hasActiveFilters ? (
                                <>
                                    <p className="text-sm text-gray-500">
                                        По заданным фильтрам записей не найдено.
                                    </p>
                                    <Button
                                        {...qa('host.projectAudit.filterReset')}
                                        className="mt-3"
                                        variant="plain"
                                        size="sm"
                                        {...qa('host.projectAudit.resetFilters')}
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

                    {!showLoading && !error && filtered.length > 0 && (
                        <DataTable
                            {...qa('host.projectAudit.table')}
                            columns={columns}
                            data={filtered}
                            qaIdPrefix="host.projectAudit"
                            pagingData={{
                                total: filtered.length,
                                pageIndex: 1,
                                pageSize: filtered.length || 10,
                            }}
                        />
                    )}
                </div>
            </AdaptiveCard>
        </Container>
    )
}

export default ProjectAudit
