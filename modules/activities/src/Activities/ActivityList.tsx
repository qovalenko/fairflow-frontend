import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import useSWR from 'swr'
import {
    PiPlusDuotone,
    PiMagnifyingGlassDuotone,
    PiListDuotone,
    PiCalendarDuotone as PiCalendarIcon,
    PiWarningDuotone,
    PiClockCountdownDuotone,
    PiListChecksDuotone,
    PiPhoneDuotone,
    PiUsersDuotone,
    PiNoteDuotone,
    PiSlidersHorizontalDuotone,
    PiDownloadDuotone,
    PiCheckCircleDuotone,
    PiTrashDuotone,
    PiXDuotone,
} from 'react-icons/pi'
import { CSVLink } from 'react-csv'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import Avatar from '@/components/ui/Avatar'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Dropdown from '@/components/ui/Dropdown'
import Checkbox from '@/components/ui/Checkbox'
import EntityCreateDrawer from '@/components/template/EntityCreateDrawer'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import CheckboxSelectDropdown from '@/components/shared/CheckboxSelectDropdown'
import DatePicker from '@/components/ui/DatePicker'
import {
    ACTIVITY_LIST_DATE_PRESETS,
    applyActivityListPreset,
    detectActivePreset,
    type ActivityListDatePreset,
} from './activity-list-presets'
import Segment from '@/components/ui/Segment'
import classNames from '@/components/ui/utils/classNames'
import useSegmentRouteTransition from '@/utils/hooks/useSegmentRouteTransition'
import { useRememberProfileDefaultView } from '@/utils/profile/rememberDefaultView'
import type { DatePickerRangeValue } from '@/components/ui/DatePicker/DatePickerRange'
import type { OnSortParam, ColumnDef } from '@/components/shared/DataTable'
import type {
    Activity,
    ActivityType,
    ActivityStatus,
    ProjectMember,
} from '@/@types/crm'
import { apiGetActivities, apiGetMembers, apiBulkActivities, newIdempotencyKey } from '@/services/CrmService'
import usePermission from '@/utils/hooks/usePermission'
import PermissionCheck from '@/components/shared/PermissionCheck'
import {
    ActivityEmptyState,
    ActivityEmptyFilterState,
    ActivityErrorState,
    ActivityNoPermissionState,
} from './ActivityStatePanels'
import { isOverdue as isActivityOverdue, toEpochMs } from './activityShared'
import { automationRuleBadge } from './created-by-rule'
import { qa } from '../qa'

/**
 * Окно «предстоящих» в днях — то же, что у домена дашборда
 * (`reports.service.ts`: dueAt ∈ [asOf; asOf + 7 дней], FR-MSTAT-12). Держим
 * равным, чтобы drill `?upcoming=1` открывал ровно тот же срез, что в виджете.
 */
const UPCOMING_WINDOW_DAYS = 7

/** Конфиг колонок для переключения видимости */
const ACTIVITY_COLUMN_CONFIG = [
    { id: 'type', label: 'Тип' },
    { id: 'title', label: 'Название' },
    { id: 'dueDate', label: 'Срок' },
    { id: 'priority', label: 'Приоритет' },
    { id: 'status', label: 'Статус' },
    { id: 'assigneeName', label: 'Ответственный' },
    { id: 'related', label: 'Связь' },
] as const

const ASSIGNEE_FILTER_UNASSIGNED = '__unassigned__'

const normalizeList = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[]
    if (
        value &&
        typeof value === 'object' &&
        'list' in value &&
        Array.isArray((value as { list?: unknown }).list)
    ) {
        return (value as { list: T[] }).list
    }
    return []
}

const toSafeString = (value: unknown): string => {
    if (
        value &&
        typeof value === 'object' &&
        'low' in value &&
        'high' in value &&
        'unsigned' in value
    ) {
        const raw = value as {
            low?: unknown
            high?: unknown
            unsigned?: unknown
        }
        const low = typeof raw.low === 'number' ? raw.low : Number(raw.low)
        const high = typeof raw.high === 'number' ? raw.high : Number(raw.high)
        if (Number.isFinite(low) && Number.isFinite(high)) {
            const lo = low >>> 0
            const n = high * 0x1_0000_0000 + lo
            if (Number.isFinite(n)) return String(n)
        }
    }
    if (typeof value === 'string') return value
    if (typeof value === 'number') return String(value)
    return ''
}

