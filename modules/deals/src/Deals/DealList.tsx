import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import { useSessionUser } from '@/store/authStore'
import useSWR from 'swr'
import dayjs from 'dayjs'
import cloneDeep from 'lodash/cloneDeep'
import { AnimatePresence, motion } from 'framer-motion'
import {
    PiPlusDuotone,
    PiListChecksDuotone,
    PiMagnifyingGlassDuotone,
    PiListDuotone,
    PiKanbanDuotone,
    PiUploadDuotone,
    PiUserMinusDuotone,
    PiSlidersHorizontalDuotone,
    PiDownloadDuotone,
    PiChartLineUpDuotone,
    PiTrashDuotone,
    PiDotsThreeVerticalDuotone,
} from 'react-icons/pi'
import { CSVLink } from 'react-csv'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import HostSlot from '@/components/shared/HostSlot'
import Avatar from '@/components/ui/Avatar'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Drawer from '@/components/ui/Drawer'
import EntityCreateDrawer from '@/components/template/EntityCreateDrawer'
import Select from '@/components/ui/Select'
import Dropdown from '@/components/ui/Dropdown'
import useSegmentRouteTransition from '@/utils/hooks/useSegmentRouteTransition'
import { useRememberProfileDefaultView } from '@/utils/profile/rememberDefaultView'
import Checkbox from '@/components/ui/Checkbox'
import Switcher from '@/components/ui/Switcher'
import Segment from '@/components/ui/Segment'
import classNames from '@/components/ui/utils/classNames'
import usePermission from '@/utils/hooks/usePermission'
import type { OnSortParam, ColumnDef } from '@/components/shared/DataTable'
import type { Deal, Pipeline, PipelineStage, Company, Contact, ProjectMember, DealSource, Product } from '@/@types/crm'
import { apiGetDeals, apiGetPipelines, apiGetCompanies, apiGetContacts, apiGetMembers, apiGetDealSources, apiGetProducts, apiCreateDeal } from '@/services/CrmService'
import BulkPanel from './BulkPanel'
import {
    EMPTY_DEAL_FORM,
    OverdueBadge,
    StalledBadge,
    daysOnStageCount,
    buildCreateDealPayload,
    extractError,
    hasLightLeadIdentity,
    isOverdue,
    notifyError,
    notifySuccess,
} from './dealUtils'
import type { DealCreateForm, LeadMode } from './dealUtils'
import { qa } from '../qa'
import { makeSelectOption } from '../selectQa'
import { DEALS_IMPORT_ENABLED } from '../featureFlags'

/** Конфиг колонок для переключения видимости */
const DEAL_COLUMN_CONFIG = [
    // Название сделки — собственное имя записи, её опознавательный признак в списке.
    // Его в таблице не было вовсе: строки различались только компанией/суммой, а две
    // сделки одного клиента в списке были неразличимы.
    { id: 'name', label: 'Название' },
    { id: 'companyName', label: 'Компания' },
    { id: 'productName', label: 'Продукт' },
    { id: 'amount', label: 'Сумма' },
    { id: 'stageName', label: 'Стадия' },
    { id: 'stageEnteredAt', label: 'Дней на стадии' },
    { id: 'contactName', label: 'Контакт' },
    { id: 'source', label: 'Источник' },
    { id: 'assigneeName', label: 'Ответственный' },
    { id: 'expectedCloseDate', label: 'Ожидаемая дата закрытия' },
] as const

const DEAL_LIST_TOOLBAR_ANIMATE_KEY = 'crm:deals:list-toolbar-animate'

/**
 * Значения = lifecycle-статусы домена (pipe хранит status: open/won/lost) —
 * фильтр уходит на сервер как `status` (gateway `GET /v1/deals?status=`).
 * Вынесено на модульный уровень: тем же списком валидируется значение,
 * пришедшее в URL (deep-link), — незнакомый статус на сервер не уходит.
 */
const DEAL_STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: 'open', label: 'Активная' },
    { value: 'won', label: 'Выиграна' },
    { value: 'lost', label: 'Проиграна' },
]

/**
 * Фильтры, которые список принимает из URL (deep-link с дашборда/аналитики,
 * FR-MSTAT-24) — РОВНО те, что gateway `listDeals` принимает как query
 * (`pipelineId/stageId/assigneeId/source/status/query`,
 * `gateway/src/bff/crm-bff.controller.ts` @Get('deals')). Параметров периода
 * (`period/from/to`) в этом списке нет: ручка сделок не умеет фильтровать по
 * created-at, а клиентский повтор фильтра врал бы на пагинации — поэтому
 * статистика их и не эмитит (см. Dashboard.tsx/Analytics.tsx).
 */
const DEAL_URL_FILTER_KEYS = [
    'query',
    'pipelineId',
    'stageId',
    'assigneeId',
    'source',
    'status',
] as const

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

const stageColors: Record<string, string> = {
    'Обращение': 'bg-gray-100 text-gray-700',
    'Квалификация': 'bg-blue-100 text-blue-700',
    'КП': 'bg-purple-100 text-purple-700',
    'Переговоры': 'bg-amber-100 text-amber-700',
    'Согласование': 'bg-orange-100 text-orange-700',
    'Закрыто (Won)': 'bg-emerald-100 text-emerald-700',
    'Закрыто (Lost)': 'bg-red-100 text-red-700',
}