const toSafeNumber = (value: unknown): number | undefined => {
    if (
        value &&
        typeof value === 'object' &&
        'low' in value &&
        'high' in value &&
        'unsigned' in value
    ) {
        const raw = value as {
            low?: unknown
            high?: unknown
            unsigned?: unknown
        }
        const low = typeof raw.low === 'number' ? raw.low : Number(raw.low)
        const high = typeof raw.high === 'number' ? raw.high : Number(raw.high)
        if (Number.isFinite(low) && Number.isFinite(high)) {
            const lo = low >>> 0
            const n = high * 0x1_0000_0000 + lo
            if (Number.isFinite(n)) return n
        }
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed
    }
    return undefined
}

const normalizeActivity = (value: unknown): Activity | null => {
    if (!value || typeof value !== 'object') return null
    const raw = value as Record<string, unknown>

    const typeRaw = toSafeString(raw.type)
    const type: ActivityType =
        typeRaw === 'task' || typeRaw === 'call' || typeRaw === 'meeting' || typeRaw === 'note'
            ? typeRaw
            : 'task'

    const statusRaw = toSafeString(raw.status)
    const status: ActivityStatus =
        statusRaw === 'planned' ||
        statusRaw === 'in_progress' ||
        statusRaw === 'completed' ||
        statusRaw === 'cancelled'
            ? statusRaw
            : 'planned'

    const priorityRaw = toSafeString(raw.priority)
    const priority =
        priorityRaw === 'low' ||
        priorityRaw === 'medium' ||
        priorityRaw === 'high' ||
        priorityRaw === 'urgent'
            ? priorityRaw
            : 'medium'

    const assigneeName =
        toSafeString(raw.assigneeName) ||
        (raw.assignee && typeof raw.assignee === 'object'
            ? toSafeString((raw.assignee as Record<string, unknown>).name)
            : '')

    const dealName =
        toSafeString(raw.dealName) ||
        (raw.deal && typeof raw.deal === 'object'
            ? toSafeString((raw.deal as Record<string, unknown>).name)
            : '')

    const contactName =
        toSafeString(raw.contactName) ||
        (raw.contact && typeof raw.contact === 'object'
            ? toSafeString((raw.contact as Record<string, unknown>).name)
            : '')

    return {
        ...(raw as Activity),
        id: toSafeString(raw.id || raw._id),
        title: toSafeString(raw.title) || 'Без названия',
        type,
        status,
        priority,
        assigneeName: assigneeName || undefined,
        dealName: dealName || undefined,
        contactName: contactName || undefined,
        dueDate: toSafeNumber(raw.dueDate),
        createdAt: toSafeNumber(raw.createdAt) ?? 0,
        startDate: toSafeNumber(raw.startDate),
        endDate: toSafeNumber(raw.endDate),
    }
}

const typeConfig: Record<ActivityType, { icon: React.ReactNode; label: string }> = {
    task: { icon: <PiListChecksDuotone className="w-5 h-5" />, label: 'Задача' },
    call: { icon: <PiPhoneDuotone className="w-5 h-5" />, label: 'Звонок' },
    meeting: { icon: <PiUsersDuotone className="w-5 h-5" />, label: 'Встреча' },
    note: { icon: <PiNoteDuotone className="w-5 h-5" />, label: 'Заметка' },
}

const statusConfig: Record<ActivityStatus, { label: string; className: string }> = {
    planned: {
        label: 'Запланировано',
        className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    },
    in_progress: {
        label: 'В работе',
        className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    },
    completed: {
        label: 'Завершено',
        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    },
    cancelled: {
        label: 'Отменено',
        className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    },
}

const priorityConfig: Record<string, { label: string; className: string }> = {
    low: {
        label: 'Низкий',
        className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    },
    medium: {
        label: 'Средний',
        className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    },
    high: {
        label: 'Высокий',
        className: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    },
    urgent: {
        label: 'Срочный',
        className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    },
}

const ActivityList = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const location = useLocation()
    const isCalendarView = location.pathname.includes('/calendar')
    const can = usePermission()
    const canRead = can('activities', 'read')
    const canWrite = can('activities', 'write')
    const canExport = can('activities', 'export')
    const canDelete = can('activities', 'delete')

    const [searchParams, setSearchParams] = useSearchParams()
    const [overdueOnly, setOverdueOnly] = useState(searchParams.get('overdue') === '1')
    const [selectedTypes, setSelectedTypes] = useState<ActivityType[]>([])
    const [selectedActivities, setSelectedActivities] = useState<Set<string>>(new Set())
    const [taskDrawerOpen, setTaskDrawerOpen] = useState(false)
    const [bulkBusy, setBulkBusy] = useState(false)
    const bulkKeyRef = useRef<string | null>(null)
    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(ACTIVITY_COLUMN_CONFIG.map((c) => [c.id, true]))
    )
    const [statusFilter, setStatusFilter] = useState('')
    const [assigneeFilter, setAssigneeFilter] = useState(
        searchParams.get('assigneeId') ?? '',
    )
    // `?upcoming=1` — вторая половина drill-контракта дашборда (виджет
    // «Предстоящие» → «Показать все»). Отдельного серверного флага «предстоящие»
    // у ручки нет, но есть окно `dateFrom`/`dateTo` (gateway @Get('activities')),
    // а домен считает предстоящими незакрытые активности с dueAt в
    // [сейчас; +7 дней] (reports.service.ts: `status $nin [done,completed,
    // cancelled]`, FR-MSTAT-12). Принимаем ссылку этим окном: фильтр уходит НА
    // СЕРВЕР, виден в пикере периода и сбрасывается кнопкой «Сбросить фильтры» —
    // пользователь видит, что именно применено.
    // Ограничение честно: отсечь закрытые тем же запросом список не может —
    // ручка списка фильтра по статусу не принимает вовсе, поэтому в окне могут
    // оказаться и уже завершённые активности (статус виден в колонке). Это
    // надмножество виджета, а не другой срез; точное совпадение появится, когда
    // `GET /v1/activities` научится фильтру по статусу.
    const [dateRange, setDateRange] = useState<DatePickerRangeValue>(() =>
        searchParams.get('upcoming') === '1'
            ? [
                  dayjs().startOf('day').toDate(),
                  dayjs().add(UPCOMING_WINDOW_DAYS, 'day').endOf('day').toDate(),
              ]
            : [null, null],
    )

    const [tableData, setTableData] = useState({
        pageIndex: 1,
        pageSize: 10,
        query: '',
        sort: { order: '', key: '' },
    })

    // Deep-link с виджета/среза дашборда (?overdue=1 / ?upcoming=1 / ?assigneeId=...):
    // после применения к фильтрам очищаем query, чтобы не залипало при ручном сбросе.
    useEffect(() => {
        if (
            searchParams.get('overdue') ||
            searchParams.get('upcoming') ||
            searchParams.get('assigneeId')
        ) {
            const next = new URLSearchParams(searchParams)
            next.delete('overdue')
            next.delete('upcoming')
            next.delete('assigneeId')
            setSearchParams(next, { replace: true })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const dateFrom = dateRange[0] ? dayjs(dateRange[0]).startOf('day').valueOf() : undefined
    const dateTo = dateRange[1] ? dayjs(dateRange[1]).endOf('day').valueOf() : undefined

    const activeDatePreset = useMemo(
        () => detectActivePreset({ overdueOnly, dateFrom, dateTo }),
        [overdueOnly, dateFrom, dateTo],
    )

    const handleDatePreset = (preset: ActivityListDatePreset) => {
        if (activeDatePreset === preset) {
            setOverdueOnly(false)
            setDateRange([null, null])
        } else {
            const next = applyActivityListPreset(preset)
            setOverdueOnly(next.overdueOnly)
            setDateRange(next.dateRange)
        }
        setTableData((p) => ({ ...p, pageIndex: 1 }))
    }

    const { data, isLoading, error, mutate } = useSWR(
        canRead
            ? ['/api/v1/activities', tableData, overdueOnly, selectedTypes, statusFilter, assigneeFilter, dateFrom, dateTo]
            : null,
        () =>
            apiGetActivities<{ list: Activity[]; total: number }, Record<string, unknown>>({
                ...tableData,
                pageIndex: tableData.pageIndex - 1,
                overdueOnly,
                // Массив axios сериализует как types[]=…, Fastify без кастомного
                // парсера отдаёт ключ «types[]» — @Query('types') его не видит.
                // Шлём CSV: parseQueryTypes на gateway разбирает запятые.
                types: selectedTypes.length ? selectedTypes.join(',') : undefined,
                status: statusFilter,
                assigneeId:
                    assigneeFilter && assigneeFilter !== ASSIGNEE_FILTER_UNASSIGNED
                        ? assigneeFilter
                        : undefined,
                withoutAssignee: assigneeFilter === ASSIGNEE_FILTER_UNASSIGNED || undefined,
                dateFrom,
                dateTo,
                sortField: tableData.sort.key || undefined,
                sortOrder: tableData.sort.order || undefined,
            }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const { data: membersData } = useSWR(
        ['/api/v1/members'],
        () => apiGetMembers<ProjectMember[]>(),
        { revalidateOnFocus: false },
    )

    const list = normalizeList<unknown>(data?.list)
        .map(normalizeActivity)
        .filter((item): item is Activity => Boolean(item))
    const membersList = normalizeList<ProjectMember>(membersData)
    const total = toSafeNumber(data?.total) ?? 0
    const { pageIndex, pageSize } = tableData

    const hasActiveFilters =
        Boolean(tableData.query) ||
        overdueOnly ||
        selectedTypes.length > 0 ||
        Boolean(statusFilter) ||
        Boolean(assigneeFilter) ||
        Boolean(dateFrom) ||
        Boolean(dateTo)

    const resetFilters = () => {
        setOverdueOnly(false)
        setSelectedTypes([])
        setStatusFilter('')
        setAssigneeFilter('')
        setDateRange([null, null])
        setTableData((p) => ({ ...p, query: '', pageIndex: 1 }))
    }

    const showError = Boolean(error)
    const showEmpty = !isLoading && !showError && list.length === 0 && !hasActiveFilters
    const showEmptyFilter = !isLoading && !showError && list.length === 0 && hasActiveFilters

    const handlePaginationChange = (page: number) => {
        setTableData((prev) => ({ ...prev, pageIndex: page }))
    }

    const handleSelectChange = (size: number) => {
        setTableData((prev) => ({ ...prev, pageSize: size, pageIndex: 1 }))
    }

    const handleSort = (sort: OnSortParam) => {
        setTableData((prev) => ({
            ...prev,
            sort: { order: sort.order, key: String(sort.key) },
            pageIndex: 1,
        }))
    }

    const handleSearch = (value: string) => {
        setTableData((prev) => ({ ...prev, query: value, pageIndex: 1 }))
    }

    const rememberActivitiesView = useRememberProfileDefaultView('defaultActivitiesView')

    const navigateToView = (value: string) => {
        rememberActivitiesView(value)
        if (value === 'calendar') {
            navigate(`/activities/calendar`)
        } else {
            navigate(`/activities`)
        }
    }

    const [segmentValue, handleViewToggle] = useSegmentRouteTransition(
        isCalendarView ? 'calendar' : 'list',
        navigateToView,
    )

    const memberOptions = useMemo(
        () =>
            membersList
                .filter((m) => m && m.id)
                .map((m) => ({
                    value: String(m.id),
                    label: toSafeString(m.name) || 'Без имени',
                })),
        [membersList],
    )

    const assigneeFilterOptions = useMemo(
        () => [
            { value: ASSIGNEE_FILTER_UNASSIGNED, label: 'Без ответственного' },
            ...memberOptions,
        ],
        [memberOptions],
    )

    const statusOptions = [
        { value: 'planned', label: 'Запланировано' },
        { value: 'in_progress', label: 'В работе' },
        { value: 'completed', label: 'Завершено' },
        { value: 'cancelled', label: 'Отменено' },
    ]

    const typeOptions = [
        { value: 'task' as ActivityType, label: 'Задача', icon: <PiListChecksDuotone className="w-5 h-5" /> },
        { value: 'call' as ActivityType, label: 'Звонок', icon: <PiPhoneDuotone className="w-5 h-5" /> },
        { value: 'meeting' as ActivityType, label: 'Встреча', icon: <PiUsersDuotone className="w-5 h-5" /> },
        { value: 'note' as ActivityType, label: 'Заметка', icon: <PiNoteDuotone className="w-5 h-5" /> },
    ]

    const handleCheckBoxChange = (checked: boolean, activity: Activity) => {
        setSelectedActivities((prev) => {
            const next = new Set(prev)
            if (checked) next.add(activity.id)
            else next.delete(activity.id)
            return next
        })
    }

    const handleIndeterminateCheckBoxChange = (checked: boolean, rows: { original: Activity }[]) => {
        setSelectedActivities((prev) => {
            const next = new Set(prev)
            rows.forEach((row) => {
                if (checked) next.add(row.original.id)
                else next.delete(row.original.id)
            })
            return next
        })
    }

    const clearSelection = () => setSelectedActivities(new Set())

    // EL-LIST-22 — bulk-бар: массовое завершить/удалить (FR-MACT-30).
    // POST /api/activities/bulk; частичный успех (ST-8) — отчёт по записям.
    const runBulk = async (action: 'complete' | 'delete') => {
        const ids = Array.from(selectedActivities)
        if (ids.length === 0 || bulkBusy) return
        if (action === 'delete') {
            // eslint-disable-next-line no-alert
            if (!window.confirm(`Удалить выбранные активности (${ids.length})?`)) return
        }
        if (!bulkKeyRef.current) bulkKeyRef.current = newIdempotencyKey()
        setBulkBusy(true)
        try {
            const res = await apiBulkActivities<{
                succeeded?: string[]
                failed?: { id: string; code?: string; message?: string }[]
            }>({ action, ids, projectId: pid }, bulkKeyRef.current)
            bulkKeyRef.current = null
            const ok = res?.succeeded?.length ?? 0
            const failed = res?.failed ?? []
            const verb = action === 'complete' ? 'завершено' : 'удалено'
            if (failed.length === 0) {
                toast.push(
                    <Notification type="success">{`Готово: ${verb} ${ok}`}</Notification>,
                    { placement: 'top-center' },
                )
            } else {
                toast.push(
                    <Notification type="warning" duration={5000}>
                        {`${verb.charAt(0).toUpperCase() + verb.slice(1)}: ${ok}. Не удалось: ${failed.length}` +
                            (failed[0]?.message ? ` — ${failed[0].message}` : '')}
                    </Notification>,
                    { placement: 'top-center' },
                )
            }
            clearSelection()
            await mutate()
        } catch (e) {
            const err = e as {
                response?: { data?: { error?: { message?: string } } }
                message?: string
            }
            toast.push(
                <Notification type="danger">
                    {err?.response?.data?.error?.message ||
                        err?.message ||
                        'Не удалось выполнить массовую операцию'}
                </Notification>,
                { placement: 'top-center' },
            )
        } finally {
            setBulkBusy(false)
        }
    }

    const exportData = useMemo(() => {
        const toExport =
            selectedActivities.size > 0
                ? list.filter((a) => selectedActivities.has(a.id))
                : list
        return toExport.map((a) => ({
            Тип: typeConfig[a.type]?.label ?? a.type,
            Название: a.title,
            Срок: a.dueDate ? dayjs(toEpochMs(a.dueDate)).format('DD.MM.YYYY') : '',
            Приоритет: priorityConfig[a.priority]?.label ?? a.priority,
            Статус: statusConfig[a.status]?.label ?? a.status,
            Ответственный: a.assigneeName ?? '',
            Связь: a.dealName ?? a.contactName ?? '',
        }))
    }, [list, selectedActivities])

    const handleColumnVisibilityChange = (colId: string, checked: boolean) => {
        setVisibleColumns((prev) => {
            const next = { ...prev, [colId]: checked }
            const visibleCount = Object.values(next).filter(Boolean).length
            if (!checked && visibleCount <= 1) return prev
            return next
        })
    }

    const allColumns: ColumnDef<Activity>[] = useMemo(
        () => [
            {
                id: 'type',
                header: 'Тип',
                accessorKey: 'type',
                size: 130,
                cell: ({ row }) => {
                    const config = typeConfig[row.original.type]
                    return (
                        <span className="flex items-center gap-2">
                            {config.icon}
                            <span>{config.label}</span>
                        </span>
                    )
                },
            },
            {
                id: 'title',
                header: 'Название',
                accessorKey: 'title',
                cell: ({ row }) => {
                    const badge = automationRuleBadge(row.original.createdByRule)
                    return (
                        <div
                            className="flex flex-col gap-0.5"
                            {...qa('activities.list.row', {
                                activity: row.original.id,
                            })}
                        >
                            <span
                                className="text-primary"
                                {...qa('activities.list.rowTitle', {
                                    activity: row.original.id,
                                })}
                            >
                                {row.original.title}
                            </span>
                            {badge && (
                                <Tag
                                    className="w-fit text-[10px] bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200"
                                    {...qa('activities.list.rowRuleBadge', {
                                        activity: row.original.id,
                                    })}
                                >
                                    {badge}
                                </Tag>
                            )}
                        </div>
                    )
                },
            },
            {
                id: 'dueDate',
                header: 'Срок',
                accessorKey: 'dueDate',
                cell: ({ row }) => {
                    const activity = row.original
                    if (!activity.dueDate) return <span className="text-gray-400">—</span>
                    const isOverdue = isActivityOverdue(activity)
                    return (
                        <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                            {dayjs(toEpochMs(activity.dueDate)).format('DD.MM.YYYY')}
                            {isOverdue && (
                                <PiWarningDuotone className="w-3.5 h-3.5 inline ml-1" />
                            )}
                        </span>
                    )
                },
            },
            {
                id: 'priority',
                header: 'Приоритет',
                accessorKey: 'priority',
                cell: ({ row }) => {
                    const config = priorityConfig[row.original.priority] || priorityConfig.medium
                    return <Tag className={config.className}>{config.label}</Tag>
                },
            },
            {
                id: 'status',
                header: 'Статус',
                accessorKey: 'status',
                cell: ({ row }) => {
                    const config = statusConfig[row.original.status] || statusConfig.planned
                    return <Tag className={config.className}>{config.label}</Tag>
                },
            },
            {
                id: 'assigneeName',
                header: 'Ответственный',
                accessorKey: 'assigneeName',
                cell: ({ row }) => {
                    const name = row.original.assigneeName
                    if (!name) return <span>—</span>
                    const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2)
                    return (
                        <div className="flex items-center gap-2">
                            <Avatar
                                size={28}
                                className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex-shrink-0"
                            >
                                {initials}
                            </Avatar>
                            <span className="truncate">{name}</span>
                        </div>
                    )
                },
            },
            {
                header: 'Связь',
                id: 'related',
                cell: ({ row }) => {
                    const a = row.original
                    if (a.dealName) {
                        return (
                            <span
                                className="text-sm text-primary cursor-pointer"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(`/deals/${a.dealId}`)
                                }}
                                {...qa('activities.list.rowDealLink', {
                                    activity: a.id,
                                })}
                            >
                                {a.dealName}
                            </span>
                        )
                    }
                    if (a.contactName) {
                        return (
                            <span
                                className="text-sm text-primary cursor-pointer"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(`/contacts/${a.contactId}`)
                                }}
                                {...qa('activities.list.rowContactLink', {
                                    activity: a.id,
                                })}
                            >
                                {a.contactName}
                            </span>
                        )
                    }
                    return <span className="text-gray-400">—</span>
                },
            },
        ],
        [navigate, pid],
    )

    const columns = useMemo(
        () =>
            allColumns.filter((col) => {
                const colId = (col as { id?: string }).id ?? (col as { accessorKey?: string }).accessorKey
                return colId ? visibleColumns[colId] !== false : true
            }),
        [allColumns, visibleColumns]
    )

    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <ActivityNoPermissionState />
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <AdaptiveCard>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h3>Активности</h3>
                        <div className="flex items-center gap-2">
                            {canWrite && selectedActivities.size > 0 && (
                                <Tooltip title="Поставить задачу">
                                    <span className="inline-flex">
                                        <Button
                                            variant="solid"
                                            size="sm"
                                            className="bg-yellow-500 hover:bg-yellow-600 text-white"
                                            icon={<PiListChecksDuotone />}
                                            onClick={() => setTaskDrawerOpen(true)}
                                            {...qa('activities.list.createTask')}
                                        />
                                    </span>
                                </Tooltip>
                            )}
                            <PermissionCheck subject="activities" action="write">
                                <Tooltip title="Создать активность">
                                    <span className="inline-flex">
                                        <Button
                                            variant="solid"
                                            color="primary"
                                            size="sm"
                                            icon={<PiPlusDuotone />}
                                            onClick={() => navigate(`/activities/new`)}
                                            {...qa('activities.list.create')}
                                        />
                                    </span>
                                </Tooltip>
                            </PermissionCheck>
                            {canExport && (
                            <Tooltip
                                title={
                                    selectedActivities.size > 0
                                        ? `Экспорт в CSV (выбрано: ${selectedActivities.size})`
                                        : 'Выберите активности для экспорта'
                                }
                            >
                                <span className="inline-flex">
                                    {selectedActivities.size > 0 ? (
                                        <CSVLink
                                            data={exportData}
                                            filename={`активности_${dayjs().format('YYYY-MM-DD')}.csv`}
                                            className="inline-flex"
                                        >
                                            <Button
                                                variant="plain"
                                                size="sm"
                                                icon={<PiDownloadDuotone />}
                                                {...qa('activities.list.export')}
                                            />
                                        </CSVLink>
                                    ) : (
                                        <Button
                                            variant="plain"
                                            size="sm"
                                            icon={<PiDownloadDuotone />}
                                            disabled
                                            {...qa('activities.list.export')}
                                        />
                                    )}
                                </span>
                            </Tooltip>
                            )}
                            {canDelete ? (
                            <Tooltip title="Корзина">
                                <span className="inline-flex">
                                    <Button
                                        variant="plain"
                                        size="sm"
                                        icon={<PiTrashDuotone />}
                                        onClick={() => navigate(`/activities/trash`)}
                                        {...qa('activities.list.trash')}
                                    />
                                </span>
                            </Tooltip>
                            ) : (
                            <Tooltip title="Нужно право activities:delete">
                                <span className="inline-flex">
                                    <Button
                                        variant="plain"
                                        size="sm"
                                        icon={<PiTrashDuotone />}
                                        disabled
                                        {...qa('activities.list.trash')}
                                    />
                                </span>
                            </Tooltip>
                            )}
                            <Tooltip title="Колонки таблицы">
                                <span className="inline-flex">
                                    <Dropdown
                                        renderTitle={
                                            <Button
                                                variant="plain"
                                                size="sm"
                                                icon={<PiSlidersHorizontalDuotone />}
                                                {...qa('activities.list.columns')}
                                            />
                                        }
                                        placement="bottom-end"
                                        menuClass="!min-w-[200px] !p-3"
                                    >
                                        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1">
                                            Видимость колонок
                                        </div>
                                        {ACTIVITY_COLUMN_CONFIG.map((col) => (
                                        <Dropdown.Item key={col.id} variant="custom" className="!p-0">
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleColumnVisibilityChange(
                                                        col.id,
                                                        visibleColumns[col.id] === false
                                                    )
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault()
                                                        e.stopPropagation()
                                                        handleColumnVisibilityChange(
                                                            col.id,
                                                            visibleColumns[col.id] === false
                                                        )
                                                    }
                                                }}
                                                {...qa('activities.list.columnToggle', {
                                                    column: col.id,
                                                })}
                                            >
                                                <Checkbox
                                                    checked={visibleColumns[col.id] !== false}
                                                    readOnly
                                                />
                                                <span className="text-sm">{col.label}</span>
                                            </div>
                                        </Dropdown.Item>
                                    ))}
                                    </Dropdown>
                                </span>
                            </Tooltip>
                            <Segment
                                value={segmentValue}
                                onChange={(val) => handleViewToggle(val as string)}
                                size="sm"
                            >
                                <Segment.Item
                                    value="list"
                                    {...qa('activities.list.viewList')}
                                >
                                    <div className="flex items-center gap-1">
                                        <PiListDuotone className="w-4 h-4" />
                                        <span>Список</span>
                                    </div>
                                </Segment.Item>
                                <Segment.Item
                                    value="calendar"
                                    {...qa('activities.list.viewCalendar')}
                                >
                                    <div className="flex items-center gap-1">
                                        <PiCalendarIcon className="w-4 h-4" />
                                        <span>Календарь</span>
                                    </div>
                                </Segment.Item>
                            </Segment>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="flex-1 min-w-[200px] max-w-md">
                            <Input
                                placeholder="Поиск..."
                                prefix={<PiMagnifyingGlassDuotone className="w-4 h-4" />}
                                value={tableData.query}
                                onChange={(e) => handleSearch(e.target.value)}
                                {...qa('activities.list.search')}
                            />
                        </div>
                        <div
                            className="w-[250px] min-w-[250px]"
                            {...qa('activities.list.dateRange')}
                        >
                            <DatePicker.DatePickerRange
                                placeholder="Период"
                                value={dateRange}
                                onChange={(val) => {
                                    setDateRange(val)
                                    setOverdueOnly(false)
                                    setTableData((p) => ({ ...p, pageIndex: 1 }))
                                }}
                                inputFormat="DD.MM.YYYY"
                                separator=" — "
                                size="md"
                                locale="ru"
                                closePickerOnChange={true}
                            />
                        </div>
                        <div
                            className="w-[180px]"
                            {...qa('activities.list.typeFilter')}
                        >
                            <CheckboxSelectDropdown
                                placeholder="Тип"
                                options={typeOptions}
                                value={selectedTypes}
                                onChange={(vals) => {
                                    setSelectedTypes(vals as ActivityType[])
                                    setTableData((p) => ({ ...p, pageIndex: 1 }))
                                }}
                            />
                        </div>
                        <div
                            className="w-[180px]"
                            {...qa('activities.list.statusFilter')}
                        >
                            <Select
                                placeholder="Статус"
                                isClearable
                                options={statusOptions}
                                value={statusOptions.find((o) => o.value === statusFilter) || null}
                                onChange={(option) => setStatusFilter(option?.value || '')}
                            />
                        </div>
                        <div
                            className="w-[180px]"
                            {...qa('activities.list.assigneeFilter')}
                        >
                            <Select
                                placeholder="Ответственный"
                                isClearable
                                options={assigneeFilterOptions}
                                value={
                                    assigneeFilterOptions.find(
                                        (o) => o.value === assigneeFilter,
                                    ) || null
                                }
                                onChange={(option) => {
                                    setAssigneeFilter(option?.value || '')
                                    setTableData((p) => ({ ...p, pageIndex: 1 }))
                                }}
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {ACTIVITY_LIST_DATE_PRESETS.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => handleDatePreset(preset.id)}
                                    className={classNames(
                                        'flex items-center gap-2 min-h-12 px-3 rounded-xl border transition-colors text-sm font-semibold',
                                        activeDatePreset === preset.id
                                            ? preset.id === 'overdue'
                                                ? 'border-red-200 dark:border-red-800 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                                : 'border-primary/40 bg-primary/10 text-primary'
                                            : 'border-gray-100 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600',
                                    )}
                                    {...qa('activities.list.datePreset', {
                                        preset: preset.id,
                                    })}
                                >
                                    {preset.id === 'overdue' ? (
                                        <PiClockCountdownDuotone className="w-4 h-4 shrink-0" />
                                    ) : null}
                                    <span>{preset.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {selectedActivities.size > 0 && (
                        <div
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5"
                            {...qa('activities.list.bulkBar')}
                        >
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <span {...qa('activities.list.bulkCount')}>
                                    Выбрано: {selectedActivities.size}
                                </span>
                                <Button
                                    size="xs"
                                    variant="plain"
                                    icon={<PiXDuotone />}
                                    onClick={clearSelection}
                                    {...qa('activities.list.bulkClear')}
                                >
                                    Снять
                                </Button>
                            </div>
                            <div className="flex items-center gap-2">
                                {canWrite && (
                                    <Button
                                        size="sm"
                                        variant="solid"
                                        color="primary"
                                        loading={bulkBusy}
                                        icon={<PiCheckCircleDuotone />}
                                        onClick={() => runBulk('complete')}
                                        {...qa('activities.list.bulkComplete')}
                                    >
                                        Завершить
                                    </Button>
                                )}
                                {canDelete ? (
                                    <Button
                                        size="sm"
                                        variant="default"
                                        loading={bulkBusy}
                                        icon={<PiTrashDuotone />}
                                        onClick={() => runBulk('delete')}
                                        {...qa('activities.list.bulkDelete')}
                                    >
                                        Удалить
                                    </Button>
                                ) : (
                                    <Tooltip title="Нужно право activities:delete">
                                        <span className="inline-flex">
                                            <Button
                                                size="sm"
                                                variant="default"
                                                disabled
                                                icon={<PiTrashDuotone />}
                                                {...qa('activities.list.bulkDelete')}
                                            >
                                                Удалить
                                            </Button>
                                        </span>
                                    </Tooltip>
                                )}
                            </div>
                        </div>
                    )}

                    {showError ? (
                        <ActivityErrorState onRetry={() => mutate()} />
                    ) : showEmpty ? (
                        <ActivityEmptyState
                            onCreate={
                                canWrite ? () => navigate(`/activities/new`) : undefined
                            }
                        />
                    ) : showEmptyFilter ? (
                        <ActivityEmptyFilterState onReset={resetFilters} />
                    ) : (
                        <DataTable
                            columns={columns}
                            data={list}
                            loading={isLoading}
                            pagingData={{ total, pageIndex, pageSize }}
                            onPaginationChange={handlePaginationChange}
                            onSelectChange={handleSelectChange}
                            onSort={handleSort}
                            selectable
                            checkboxChecked={(a) => selectedActivities.has(a.id)}
                            onCheckBoxChange={handleCheckBoxChange}
                            onIndeterminateCheckBoxChange={handleIndeterminateCheckBoxChange}
                            indeterminateCheckboxChecked={(rows) =>
                                rows.length > 0 && rows.every((r) => selectedActivities.has((r.original as Activity).id))
                            }
                            onRowClick={(a) => navigate(`/activities/${a.id}`)}
                            qaIdPrefix="activities.list"
                            rowQaKey="activity"
                        />
                    )}
                </div>
            </AdaptiveCard>

            <EntityCreateDrawer
                entityType="task"
                isOpen={taskDrawerOpen}
                onClose={() => setTaskDrawerOpen(false)}
                onSuccess={() => {
                    setTaskDrawerOpen(false)
                    setSelectedActivities(new Set())
                }}
                taskInitialData={
                    selectedActivities.size > 0
                        ? (() => {
                              const first = list.find((a) => selectedActivities.has(a.id))
                              return first
                                  ? {
                                        contactId: first.contactId,
                                        companyId: first.companyId,
                                        dealId: first.dealId,
                                        orderId: first.orderId,
                                    }
                                  : undefined
                          })()
                        : undefined
                }
            />
        </Container>
    )
}

export default ActivityList