const DealList = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams, setSearchParams] = useSearchParams()
    const pid = useCurrentProjectId()
    const currentUserId = useSessionUser((s) => s.user)?.userId ?? undefined
    const can = usePermission()
    const canWrite = can('deals', 'write')
    const canExport = can('deals', 'export')
    const canImport = can('deals', 'import')
    const canDelete = can('deals', 'delete')
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const [taskDrawerOpen, setTaskDrawerOpen] = useState(false)
    const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())
    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(DEAL_COLUMN_CONFIG.map((c) => [c.id, true]))
    )
    // Deep-link с дашборда/аналитики (FR-MSTAT-24): фильтры засеваются из URL
    // ОДИН раз при инициализации — иначе клик по стадии/источнику/менеджеру
    // открывал НЕотфильтрованный список (ссылка эмитилась, но не принималась).
    // Дальше состояние живёт локально, как и раньше: пользовательская фильтрация
    // работает поверх засеянных значений.
    const [tableData, setTableData] = useState(() => ({
        pageIndex: 1,
        pageSize: 10,
        query: searchParams.get('query') ?? '',
        pipelineId: searchParams.get('pipelineId') ?? '',
        stageId: searchParams.get('stageId') ?? '',
        assigneeId: searchParams.get('assigneeId') ?? '',
        source: searchParams.get('source') ?? '',
        // Незнакомый статус из URL отбрасываем: на сервер должен уходить только
        // lifecycle-статус домена (open/won/lost), иначе фильтр молча пустой.
        status: DEAL_STATUS_OPTIONS.some(
            (o) => o.value === searchParams.get('status'),
        )
            ? (searchParams.get('status') as string)
            : '',
        daysOnStage: '',
        withoutAssignee: false,
        sort: { order: '', key: '' },
    }))

    // Засеянные параметры убираем из URL (как это уже делает ActivityList):
    // состояние фильтров дальше локальное, и адрес не должен противоречить
    // тому, что реально применено после ручной правки фильтров. `mine`
    // остаётся — он URL-driven по FR-MDEAL-95.
    useEffect(() => {
        if (!DEAL_URL_FILTER_KEYS.some((k) => searchParams.has(k))) return
        const next = new URLSearchParams(searchParams)
        DEAL_URL_FILTER_KEYS.forEach((k) => next.delete(k))
        setSearchParams(next, { replace: true })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const isKanbanView = location.pathname.includes('/kanban')

    // FR-MDEAL-95 «Только мои»: переиспользуем УЖЕ работающий серверный фильтр
    // assigneeId (gateway listDeals → pipe filters.assigneeId), а состояние
    // держим в URL (?mine=1), чтобы ссылка/перезагрузка сохраняли выбор.
    const onlyMine = searchParams.get('mine') === '1'
    const handleOnlyMineChange = (checked: boolean) => {
        const next = new URLSearchParams(searchParams)
        if (checked) next.set('mine', '1')
        else next.delete('mine')
        setSearchParams(next, { replace: true })
        // «Только мои» и «Без владельца» взаимоисключающи — иначе пересечение
        // всегда пустое и пользователь видит «ничего не найдено» без причины.
        setTableData((prev) => ({
            ...prev,
            pageIndex: 1,
            withoutAssignee: checked ? false : prev.withoutAssignee,
        }))
    }
    // Пока userId не поднят из сессии — тумблер недоступен: иначе он бы отправил
    // пустой assigneeId и показал ЧУЖИЕ сделки под видом «моих».
    const onlyMineAvailable = Boolean(currentUserId)
    const effectiveAssigneeId =
        onlyMine && currentUserId ? currentUserId : tableData.assigneeId

    // Явный список query-параметров вместо `...tableData`: сервер понимает только
    // их (query/pipelineId/stageId/assigneeId/status/source), остальное — клиентские
    // фильтры, которые в URL запроса не нужны.
    const dealsQuery = useMemo(
        () => ({
            projectId: pid ?? '',
            pageIndex: tableData.pageIndex - 1,
            pageSize: tableData.pageSize,
            query: tableData.query || undefined,
            pipelineId: tableData.pipelineId || undefined,
            stageId: tableData.stageId || undefined,
            assigneeId: effectiveAssigneeId || undefined,
            status: tableData.status || undefined,
            source: tableData.source || undefined,
            stageDaysMin: tableData.daysOnStage
                ? Number.parseInt(tableData.daysOnStage, 10) || undefined
                : undefined,
            minDaysOnStage: tableData.daysOnStage
                ? Number.parseInt(tableData.daysOnStage, 10) || undefined
                : undefined,
            withoutAssignee: tableData.withoutAssignee || undefined,
        }),
        [
            pid,
            tableData.pageIndex,
            tableData.pageSize,
            tableData.query,
            tableData.pipelineId,
            tableData.stageId,
            tableData.status,
            tableData.source,
            tableData.daysOnStage,
            tableData.withoutAssignee,
            effectiveAssigneeId,
        ],
    )

    const {
        data,
        isLoading: fetching,
        error,
        mutate,
    } = useSWR(
        pid ? ['/api/v1/deals', dealsQuery] : null,
        () =>
            apiGetDeals<{ list: Deal[]; total: number; hiddenByPolicy?: number }, typeof dealsQuery>(dealsQuery),
        { revalidateOnFocus: false, shouldRetryOnError: false }
    )
    // Проект ещё не разрешён → запроса нет; это ЗАГРУЗКА, а не «сделок нет»,
    // иначе на первом кадре мигает пустое состояние ST-3.
    const isLoading = fetching || !pid

    const { data: pipelinesData } = useSWR(
        ['/api/v1/pipelines'],
        () => apiGetPipelines<Pipeline[]>(),
        { revalidateOnFocus: false }
    )

    const { data: companiesData } = useSWR(
        pid ? ['/v1/companies', pid, { pageSize: 1000 }] : null,
        () => apiGetCompanies<{ list: Company[]; total: number }, { pageSize: number; projectId: string }>({ pageSize: 1000, projectId: pid! }),
        { revalidateOnFocus: false }
    )

    const { data: contactsData } = useSWR(
        pid ? ['/v1/contacts', pid, { pageSize: 1000 }] : null,
        () => apiGetContacts<{ list: Contact[]; total: number }, { pageSize: number; projectId: string }>({ pageSize: 1000, projectId: pid! }),
        { revalidateOnFocus: false }
    )

    const { data: membersData } = useSWR(
        ['/api/v1/members'],
        () => apiGetMembers<ProjectMember[]>(),
        { revalidateOnFocus: false }
    )

    const { data: sourcesData } = useSWR(
        ['/api/v1/deal-sources'],
        () => apiGetDealSources<DealSource[]>(),
        { revalidateOnFocus: false }
    )

    const { data: productsData } = useSWR(
        pid ? ['/api/v1/products', pid, { pageSize: 1000 }] : null,
        () =>
            apiGetProducts<
                { list: Product[]; total: number },
                { pageSize: number; projectId: string }
            >({ pageSize: 1000, projectId: pid! }),
        { revalidateOnFocus: false },
    )

    const list = data?.list || []
    const membersList = normalizeList<ProjectMember>(membersData)
    const dealSourcesList = normalizeList<DealSource>(sourcesData)

    // Бэкенд отдаёт в assigneeName/assigneeId сырой uuid пользователя. Резолвим его
    // в имя по списку участников проекта; если участник не найден — показываем uuid как есть.
    const memberNameById = useMemo(() => {
        const map = new Map<string, string>()
        membersList.forEach((m) => map.set(m.id, m.name))
        return map
    }, [membersList])

    const resolveAssigneeName = useCallback(
        (deal: { assigneeId?: string; assigneeName?: string }): string => {
            const { assigneeId, assigneeName } = deal
            return (
                (assigneeId && memberNameById.get(assigneeId)) ||
                (assigneeName && memberNameById.get(assigneeName)) ||
                assigneeName ||
                ''
            )
        },
        [memberNameById]
    )
    const total = data?.total || 0
    const hiddenByPolicy = data?.hiddenByPolicy ?? 0
    const { pageIndex, pageSize } = tableData

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

    const handleStageFilter = (value: string) => {
        setTableData((prev) => ({ ...prev, stageId: value, pageIndex: 1 }))
    }

    const handleAssigneeFilter = (value: string) => {
        setTableData((prev) => ({ ...prev, assigneeId: value, pageIndex: 1 }))
    }

    const handleSourceFilter = (value: string) => {
        setTableData((prev) => ({ ...prev, source: value, pageIndex: 1 }))
    }

    const handleStatusFilter = (value: string) => {
        setTableData((prev) => ({ ...prev, status: value, pageIndex: 1 }))
    }

    const rememberDealsView = useRememberProfileDefaultView('defaultDealsView')

    const navigateToView = (value: string) => {
        rememberDealsView(value)
        if (value === 'kanban') {
            navigate(`/deals/kanban`)
        } else {
            navigate(`/deals`)
        }
    }

    const [segmentValue, handleViewToggle] = useSegmentRouteTransition(
        isKanbanView ? 'kanban' : 'list',
        navigateToView,
    )
    const shouldAnimateListToolbarRef = useRef(
        typeof window !== 'undefined' &&
            window.sessionStorage.getItem(DEAL_LIST_TOOLBAR_ANIMATE_KEY) === '1',
    )

    if (shouldAnimateListToolbarRef.current) {
        window.sessionStorage.removeItem(DEAL_LIST_TOOLBAR_ANIMATE_KEY)
    }

    const handlePipelineFilter = (value: string) => {
        setTableData((prev) => ({ ...prev, pipelineId: value, pageIndex: 1 }))
    }

    const handleDaysOnStageFilter = (value: string) => {
        setTableData((prev) => ({ ...prev, daysOnStage: value, pageIndex: 1 }))
    }

    const handleWithoutAssigneeFilter = (checked: boolean) => {
        setTableData((prev) => ({ ...prev, withoutAssignee: checked, pageIndex: 1 }))
    }

    const handleCheckBoxChange = (checked: boolean, deal: Deal) => {
        setSelectedDeals((prev) => {
            const newSet = new Set(prev)
            if (checked) {
                newSet.add(deal.id)
            } else {
                newSet.delete(deal.id)
            }
            return newSet
        })
    }

    const handleIndeterminateCheckBoxChange = (checked: boolean, rows: unknown[]) => {
        setSelectedDeals((prev) => {
            const newSet = new Set(prev)
            if (checked) {
                rows.forEach((row: any) => {
                    if (row.original) {
                        newSet.add(row.original.id)
                    }
                })
            } else {
                rows.forEach((row: any) => {
                    if (row.original) {
                        newSet.delete(row.original.id)
                    }
                })
            }
            return newSet
        })
    }

    // Get all stages from pipelines for filter
    const stageOptions = useMemo(() => {
        if (!pipelinesData) return []
        const stages: { value: string; label: string }[] = []
        pipelinesData.forEach((pipeline) => {
            pipeline.stages.forEach((stage) => {
                if (!stages.find((s) => s.value === stage.id)) {
                    stages.push({ value: stage.id, label: stage.name })
                }
            })
        })
        return stages.sort((a, b) => a.label.localeCompare(b.label))
    }, [pipelinesData])

    // pipelineId/stageId/assigneeId/status/source/query/daysOnStage/withoutAssignee
    // фильтрует СЕРВЕР — клиентский повтор ломает pagingTotal (FR-SEARCH-390).
    const filteredList = list
    // Any filter at all — to distinguish ST-3 (truly empty) from ST-4 (filtered out).
    const hasActiveFilters = Boolean(
        tableData.query ||
            tableData.pipelineId ||
            tableData.stageId ||
            effectiveAssigneeId ||
            tableData.source ||
            tableData.status ||
            tableData.daysOnStage ||
            tableData.withoutAssignee,
    )

    const pagingTotal = total

    const resetFilters = () => {
        handleOnlyMineChange(false)
        setTableData((prev) => ({
            ...prev,
            query: '',
            pipelineId: '',
            stageId: '',
            assigneeId: '',
            source: '',
            status: '',
            daysOnStage: '',
            withoutAssignee: false,
            pageIndex: 1,
        }))
    }

    const exportData = useMemo(() => {
        const toExport =
            selectedDeals.size > 0
                ? filteredList.filter((d) => selectedDeals.has(d.id))
                : filteredList
        return toExport.map((d) => ({
            Название: d.name ?? '',
            Компания: d.companyName ?? '',
            Продукт: d.productName ?? '',
            Сумма: d.amount,
            Валюта: d.currency ?? 'RUB',
            Стадия: d.stageName,
            Контакт: d.contactName ?? '',
            Источник: d.source ?? '',
            Ответственный: resolveAssigneeName(d),
            'Ожидаемая дата закрытия': d.expectedCloseDate
                ? dayjs.unix(d.expectedCloseDate).format('DD.MM.YYYY')
                : '',
            Просрочена: isOverdue(d) ? 'да' : 'нет',
        }))
    }, [filteredList, selectedDeals, resolveAssigneeName])

    const handleColumnVisibilityChange = (colId: string, checked: boolean) => {
        setVisibleColumns((prev) => {
            const next = { ...prev, [colId]: checked }
            const visibleCount = Object.values(next).filter(Boolean).length
            if (!checked && visibleCount <= 1) return prev
            return next
        })
    }

    const allColumns: ColumnDef<Deal>[] = useMemo(
        () => [
            {
                id: 'select',
                header: '',
                size: 48,
                cell: ({ row }) => {
                    const deal = row.original
                    return (
                        <div onClick={(e) => e.stopPropagation()} {...qa('deals.list.select', { deal: deal.id })}>
                            <Checkbox
                                checked={selectedDeals.has(deal.id)}
                                onChange={(checked) => handleCheckBoxChange(checked, deal)}
                            />
                        </div>
                    )
                },
            },
            {
                // `name` приходит из gateway (dealFe: name: d.name) для каждой сделки —
                // колонка ничего нового у бэкенда не просит.
                id: 'name',
                header: 'Название',
                accessorKey: 'name',
                cell: ({ row }) => {
                    const deal = row.original
                    if (!deal.name) return <span className="text-gray-400">—</span>
                    return (
                        <span className="inline-flex items-center gap-1.5">
                            <span
                                className="font-semibold text-primary cursor-pointer"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(`/deals/${deal.id}`)
                                }}
                            >
                                {deal.name}
                            </span>
                            {deal.driftFlag && (
                                <span
                                    className="text-xs text-amber-600 dark:text-amber-400"
                                    {...qa('deals.list.drift', { deal: deal.id })}
                                >
                                    drift
                                </span>
                            )}
                        </span>
                    )
                },
            },
            {
                id: 'companyName',
                header: 'Компания',
                accessorKey: 'companyName',
                cell: ({ row }) => {
                    const deal = row.original
                    if (!deal.companyName)
                        return (
                            <span
                                className="text-gray-400"
                                {...qa('deals.list.row', { deal: deal.id })}
                            >
                                —
                            </span>
                        )
                    return deal.companyId ? (
                        <span
                            className="text-primary cursor-pointer"
                            {...qa('deals.list.companyLink', { company: deal.companyId })}
                            onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/companies/${deal.companyId}`)
                            }}
                        >
                            {deal.companyName}
                        </span>
                    ) : (
                        <span {...qa('deals.list.row', { deal: deal.id })}>
                            {deal.companyName}
                        </span>
                    )
                },
            },
            {
                id: 'productName',
                header: 'Продукт',
                accessorKey: 'productName',
                cell: ({ row }) => {
                    const product = row.original.productName
                    if (!product) return <span className="text-gray-400">—</span>
                    return (
                        <Tag className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                            {product}
                        </Tag>
                    )
                },
            },
            {
                id: 'amount',
                header: () => <span {...qa('deals.list.sort.amount')}>Сумма</span>,
                accessorKey: 'amount',
                cell: ({ row }) => {
                    const deal = row.original
                    return (
                        <span>
                            {new Intl.NumberFormat('ru-RU', {
                                style: 'currency',
                                currency: deal.currency || 'RUB',
                                maximumFractionDigits: 0,
                            }).format(deal.amount)}
                        </span>
                    )
                },
            },
            {
                id: 'stageName',
                header: 'Стадия',
                accessorKey: 'stageName',
                cell: ({ row }) => {
                    const stageName = row.original.stageName
                    const colorClass = stageColors[stageName] || 'bg-gray-100 text-gray-700'
                    return (
                        <Tag className={colorClass}>
                            {stageName}
                        </Tag>
                    )
                },
            },
            {
                id: 'stageEnteredAt',
                header: 'Дней на стадии',
                accessorKey: 'stageEnteredAt',
                cell: ({ row }) => {
                    const deal = row.original
                    const days = daysOnStageCount(deal)
                    if (days == null) return <span>-</span>
                    const hint = [
                        deal.totalTimeOnStageDays != null
                            ? `суммарно ${deal.totalTimeOnStageDays} дн.`
                            : null,
                        deal.stageReturnCount != null
                            ? `возвратов ${deal.stageReturnCount}`
                            : null,
                    ]
                        .filter(Boolean)
                        .join(' · ')
                    return (
                        <span className="inline-flex items-center gap-2" title={hint || undefined}>
                            <span>{days} дн.</span>
                            <span {...qa('deals.list.stalled', { deal: deal.id })}>
                                <StalledBadge deal={deal} />
                            </span>
                        </span>
                    )
                },
            },
            {
                id: 'contactName',
                header: 'Контакт',
                accessorKey: 'contactName',
                cell: ({ row }) => {
                    const deal = row.original
                    if (!deal.contactName) return <span>-</span>
                    return deal.contactId ? (
                        <span
                            className="text-primary cursor-pointer"
                            {...qa('deals.list.contactLink', { contact: deal.contactId })}
                            onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/contacts/${deal.contactId}`)
                            }}
                        >
                            {deal.contactName}
                        </span>
                    ) : (
                        <span>{deal.contactName}</span>
                    )
                },
            },
            {
                id: 'source',
                header: 'Источник',
                accessorKey: 'source',
                cell: ({ row }) => {
                    const source = row.original.source
                    if (!source) return <span>-</span>
                    const sourceData = dealSourcesList.find((s) => s.name === source)
                    const color = sourceData?.color
                    return (
                        <Tag
                            className={!color ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : ''}
                            style={
                                color
                                    ? {
                                          backgroundColor: `${color}20`,
                                          color: color,
                                      }
                                    : undefined
                            }
                        >
                            {source}
                        </Tag>
                    )
                },
            },
            {
                id: 'assigneeName',
                header: 'Ответственный',
                accessorKey: 'assigneeName',
                cell: ({ row }) => {
                    const name = resolveAssigneeName(row.original)
                    if (!name) return <span>-</span>
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
                id: 'expectedCloseDate',
                header: 'Ожидаемая дата закрытия',
                accessorKey: 'expectedCloseDate',
                cell: ({ row }) => {
                    const deal = row.original
                    const date = deal.expectedCloseDate
                    if (!date) return <span>-</span>
                    // FR-MDEAL-96: просрочка выводится из уже приходящего
                    // expectedCloseDate — дополнительных запросов не нужно.
                    const overdue = isOverdue(deal)
                    return (
                        <div className="flex items-center gap-2">
                            <span
                                className={
                                    overdue ? 'text-red-600 dark:text-red-400 font-medium' : ''
                                }
                            >
                                {dayjs.unix(date).format('DD.MM.YYYY')}
                            </span>
                            <span {...qa('deals.list.overdue', { deal: deal.id })}>
                                <OverdueBadge deal={deal} />
                            </span>
                        </div>
                    )
                },
            },
            {
                id: 'rowActions',
                header: '',
                cell: ({ row }) => (
                    <div onClick={(e) => e.stopPropagation()}>
                        <Dropdown
                            renderTitle={
                                <Button
                                    size="xs"
                                    variant="plain"
                                    icon={<PiDotsThreeVerticalDuotone />}
                                    {...qa('deals.list.rowActions', { deal: row.original.id })}
                                />
                            }
                            placement="bottom-end"
                        >
                            <div {...qa('deals.list.actionMenu', { deal: row.original.id })}>
                                <HostSlot
                                    id="list.action.menu"
                                    context={{
                                        entityType: 'deal',
                                        recordId: row.original.id,
                                    }}
                                    pending={null}
                                />
                            </div>
                        </Dropdown>
                    </div>
                ),
            },
        ],
        [navigate, pid, dealSourcesList, resolveAssigneeName, selectedDeals, handleCheckBoxChange]
    )

    const columns = useMemo(
        () =>
            allColumns.filter((col) => {
                const colId = (col as { id?: string }).id ?? (col as { accessorKey?: string }).accessorKey
                return colId ? visibleColumns[colId] !== false : true
            }),
        [allColumns, visibleColumns]
    )

    // Form state for drawer
    const [formData, setFormData] = useState<DealCreateForm>(EMPTY_DEAL_FORM)
    // TODO-179 (FR-DEALS-010): «контакт из базы» либо «лид без контакта» —
    // взаимоисключающие способы указать, с кем сделка. Light-поля уходят в
    // CreateDealRequest 15..18 и дальше квалифицируются в реальный контакт.
    const [leadMode, setLeadMode] = useState<LeadMode>('contact')

    const resetForm = () => {
        setFormData(EMPTY_DEAL_FORM)
        setLeadMode('contact')
    }

    const lightLeadReady = hasLightLeadIdentity(formData)
    const canSubmitCreate =
        Boolean(formData.name) && (leadMode === 'contact' || lightLeadReady)

    const handleCreateDeal = async () => {
        if (!canSubmitCreate) return
        setCreating(true)
        try {
            const payload = buildCreateDealPayload(formData, leadMode)
            await apiCreateDeal<Deal>(payload)
            notifySuccess('Сделка создана')
            setDrawerOpen(false)
            resetForm()
            mutate()
        } catch (err) {
            notifyError(extractError(err, 'Не удалось создать сделку'))
        } finally {
            setCreating(false)
        }
    }

    const memberOptions = useMemo(
        () =>
            membersList.map((m) => ({
                value: m.id,
                label: m.name,
            })) || [],
        [membersList]
    )

    const companyOptions = useMemo(
        () =>
            companiesData?.list?.map((c) => ({
                value: c.id,
                label: c.name,
            })) || [],
        [companiesData]
    )

    const contactOptions = useMemo(
        () =>
            contactsData?.list?.map((c) => ({
                value: c.id,
                label: `${c.firstName} ${c.lastName}`,
            })) || [],
        [contactsData]
    )

    const sourceOptions = useMemo(
        () =>
            dealSourcesList.map((s) => ({
                value: s.name,
                label: s.name,
            })) || [],
        [dealSourcesList]
    )

    const productOptions = useMemo(
        () =>
            productsData?.list?.map((p) => ({
                value: p.id,
                label: p.name,
            })) || [],
        [productsData]
    )

    const pipelineOptions = useMemo(
        () =>
            pipelinesData?.map((p) => ({
                value: p.id,
                label: p.name,
            })) || [],
        [pipelinesData]
    )

    const selectedPipelineStages = useMemo(() => {
        if (!formData.pipelineId || !pipelinesData) return []
        const pipeline = pipelinesData.find((p) => p.id === formData.pipelineId)
        return (
            pipeline?.stages.map((s) => ({
                value: s.id,
                label: s.name,
            })) || []
        )
    }, [formData.pipelineId, pipelinesData])

    // Значения = lifecycle-статусы домена (см. DEAL_STATUS_OPTIONS выше).
    // Раньше здесь было 'active', и фильтр уходил как `result=` — параметр,
    // которого gateway не знает, поэтому выбор ничего не менял.
    const statusOptions = DEAL_STATUS_OPTIONS

    return (
        <Container>
            <AdaptiveCard>
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h3>Сделки</h3>
                        <motion.div
                            layout
                            className="flex items-center gap-2"
                            transition={{ layout: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] } }}
                        >
                            {selectedDeals.size > 0 && (
                                <HostSlot
                                    id="list.bulk.action"
                                    context={{
                                        entityType: 'deal',
                                        selectedIds: Array.from(selectedDeals),
                                    }}
                                    pending={null}
                                    fallback={
                                        <Tooltip title="Поставить задачу">
                                            <span className="inline-flex">
                                                <Button
                                                    variant="solid"
                                                    size="sm"
                                                    className="bg-yellow-500 hover:bg-yellow-600 text-white"
                                                    icon={<PiListChecksDuotone />}
                                                    onClick={() => setTaskDrawerOpen(true)}
                                                    {...qa('deals.list.bulkTask')}
                                                />
                                            </span>
                                        </Tooltip>
                                    }
                                />
                            )}
                            {canWrite && (
                                <Tooltip title="Создать сделку">
                                    <span className="inline-flex">
                                        <Button
                                            variant="solid"
                                            color="primary"
                                            size="sm"
                                            icon={<PiPlusDuotone />}
                                            onClick={() => setDrawerOpen(true)}
                                            {...qa('deals.list.create')}
                                        />
                                    </span>
                                </Tooltip>
                            )}
                            {/* TODO-187: точка входа в импорт скрыта до появления серверной
                                ручки — мастер был моком (см. src/featureFlags.ts). */}
                            {canImport && DEALS_IMPORT_ENABLED && (
                                <Tooltip title="Импорт сделок">
                                    <span className="inline-flex">
                                        <Link to={`/deals/import`}>
                                            <Button variant="plain" size="sm" icon={<PiUploadDuotone />} />
                                        </Link>
                                    </span>
                                </Tooltip>
                            )}
                            <Tooltip title="Дашборд сделок">
                                <span className="inline-flex">
                                    <Link to={`/deals/dashboard`}>
                                        <Button
                                            variant="plain"
                                            size="sm"
                                            icon={<PiChartLineUpDuotone />}
                                            {...qa('deals.list.dashboard')}
                                        />
                                    </Link>
                                </span>
                            </Tooltip>
                            {canDelete && (
                                <Tooltip title="Корзина">
                                    <span className="inline-flex">
                                        <Link to={`/deals/trash`}>
                                            <Button
                                                variant="plain"
                                                size="sm"
                                                icon={<PiTrashDuotone />}
                                                {...qa('deals.list.trash')}
                                            />
                                        </Link>
                                    </span>
                                </Tooltip>
                            )}
                            <AnimatePresence>
                                {segmentValue === 'list' && (
                                    <motion.div
                                        key="deal-list-extra-actions"
                                        className="flex items-center gap-2"
                                        initial={
                                            shouldAnimateListToolbarRef.current
                                                ? { opacity: 0, x: 12, scale: 0.96 }
                                                : false
                                        }
                                        animate={{ opacity: 1, x: 0, scale: 1 }}
                                        exit={{ opacity: 0, x: 12, scale: 0.96 }}
                                        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                                        onAnimationComplete={() => {
                                            shouldAnimateListToolbarRef.current = false
                                        }}
                                    >
                                        <Tooltip
                                            title={
                                                !canExport
                                                    ? 'Нет прав на экспорт'
                                                    : selectedDeals.size > 0
                                                    ? `Экспорт в CSV (выбрано: ${selectedDeals.size})`
                                                    : 'Выберите сделки для экспорта'
                                            }
                                        >
                                            <span className="inline-flex">
                                                {canExport && selectedDeals.size > 0 ? (
                                                    <CSVLink
                                                        data={exportData}
                                                        filename={`сделки_${dayjs().format('YYYY-MM-DD')}.csv`}
                                                        className="inline-flex"
                                                        {...qa('deals.list.export')}
                                                    >
                                                        <Button
                                                            variant="plain"
                                                            size="sm"
                                                            icon={<PiDownloadDuotone />}
                                                            {...qa('deals.list.export')}
                                                        />
                                                    </CSVLink>
                                                ) : (
                                                    <Button
                                                        variant="plain"
                                                        size="sm"
                                                        icon={<PiDownloadDuotone />}
                                                        disabled
                                                        {...qa('deals.list.export')}
                                                    />
                                                )}
                                            </span>
                                        </Tooltip>
                                        <Tooltip title="Колонки таблицы">
                                            <span className="inline-flex">
                                                <Dropdown
                                                    renderTitle={
                                                        <Button
                                                            variant="plain"
                                                            size="sm"
                                                            icon={<PiSlidersHorizontalDuotone />}
                                                            {...qa('deals.list.columns.trigger')}
                                                        />
                                                    }
                                                    placement="bottom-end"
                                                    menuClass="!min-w-[200px] !p-3"
                                                >
                                                    <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1">
                                                        Видимость колонок
                                                    </div>
                                                    {DEAL_COLUMN_CONFIG.map((col) => (
                                                    <Dropdown.Item key={col.id} variant="custom" className="!p-0">
                                                        <div
                                                            role="button"
                                                            tabIndex={0}
                                                            className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                            {...qa('deals.list.columns.toggle', { column: col.id })}
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
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <Segment
                                value={segmentValue}
                                onChange={(val) => handleViewToggle(val as string)}
                                size="sm"
                                {...qa('deals.view.segment')}
                            >
                                <Segment.Item value="list" {...qa('deals.view.segment.list')}>
                                    <div className="flex items-center gap-1">
                                        <PiListDuotone className="w-4 h-4" />
                                        <span>Список</span>
                                    </div>
                                </Segment.Item>
                                <Segment.Item value="kanban" {...qa('deals.view.segment.kanban')}>
                                    <div className="flex items-center gap-1">
                                        <PiKanbanDuotone className="w-4 h-4" />
                                        <span>Доска</span>
                                    </div>
                                </Segment.Item>
                            </Segment>
                        </motion.div>
                    </div>

                    <div className="flex flex-wrap gap-3 items-end">
                        <div className="flex-1 min-w-[200px]">
                            <Input
                                placeholder="Поиск..."
                                prefix={<PiMagnifyingGlassDuotone className="w-4 h-4" />}
                                value={tableData.query}
                                onChange={(e) => handleSearch(e.target.value)}
                                {...qa('deals.list.search')}
                            />
                        </div>
                        {pipelinesData && pipelinesData.length > 1 && (
                            <div className="w-[180px]" {...qa('deals.list.filter.pipeline')}>
                                <Select
                                    placeholder="Воронка"
                                    isClearable
                                    options={pipelineOptions}
                                    value={pipelineOptions.find((o) => o.value === tableData.pipelineId) || null}
                                    onChange={(option) => handlePipelineFilter(option?.value || '')}
                                    components={{ Option: makeSelectOption('deals.list.filter.pipeline') }}
                                    {...qa('deals.list.filter.pipeline')}
                                />
                            </div>
                        )}
                        <div className="w-[180px]" {...qa('deals.list.filter.stage')}>
                            <Select
                                placeholder="Стадия"
                                isClearable
                                options={stageOptions}
                                value={stageOptions.find((o) => o.value === tableData.stageId) || null}
                                onChange={(option) => handleStageFilter(option?.value || '')}
                                components={{ Option: makeSelectOption('deals.list.filter.stage') }}
                                {...qa('deals.list.filter.stage')}
                            />
                        </div>
                        <div className="w-[180px]" {...qa('deals.list.filter.assignee')}>
                            <Select
                                placeholder="Ответственный"
                                isClearable
                                isDisabled={onlyMine}
                                options={memberOptions}
                                value={memberOptions.find((o) => o.value === tableData.assigneeId) || null}
                                onChange={(option) => handleAssigneeFilter(option?.value || '')}
                                components={{ Option: makeSelectOption('deals.list.filter.assignee') }}
                                {...qa('deals.list.filter.assignee')}
                            />
                        </div>
                        <div className="w-[180px]" {...qa('deals.list.filter.source')}>
                            <Select
                                placeholder="Источник"
                                isClearable
                                options={sourceOptions}
                                value={sourceOptions.find((o) => o.value === tableData.source) || null}
                                onChange={(option) => handleSourceFilter(option?.value || '')}
                                components={{ Option: makeSelectOption('deals.list.filter.source') }}
                                {...qa('deals.list.filter.source')}
                            />
                        </div>
                        <div className="w-[180px]">
                            <Select
                                placeholder="Результат"
                                isClearable
                                options={statusOptions}
                                value={statusOptions.find((o) => o.value === tableData.status) || null}
                                onChange={(option) => handleStatusFilter(option?.value || '')}
                                components={{ Option: makeSelectOption('deals.list.filter.status') }}
                                {...qa('deals.list.filter.status')}
                            />
                        </div>
                        <div className="w-[200px]">
                            <Input
                                type="number"
                                placeholder="На стадии более (дней)"
                                value={tableData.daysOnStage}
                                onChange={(e) => handleDaysOnStageFilter(e.target.value)}
                                {...qa('deals.list.filter.stageDays')}
                            />
                        </div>
                        <button
                            type="button"
                            disabled={onlyMine}
                            onClick={() => handleWithoutAssigneeFilter(!tableData.withoutAssignee)}
                            {...qa('deals.list.without-assignee', {
                                active: tableData.withoutAssignee ? 'true' : 'false',
                            })}
                            className={classNames(
                                'flex items-center gap-2 min-h-12 px-3 rounded-xl border transition-colors text-sm font-semibold',
                                onlyMine && 'opacity-50 cursor-not-allowed',
                                tableData.withoutAssignee
                                    ? 'border-blue-200 dark:border-blue-800 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                                    : 'border-gray-100 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600',
                            )}
                            {...qa('deals.list.filter.withoutAssignee')}
                        >
                            <PiUserMinusDuotone className="w-4 h-4 shrink-0" />
                            <span>Без владельца</span>
                        </button>
                        {/* FR-MDEAL-95: быстрый фильтр «Только мои» → серверный assigneeId. */}
                        <label
                            title={
                                onlyMineAvailable
                                    ? 'Показывать только сделки, где я ответственный'
                                    : 'Не удалось определить текущего пользователя'
                            }
                            className={classNames(
                                'flex items-center gap-2 min-h-12 px-1 text-sm select-none',
                                onlyMineAvailable
                                    ? 'cursor-pointer'
                                    : 'opacity-50 cursor-not-allowed',
                            )}
                        >
                            <Switcher
                                checked={onlyMine && onlyMineAvailable}
                                disabled={!onlyMineAvailable}
                                onChange={(checked) => handleOnlyMineChange(checked)}
                                {...qa('deals.list.only-mine')}
                            />
                            Только мои
                        </label>
                    </div>

                    {selectedDeals.size > 0 && (
                        <BulkPanel
                            selectedIds={Array.from(selectedDeals)}
                            driftDealIds={filteredList
                                .filter((d) => selectedDeals.has(d.id) && d.driftFlag)
                                .map((d) => d.id)}
                            members={membersList}
                            stageOptions={stageOptions}
                            onClear={() => setSelectedDeals(new Set())}
                            onDone={() => {
                                setSelectedDeals(new Set())
                                mutate()
                            }}
                        />
                    )}

                    {hiddenByPolicy > 0 && !(error && !isLoading) && (
                        <div
                            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                            {...qa('deals.list.hiddenByPolicy')}
                        >
                            Ещё {hiddenByPolicy} сделок скрыто настройками доступа
                        </div>
                    )}

                    {/* ST-6: load error → message + retry. */}
                    {error && !isLoading ? (
                        <div className="text-center py-10" {...qa('deals.list.error')}>
                            <p className="text-gray-500">Не удалось загрузить сделки</p>
                            <Button
                                variant="solid"
                                color="primary"
                                className="mt-4"
                                onClick={() => mutate()}
                                {...qa('deals.list.errorRetry')}
                            >
                                Повторить
                            </Button>
                        </div>
                    ) : !isLoading && filteredList.length === 0 ? (
                        hasActiveFilters ? (
                            <div className="text-center py-10" {...qa('deals.list.filteredEmpty')}>
                                <p className="text-gray-500">По заданным фильтрам ничего не найдено</p>
                                <Button
                                    variant="plain"
                                    className="mt-3"
                                    onClick={resetFilters}
                                    {...qa('deals.list.resetFilters')}
                                >
                                    Сбросить фильтры
                                </Button>
                            </div>
                        ) : (
                            <div className="text-center py-10" {...qa('deals.list.empty')}>
                                <p className="text-gray-500 mb-1">Сделок пока нет</p>
                                <p className="text-sm text-gray-400 mb-4">
                                    Создайте первую сделку или импортируйте список.
                                </p>
                                {canWrite && (
                                    <div className="flex justify-center gap-2">
                                        <Button
                                            variant="solid"
                                            color="primary"
                                            icon={<PiPlusDuotone />}
                                            onClick={() => setDrawerOpen(true)}
                                            {...qa('deals.list.createEmpty')}
                                        >
                                            Создать сделку
                                        </Button>
                                        {canImport && DEALS_IMPORT_ENABLED && (
                                            <Link to={`/deals/import`}>
                                                <Button variant="plain" icon={<PiUploadDuotone />}>
                                                    Импорт
                                                </Button>
                                            </Link>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    ) : (
                        <div
                            {...qa('deals.list.table')}
                            {...(isLoading ? qa('deals.list.loading') : {})}
                        >
                        <DataTable
                            columns={columns}
                            data={filteredList}
                            loading={isLoading}
                            pagingData={{ total: pagingTotal, pageIndex, pageSize }}
                            onPaginationChange={handlePaginationChange}
                            onSelectChange={handleSelectChange}
                            onSort={handleSort}
                            selectable={false}
                            onCheckBoxChange={handleCheckBoxChange}
                            onIndeterminateCheckBoxChange={handleIndeterminateCheckBoxChange}
                            onRowClick={(deal) => navigate(`/deals/${deal.id}`)}
                            paginationQaPrefix="deals.list.pagination"
                            qaIdPrefix="deals.list"
                            rowQaKey="deal"
                        />
                        </div>
                    )}
                </div>
            </AdaptiveCard>

            <Drawer
                isOpen={drawerOpen}
                onClose={() => {
                    setDrawerOpen(false)
                    resetForm()
                }}
                title="Создать сделку"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="plain"
                            onClick={() => setDrawerOpen(false)}
                        >
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="primary"
                            loading={creating}
                            onClick={handleCreateDeal}
                            disabled={!canSubmitCreate || creating}
                            {...qa('deals.create.submit')}
                        >
                            Создать
                        </Button>
                    </div>
                }
            >
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Название сделки <span className="text-red-500">*</span>
                        </label>
                        <Input
                            value={formData.name}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, name: e.target.value }))
                            }
                            placeholder="Введите название сделки"
                            {...qa('deals.create.name')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Сумма <span className="text-red-500">*</span>
                        </label>
                        <Input
                            type="number"
                            value={formData.amount}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, amount: e.target.value }))
                            }
                            placeholder="Введите сумму"
                            {...qa('deals.create.amount')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Воронка</label>
                        <Select
                            placeholder="Выберите воронку"
                            isClearable
                            options={pipelineOptions}
                            value={pipelineOptions.find((o) => o.value === formData.pipelineId) || null}
                            onChange={(option) =>
                                setFormData((prev) => ({
                                    ...prev,
                                    pipelineId: option?.value || '',
                                    stageId: '', // Reset stage when pipeline changes
                                }))
                            }
                        />
                    </div>
                    {formData.pipelineId && (
                        <div>
                            <label className="block text-sm font-medium mb-1">Стадия</label>
                            <Select
                                placeholder="Выберите стадию"
                                isClearable
                                options={selectedPipelineStages}
                                value={selectedPipelineStages.find((o) => o.value === formData.stageId) || null}
                                onChange={(option) =>
                                    setFormData((prev) => ({ ...prev, stageId: option?.value || '' }))
                                }
                            />
                        </div>
                    )}
                    {/* TODO-179 (FR-DEALS-010): «лид без контакта» — заводим сделку,
                        когда контакта в базе ещё нет. Поля уходят как light* и
                        превращаются в контакт кнопкой «Квалифицировать» на карточке. */}
                    <div>
                        <label className="block text-sm font-medium mb-1">С кем сделка</label>
                        <Segment
                            value={leadMode}
                            size="sm"
                            onChange={(val) => {
                                // Segment в single-режиме умеет «снять» выбор (value: '') —
                                // режим без значения нам не нужен, игнорируем.
                                const next = String(val)
                                if (next === 'contact' || next === 'light') setLeadMode(next)
                            }}
                            {...qa('deals.create.leadMode')}
                        >
                            <Segment.Item value="contact" {...qa('deals.create.leadMode.contact')}>Контакт из базы</Segment.Item>
                            <Segment.Item value="light" {...qa('deals.create.leadMode.light')}>Лид без контакта</Segment.Item>
                        </Segment>
                    </div>
                    {leadMode === 'contact' ? (
                        <>
                            <div>
                                <label className="block text-sm font-medium mb-1">Контакт</label>
                                <Select
                                    placeholder="Выберите контакт"
                                    isClearable
                                    options={contactOptions}
                                    value={contactOptions.find((o) => o.value === formData.contactId) || null}
                                    onChange={(option) =>
                                        setFormData((prev) => ({ ...prev, contactId: option?.value || '' }))
                                    }
                                    components={{ Option: makeSelectOption('deals.create.contact') }}
                                    {...qa('deals.create.contact')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Компания</label>
                                <Select
                                    placeholder="Выберите компанию"
                                    isClearable
                                    options={companyOptions}
                                    value={companyOptions.find((o) => o.value === formData.companyId) || null}
                                    onChange={(option) =>
                                        setFormData((prev) => ({ ...prev, companyId: option?.value || '' }))
                                    }
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <label className="block text-sm font-medium mb-1">Имя лида</label>
                                <Input
                                    value={formData.lightName}
                                    placeholder="Например, Иван Петров"
                                    onChange={(e) =>
                                        setFormData((prev) => ({ ...prev, lightName: e.target.value }))
                                    }
                                    {...qa('deals.create.lightName')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Телефон</label>
                                <Input
                                    value={formData.lightPhone}
                                    placeholder="+7 ..."
                                    onChange={(e) =>
                                        setFormData((prev) => ({ ...prev, lightPhone: e.target.value }))
                                    }
                                    {...qa('deals.create.lightPhone')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">E-mail</label>
                                <Input
                                    value={formData.lightEmail}
                                    placeholder="mail@example.com"
                                    onChange={(e) =>
                                        setFormData((prev) => ({ ...prev, lightEmail: e.target.value }))
                                    }
                                    {...qa('deals.create.lightEmail')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Компания (со слов)</label>
                                <Input
                                    value={formData.lightCompanyName}
                                    placeholder="Название компании"
                                    onChange={(e) =>
                                        setFormData((prev) => ({
                                            ...prev,
                                            lightCompanyName: e.target.value,
                                        }))
                                    }
                                    {...qa('deals.create.lightCompanyName')}
                                />
                            </div>
                            {!lightLeadReady && (
                                <div className="text-xs text-gray-500">
                                    Заполните хотя бы имя, телефон или e-mail — иначе лид потом
                                    нечем квалифицировать.
                                </div>
                            )}
                        </>
                    )}
                    <div>
                        <label className="block text-sm font-medium mb-1">Продукт</label>
                        <Select
                            placeholder="Выберите продукт"
                            isClearable
                            options={productOptions}
                            value={productOptions.find((o) => o.value === formData.productId) || null}
                            onChange={(option) =>
                                setFormData((prev) => ({ ...prev, productId: option?.value || '' }))
                            }
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Источник</label>
                        <Select
                            placeholder="Выберите источник"
                            isClearable
                            options={sourceOptions}
                            value={sourceOptions.find((o) => o.value === formData.source) || null}
                            onChange={(option) =>
                                setFormData((prev) => ({ ...prev, source: option?.value || '' }))
                            }
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Ответственный</label>
                        <Select
                            placeholder="Выберите ответственного"
                            isClearable
                            options={memberOptions}
                            value={memberOptions.find((o) => o.value === formData.assigneeId) || null}
                            onChange={(option) =>
                                setFormData((prev) => ({ ...prev, assigneeId: option?.value || '' }))
                            }
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Ожидаемая дата закрытия</label>
                        <Input
                            type="date"
                            value={formData.expectedCloseDate}
                            onChange={(e) =>
                                setFormData((prev) => ({ ...prev, expectedCloseDate: e.target.value }))
                            }
                        />
                    </div>
                </div>
            </Drawer>

            <EntityCreateDrawer
                entityType="task"
                isOpen={taskDrawerOpen}
                onClose={() => setTaskDrawerOpen(false)}
                onSuccess={() => {
                    setTaskDrawerOpen(false)
                    setSelectedDeals(new Set())
                }}
                taskInitialData={
                    selectedDeals.size > 0
                        ? { dealId: filteredList.find((d) => selectedDeals.has(d.id))?.id }
                        : undefined
                }
            />
        </Container>
    )
}

export default DealList
