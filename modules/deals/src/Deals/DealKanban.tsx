import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode, type RefCallback } from 'react'
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import { useSessionUser } from '@/store/authStore'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult, DroppableProvidedProps } from '@hello-pangea/dnd'
import {
    PiListDuotone,
    PiKanbanDuotone,
    PiPlusDuotone,
    PiMagnifyingGlassDuotone,
    PiUploadDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Tooltip from '@/components/ui/Tooltip'
import Input from '@/components/ui/Input'
import Segment from '@/components/ui/Segment'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Loading from '@/components/shared/Loading'
import useSegmentRouteTransition from '@/utils/hooks/useSegmentRouteTransition'
import { useRememberProfileDefaultView } from '@/utils/profile/rememberDefaultView'
import Drawer from '@/components/ui/Drawer'
import usePermission from '@/utils/hooks/usePermission'
import { apiGetDealsKanban, apiGetDeals, apiGetPipelines, apiGetDealSources, apiGetMembers, apiMoveDealStage, apiCreateDeal, apiGetActivities } from '@/services/CrmService'
import type { DealSource, ProjectMember, Deal, Pipeline, PipelineStage, Activity } from '@/@types/crm'
import { OverdueBadge, StalledBadge, daysOnStageCount, dealStatus, extractError, notifyError, notifySuccess } from './dealUtils'
import { DEALS_IMPORT_ENABLED } from '../featureFlags'
import CloseDealDialog from './CloseDealDialog'
import {
    KANBAN_BASE_SLICE_LIMIT,
    KANBAN_TAIL_PAGE_SIZE,
    kanbanTailFetchDone,
    kanbanTailPageIndex,
} from './dealKanbanPaging'
import { formatKanbanActivityLabel, pickNextActivityByDealId } from './dealKanbanActivity'
import { qa } from '../qa'
import { makeSelectOption } from '../selectQa'

type KanbanData = {
    pipeline: Pipeline
    // total/hasMore — аддитивные per-column поля нового BE (честный count с теми же
    // visibility/ABAC-фильтрами + признак «есть ещё»). На старом BE их нет → optional.
    columns: (PipelineStage & { deals: Deal[]; total?: number; hasMore?: boolean })[]
}

// Per-column paging state (kept outside the SWR cache; the loaded deals themselves
// are appended into kanbanData so drag/filters/sum keep working unchanged).
type ColumnLoadMeta = {
    total?: number
    loading: boolean
    done: boolean
}

type KanbanColumnScrollProps = {
    columnId: string
    hasMore: boolean
    loading: boolean
    onLoadMore: (stageId: string) => Promise<void>
    innerRef: RefCallback<HTMLElement>
    droppableProps: DroppableProvidedProps
    isDraggingOver: boolean
    children: ReactNode
}

/**
 * FR-SEARCH-385: per-column infinite scroll.
 * Host `useInfiniteScroll` is a viewport observer with an absolutely-positioned
 * sentinel at the container's visible bottom — inside `overflow-y-auto` that
 * fires immediately and drains the stage. Observe an in-flow sentinel with
 * `root = column` so tails load only when the user actually scrolls.
 */
const KanbanColumnScroll = ({
    columnId,
    hasMore,
    loading,
    onLoadMore,
    innerRef,
    droppableProps,
    isDraggingOver,
    children,
}: KanbanColumnScrollProps) => {
    const rootRef = useRef<HTMLDivElement | null>(null)
    const sentinelRef = useRef<HTMLDivElement | null>(null)

    const mergeRef: RefCallback<HTMLDivElement> = (node) => {
        rootRef.current = node
        innerRef(node)
    }

    useEffect(() => {
        const root = rootRef.current
        const sentinel = sentinelRef.current
        if (!root || !sentinel || !hasMore || loading) return

        const io = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) void onLoadMore(columnId)
            },
            { root, rootMargin: '40px', threshold: 0 },
        )
        io.observe(sentinel)
        return () => io.disconnect()
    }, [columnId, hasMore, loading, onLoadMore])

    return (
        <div
            ref={mergeRef}
            {...droppableProps}
            className={`max-h-[min(70vh,720px)] overflow-y-auto min-h-[200px] space-y-2 transition-colors ${
                isDraggingOver ? 'bg-gray-100 dark:bg-gray-700' : ''
            }`}
        >
            {children}
            <div
                ref={sentinelRef}
                className="h-px w-full"
                aria-hidden
                {...qa('deals.kanban.loadSentinel', { stage: columnId })}
            />
            {loading && hasMore && (
                <div
                    className="py-2 text-center text-xs text-gray-500"
                    {...qa('deals.kanban.loadMore', { stage: columnId })}
                >
                    Загрузка…
                </div>
            )}
        </div>
    )
}

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

const DealKanban = () => {
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams, setSearchParams] = useSearchParams()
    const pid = useCurrentProjectId()
    const currentUserId = useSessionUser((s) => s.user)?.userId ?? undefined
    const can = usePermission()
    const canWrite = can('deals', 'write')
    const canImport = can('deals', 'import')
    const canMove = can('deals.stage', 'move')
    const [closeDialog, setCloseDialog] = useState<{ deal: Deal; result: 'won' | 'lost' } | null>(null)
    const [selectedPipelineId, setSelectedPipelineId] = useState<string>('')
    const [colMeta, setColMeta] = useState<Record<string, ColumnLoadMeta>>({})
    const isKanbanView = location.pathname.includes('/kanban')

    const { data: pipelinesData } = useSWR(
        ['/api/v1/pipelines'],
        () => apiGetPipelines<Pipeline[]>(),
        { revalidateOnFocus: false }
    )

    const { data: kanbanData, isLoading, error, mutate } = useSWR<KanbanData>(
        ['/api/v1/deals/kanban', selectedPipelineId],
        async () => {
            void pid
            // API отдаёт колонки как { stageId, stageName, deals }, а UI ждёт { id, name }.
            // Без маппинга заголовки колонок пустые, а drag-drop ищет по id=undefined.
            const raw = await apiGetDealsKanban<KanbanData>(selectedPipelineId || undefined)
            const cols = (raw?.columns ?? []) as Array<
                Partial<PipelineStage> & {
                    stageId?: string
                    stageName?: string
                    deals: Deal[]
                    total?: number
                    hasMore?: boolean
                }
            >
            return {
                ...raw,
                columns: cols.map((c) => ({
                    id: c.id ?? c.stageId ?? '',
                    name: c.name ?? c.stageName ?? '',
                    color: c.color ?? '#94a3b8',
                    order: c.order ?? 0,
                    deals: c.deals ?? [],
                    // Проносим честный per-column total/hasMore нового BE как есть;
                    // отсутствуют/не того типа (старый BE) → undefined, дальше фолбэк.
                    total: typeof c.total === 'number' ? c.total : undefined,
                    hasMore: typeof c.hasMore === 'boolean' ? c.hasMore : undefined,
                })),
            }
        },
        { revalidateOnFocus: false }
    )

    const canReadActivities = can('activities', 'read')
    const { data: plannedActivities } = useSWR(
        canReadActivities && pid ? ['/api/v1/activities', 'planned-kanban', pid] : null,
        () =>
            apiGetActivities<{ list: Activity[]; total: number }, Record<string, unknown>>({
                status: 'planned',
                pageSize: 500,
                sort: 'dueDate',
            }),
        { revalidateOnFocus: false },
    )

    const nextActivityByDealId = useMemo(
        () => pickNextActivityByDealId(plannedActivities?.list ?? []),
        [plannedActivities],
    )

    const dealListToolbarAnimateKey = 'crm:deals:list-toolbar-animate'

    const rememberDealsView = useRememberProfileDefaultView('defaultDealsView')

    const navigateToView = (value: string) => {
        rememberDealsView(value)
        if (value === 'kanban') {
            navigate(`/deals/kanban`)
        } else {
            window.sessionStorage.setItem(dealListToolbarAnimateKey, '1')
            navigate(`/deals`)
        }
    }

    const [segmentValue, handleViewToggle] = useSegmentRouteTransition(
        isKanbanView ? 'kanban' : 'list',
        navigateToView,
    )

    const pipelineOptions = useMemo(
        () =>
            pipelinesData?.map((p) => ({
                value: p.id,
                label: p.name,
            })) || [],
        [pipelinesData]
    )

    // Set default pipeline on first load
    useEffect(() => {
        if (pipelinesData && pipelinesData.length > 0 && !selectedPipelineId) {
            const defaultPipeline = pipelinesData.find((p) => p.isDefault) || pipelinesData[0]
            setSelectedPipelineId(defaultPipeline.id)
        }
    }, [pipelinesData, selectedPipelineId])

    // Switching pipeline refetches the kanban base slice → drop any loaded tails so
    // paging restarts from page 0 of the new pipeline.
    useEffect(() => {
        setColMeta({})
    }, [selectedPipelineId])

    // Load the next tail page for a single column and append it into the SWR cache
    // (dedupe by id). Uses the list endpoint filtered by stageId; total (per-stage)
    // is captured to drive the honest "hasMore"/count where available.
    const loadMore = useCallback(async (stageId: string) => {
        if (!pid) return
        const meta = colMeta[stageId]
        if (meta?.loading || meta?.done) return
        const rawCol = kanbanData?.columns.find((col) => col.id === stageId)
        const loadedBefore = rawCol?.deals.length ?? 0
        const pageIndex = kanbanTailPageIndex(loadedBefore)
        setColMeta((prev) => ({
            ...prev,
            [stageId]: { total: prev[stageId]?.total, loading: true, done: false },
        }))
        try {
            const resp = await apiGetDeals<
                { list: Deal[]; total: number },
                { projectId: string; pipelineId?: string; stageId: string; pageIndex: number; pageSize: number }
            >({
                projectId: pid,
                pipelineId: selectedPipelineId || undefined,
                stageId,
                pageIndex,
                pageSize: KANBAN_TAIL_PAGE_SIZE,
            })
            const incoming = normalizeList<Deal>(resp)
            const total = resp?.total
            let added = 0
            mutate((current) => {
                if (!current) return current
                const columns = current.columns.map((col) => {
                    if (col.id !== stageId) return col
                    const seen = new Set(col.deals.map((d) => d.id))
                    const add = incoming
                        .filter((d) => !seen.has(d.id))
                        .map((d) => ({ ...d, stageId: col.id, stageName: col.name }))
                    added = add.length
                    return { ...col, deals: [...col.deals, ...add] }
                })
                return { ...current, columns }
            }, false)
            const loadedAfter = loadedBefore + added
            setColMeta((prev) => ({
                ...prev,
                [stageId]: {
                    total: total ?? prev[stageId]?.total,
                    loading: false,
                    done: kanbanTailFetchDone(incoming.length, loadedAfter, total),
                },
            }))
        } catch (err) {
            setColMeta((prev) => ({
                ...prev,
                [stageId]: { total: prev[stageId]?.total, loading: false, done: false },
            }))
            notifyError(extractError(err, 'Не удалось загрузить сделки'))
        }
    }, [colMeta, kanbanData, mutate, pid, selectedPipelineId])

    const onDragEnd = async (result: DropResult) => {
        const { destination, source, draggableId } = result

        if (!destination || !kanbanData) {
            return
        }

        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return
        }

        const sourceColumn = kanbanData.columns.find((col) => col.id === source.droppableId)
        const destColumn = kanbanData.columns.find((col) => col.id === destination.droppableId)
        if (!sourceColumn || !destColumn) return

        const deal = sourceColumn.deals.find((d) => d.id === draggableId)
        if (!deal) return

        // FR-MDEAL-14: closed deals are read-only — drag must not move them.
        if (dealStatus(deal) !== 'open') {
            notifyError('Закрытую сделку нельзя перемещать')
            return
        }
        if (!canMove) {
            notifyError('Нет прав на перемещение сделок')
            return
        }

        const pipeline = pipelinesData?.find((p) => p.id === selectedPipelineId)
        const destStageMeta = pipeline?.stages?.find((s) => s.id === destColumn.id)
        if (destStageMeta?.kind === 'won' || destStageMeta?.kind === 'lost') {
            if (!canWrite) {
                notifyError('Нет прав на закрытие сделки')
                return
            }
            setCloseDialog({ deal, result: destStageMeta.kind })
            return
        }

        // Snapshot for rollback, then optimistic UI move.
        const prevData = kanbanData
        const newColumns = kanbanData.columns.map((col) => {
            if (col.id === source.droppableId) {
                return { ...col, deals: col.deals.filter((d) => d.id !== draggableId) }
            }
            if (col.id === destination.droppableId) {
                const newDeals = [...col.deals]
                newDeals.splice(destination.index, 0, {
                    ...deal,
                    stageId: col.id,
                    stageName: col.name,
                })
                return { ...col, deals: newDeals }
            }
            return col
        })
        mutate({ ...kanbanData, columns: newColumns }, false)

        try {
            await apiMoveDealStage<Deal>(deal.id, destColumn.id)
            // Revalidate to pick up server-side derived fields (stageEnteredAt, …).
            // The revalidate rebuilds the base slice, so drop stale tail paging state.
            setColMeta({})
            mutate()
        } catch (err) {
            // ST-7: rollback optimistic move on 409/422 and surface the reason.
            mutate(prevData, false)
            notifyError(extractError(err, 'Не удалось переместить сделку'))
        }
    }

    const getDealBorderColor = (deal: Deal) => {
        const status = dealStatus(deal)
        if (status === 'won') {
            return 'border-l-4 border-l-emerald-500'
        }
        if (status === 'lost') {
            return 'border-l-4 border-l-red-500'
        }
        return 'border-l-4 border-l-blue-500'
    }

    const formatCurrency = (amount: number, currency: string = 'RUB') => {
        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 0,
        }).format(amount)
    }

    const { data: sourcesData } = useSWR(
        ['/api/v1/deal-sources'],
        () => apiGetDealSources<DealSource[]>(),
        { revalidateOnFocus: false },
    )

    const { data: membersData } = useSWR(
        ['/api/v1/members'],
        () => apiGetMembers<ProjectMember[]>(),
        { revalidateOnFocus: false },
    )

    const [searchQuery, setSearchQuery] = useState('')
    const [filterAssignee, setFilterAssignee] = useState('')
    const [filterSource, setFilterSource] = useState('')

    // FR-MDEAL-95 «Только мои» — тот же ключ URL (?mine=1), что и в списке, чтобы
    // выбор переживал переключение «Список ⇄ Доска» и перезагрузку страницы.
    // На доске (GetDealsKanban без фильтров в контракте) отбор идёт по тому же
    // клиентскому предикату, что и ручной выбор ответственного, — новых
    // допущений о бэкенде не вводим.
    const onlyMine = searchParams.get('mine') === '1'
    const onlyMineAvailable = Boolean(currentUserId)
    const handleOnlyMineChange = (checked: boolean) => {
        const next = new URLSearchParams(searchParams)
        if (checked) next.set('mine', '1')
        else next.delete('mine')
        setSearchParams(next, { replace: true })
    }
    const effectiveAssignee =
        onlyMine && currentUserId ? currentUserId : filterAssignee
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [creating, setCreating] = useState(false)
    const [createForm, setCreateForm] = useState({ name: '', amount: '', source: '', assigneeId: '' })
    const dealSourcesList = normalizeList<DealSource>(sourcesData)
    const membersList = normalizeList<ProjectMember>(membersData)

    const resetCreateForm = () => setCreateForm({ name: '', amount: '', source: '', assigneeId: '' })

    const handleCreate = async () => {
        if (!createForm.name) return
        setCreating(true)
        try {
            const payload: Record<string, unknown> = {
                name: createForm.name,
                amount: createForm.amount ? Number(createForm.amount) : 0,
            }
            if (selectedPipelineId) payload.pipelineId = selectedPipelineId
            if (createForm.source) payload.source = createForm.source
            if (createForm.assigneeId) payload.assigneeId = createForm.assigneeId
            await apiCreateDeal<Deal>(payload)
            notifySuccess('Сделка создана')
            setDrawerOpen(false)
            resetCreateForm()
            setColMeta({})
            mutate()
        } catch (err) {
            notifyError(extractError(err, 'Не удалось создать сделку'))
        } finally {
            setCreating(false)
        }
    }

    const sourceOptions = useMemo(
        () => dealSourcesList.map((s) => ({ value: s.name, label: s.name })) || [],
        [dealSourcesList],
    )

    const memberOptions = useMemo(
        () => membersList.map((m) => ({ value: m.id, label: m.name })) || [],
        [membersList],
    )

    // Бэкенд отдаёт в assigneeName/assigneeId сырой uuid пользователя — резолвим в имя
    // по списку участников проекта; если участник не найден, показываем uuid как есть.
    const memberNameById = useMemo(() => {
        const map = new Map<string, string>()
        membersList.forEach((m) => map.set(m.id, m.name))
        return map
    }, [membersList])

    const resolveAssigneeName = (deal: Deal): string =>
        (deal.assigneeId && memberNameById.get(deal.assigneeId)) ||
        (deal.assigneeName && memberNameById.get(deal.assigneeName)) ||
        deal.assigneeName ||
        ''

    const filteredColumns = useMemo(() => {
        if (!kanbanData) return []
        return kanbanData.columns.map((col) => ({
            ...col,
            deals: col.deals.filter((deal) => {
                if (searchQuery && !deal.name.toLowerCase().includes(searchQuery.toLowerCase()) && !(deal.companyName || '').toLowerCase().includes(searchQuery.toLowerCase())) return false
                if (effectiveAssignee && deal.assigneeId !== effectiveAssignee) return false
                if (filterSource && deal.source !== filterSource) return false
                return true
            }),
        }))
    }, [kanbanData, searchQuery, effectiveAssignee, filterSource])

    const getDaysOnStage = (deal: Deal) => {
        const days = daysOnStageCount(deal)
        if (days == null) {
            const fallback = dayjs().diff(dayjs.unix(deal.createdAt), 'day')
            if (fallback === 0) return { text: 'Сегодня', color: 'text-gray-500' }
            if (fallback === 1) return { text: 'Вчера', color: 'text-gray-500' }
            return { text: `${fallback} дн.`, color: fallback < 3 ? 'text-green-600' : fallback <= 7 ? 'text-yellow-600' : 'text-red-600' }
        }
        if (days === 0) return { text: 'Сегодня', color: 'text-green-600' }
        if (days === 1) return { text: 'Вчера', color: 'text-green-600' }
        const color = days < 3 ? 'text-green-600' : days <= 7 ? 'text-yellow-600' : 'text-red-600'
        return { text: `${days} дн.`, color }
    }

    if (isLoading) {
        return (
            <Container>
                <Loading loading={true} />
            </Container>
        )
    }

    // ST-6: load error → retry.
    if (error && !kanbanData) {
        return (
            <Container>
                <div className="text-center py-10" {...qa('deals.kanban.error')}>
                    <p className="text-gray-500">Не удалось загрузить доску</p>
                    <Button
                        variant="solid"
                        color="primary"
                        className="mt-4"
                        onClick={() => mutate()}
                        {...qa('deals.kanban.errorRetry')}
                    >
                        Повторить
                    </Button>
                </div>
            </Container>
        )
    }

    // ST-9: no pipeline / no data → offer setup.
    if (!kanbanData || kanbanData.columns.length === 0) {
        return (
            <Container>
                <div className="text-center py-10" {...qa('deals.kanban.empty')}>
                    <p className="text-gray-500 mb-1">Доска пуста</p>
                    <p className="text-sm text-gray-400 mb-4">
                        Создайте сделку или настройте воронку.
                    </p>
                    <div className="flex justify-center gap-2">
                        {canWrite && (
                            <Button
                                variant="solid"
                                color="primary"
                                icon={<PiPlusDuotone />}
                                onClick={() => setDrawerOpen(true)}
                            >
                                Создать сделку
                            </Button>
                        )}
                        <Link to={`/deals/pipelines`}>
                            <Button variant="plain">Настроить воронки</Button>
                        </Link>
                    </div>
                </div>
            </Container>
        )
    }

    return (
        <Container>
            <AdaptiveCard>
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h3>Сделки</h3>
                    <div className="flex items-center gap-2">
                        {canWrite && (
                            <Tooltip title="Создать сделку">
                                <span className="inline-flex">
                                    <Button
                                        variant="solid"
                                        color="primary"
                                        size="sm"
                                        icon={<PiPlusDuotone />}
                                        onClick={() => setDrawerOpen(true)}
                                        {...qa('deals.kanban.create')}
                                    />
                                </span>
                            </Tooltip>
                        )}
                        {/* TODO-187: импорт скрыт до появления серверной ручки (featureFlags.ts). */}
                        {canImport && DEALS_IMPORT_ENABLED && (
                            <Tooltip title="Импорт сделок">
                                <Link to={`/deals/import`}>
                                    <Button variant="plain" size="sm" icon={<PiUploadDuotone />} />
                                </Link>
                            </Tooltip>
                        )}
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
                    </div>
                </div>

                <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[200px]">
                        <Input
                            placeholder="Поиск..."
                            prefix={<PiMagnifyingGlassDuotone className="w-4 h-4" />}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            {...qa('deals.kanban.search')}
                        />
                    </div>
                    {pipelinesData && pipelinesData.length > 1 && (
                        <div className="w-[180px]">
                            <Select
                                placeholder="Воронка"
                                options={pipelineOptions}
                                value={pipelineOptions.find((o) => o.value === selectedPipelineId) || null}
                                onChange={(option) => setSelectedPipelineId(option?.value || '')}
                                components={{ Option: makeSelectOption('deals.kanban.filter.pipeline') }}
                                {...qa('deals.kanban.filter.pipeline')}
                            />
                        </div>
                    )}
                    <div className="w-[180px]">
                        <Select
                            placeholder="Ответственный"
                            isClearable
                            isDisabled={onlyMine}
                            options={memberOptions}
                            value={memberOptions.find((o) => o.value === filterAssignee) || null}
                            onChange={(option) => setFilterAssignee(option?.value || '')}
                            components={{ Option: makeSelectOption('deals.kanban.filter.assignee') }}
                            {...qa('deals.kanban.filter.assignee')}
                        />
                    </div>
                    <div className="w-[180px]">
                        <Select
                            placeholder="Источник"
                            isClearable
                            options={sourceOptions}
                            value={sourceOptions.find((o) => o.value === filterSource) || null}
                            onChange={(option) => setFilterSource(option?.value || '')}
                            components={{ Option: makeSelectOption('deals.kanban.filter.source') }}
                            {...qa('deals.kanban.filter.source')}
                        />
                    </div>
                    {/* FR-MDEAL-95: тот же быстрофильтр, что в списке. */}
                    <label
                        title={
                            onlyMineAvailable
                                ? 'Показывать только сделки, где я ответственный'
                                : 'Не удалось определить текущего пользователя'
                        }
                        className={`flex items-center gap-2 min-h-12 px-1 text-sm select-none ${
                            onlyMineAvailable ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                        }`}
                    >
                        <Switcher
                            checked={onlyMine && onlyMineAvailable}
                            disabled={!onlyMineAvailable}
                            onChange={(checked) => handleOnlyMineChange(checked)}
                            {...qa('deals.kanban.only-mine')}
                        />
                        Только мои
                    </label>
                </div>

                <DragDropContext onDragEnd={onDragEnd}>
                    <div className="flex gap-4 overflow-x-auto pb-4">
                        {filteredColumns.map((column) => {
                            const totalAmount = column.deals.reduce(
                                (sum, deal) => sum + deal.amount,
                                0
                            )
                            // hasMore is driven by the unfiltered loaded count vs the
                            // per-stage total (client filters must not stop server paging).
                            const rawCol = kanbanData.columns.find((c) => c.id === column.id)
                            const loadedCount = rawCol?.deals.length ?? column.deals.length
                            const meta = colMeta[column.id]
                            const hasClientFilters = Boolean(
                                searchQuery || effectiveAssignee || filterSource,
                            )
                            // Честный total колонки: сначала seed нового BE из kanban-ответа,
                            // затем total догрузки через list-ручку (совпадают — оба честные).
                            // Оба отсутствуют (старый BE) → undefined и фолбэк на эвристику.
                            const serverTotal =
                                typeof rawCol?.total === 'number' ? rawCol.total : undefined
                            const effectiveTotal = meta?.total ?? serverTotal
                            const hasMore = meta?.done
                                ? false
                                : effectiveTotal != null
                                  ? loadedCount < effectiveTotal
                                  : typeof rawCol?.hasMore === 'boolean'
                                    ? rawCol.hasMore
                                    : loadedCount >= KANBAN_BASE_SLICE_LIMIT
                            // Show the real per-stage total when known and no client
                            // filter is masking cards; otherwise the visible card count.
                            const displayCount =
                                !hasClientFilters && effectiveTotal != null
                                    ? effectiveTotal
                                    : column.deals.length
                            return (
                                <div
                                    key={column.id}
                                    className="flex-shrink-0 w-[280px] bg-gray-50 dark:bg-gray-800 rounded-lg p-4"
                                    {...qa('deals.kanban.column', { stage: column.id })}
                                >
                                    <div className="mb-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{ backgroundColor: column.color }}
                                                />
                                                <h4 className="font-semibold text-lg">{column.name}</h4>
                                            </div>
                                            <span className="text-sm text-gray-500 bg-white dark:bg-gray-700 px-2 py-1 rounded">
                                                {displayCount}
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            {formatCurrency(totalAmount)}
                                        </div>
                                    </div>

                                    <Droppable droppableId={column.id}>
                                        {(provided, snapshot) => (
                                            <KanbanColumnScroll
                                                columnId={column.id}
                                                hasMore={hasMore}
                                                loading={Boolean(meta?.loading)}
                                                onLoadMore={loadMore}
                                                innerRef={provided.innerRef}
                                                droppableProps={provided.droppableProps}
                                                isDraggingOver={snapshot.isDraggingOver}
                                            >
                                                {column.deals.map((deal, index) => (
                                                    <Draggable
                                                        key={deal.id}
                                                        draggableId={deal.id}
                                                        index={index}
                                                    >
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                {...provided.dragHandleProps}
                                                                className={`bg-white dark:bg-gray-700 rounded-lg p-3 shadow-sm cursor-move transition-shadow ${
                                                                    snapshot.isDragging
                                                                        ? 'shadow-lg'
                                                                        : 'hover:shadow-md'
                                                                } ${getDealBorderColor(deal)}`}
                                                                onClick={() =>
                                                                    navigate(`/deals/${deal.id}`)
                                                                }
                                                                {...qa('deals.kanban.card', { deal: deal.id })}
                                                            >
                                                                <div className="font-semibold text-sm mb-2">
                                                                    {deal.name}
                                                                </div>
                                                                {deal.companyName && (
                                                                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                                                                        {deal.companyName}
                                                                    </div>
                                                                )}
                                                                <div className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-1">
                                                                    {formatCurrency(
                                                                        deal.amount,
                                                                        deal.currency
                                                                    )}
                                                                </div>
                                                                {/* FR-MDEAL-96: просрочка считается из expectedCloseDate,
                                                                    который канбан-ответ уже отдаёт (dealFe). */}
                                                                {deal.expectedCloseDate && (
                                                                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                                        <span>
                                                                            до{' '}
                                                                            {dayjs
                                                                                .unix(deal.expectedCloseDate)
                                                                                .format('DD.MM.YYYY')}
                                                                        </span>
                                                                        <span {...qa('deals.kanban.overdue', { deal: deal.id })}>
                                                                            <OverdueBadge deal={deal} />
                                                                        </span>
                                                                        <span {...qa('deals.kanban.stalled', { deal: deal.id })}>
                                                                            <StalledBadge deal={deal} />
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {!deal.expectedCloseDate && deal.isStalled && (
                                                                    <div className="mb-1" {...qa('deals.kanban.stalled', { deal: deal.id })}>
                                                                        <StalledBadge deal={deal} />
                                                                    </div>
                                                                )}
                                                                {(() => {
                                                                    const next = nextActivityByDealId.get(deal.id)
                                                                    return next ? (
                                                                        <div
                                                                            className="text-xs text-violet-600 dark:text-violet-400 mb-1 truncate"
                                                                            title={formatKanbanActivityLabel(next)}
                                                                            {...qa('deals.kanban.activity', { deal: deal.id })}
                                                                        >
                                                                            {formatKanbanActivityLabel(next)}
                                                                        </div>
                                                                    ) : null
                                                                })()}
                                                                <div className="flex items-center justify-between mt-2">
                                                                    {(() => {
                                                                        const assignee = resolveAssigneeName(deal)
                                                                        return assignee ? (
                                                                            <div className="text-xs text-gray-500">
                                                                                {assignee}
                                                                            </div>
                                                                        ) : null
                                                                    })()}
                                                                    {(() => {
                                                                        const daysInfo = getDaysOnStage(deal)
                                                                        return (
                                                                            <div className={`text-xs font-medium ${daysInfo.color}`}>
                                                                                {daysInfo.text}
                                                                            </div>
                                                                        )
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </KanbanColumnScroll>
                                        )}
                                    </Droppable>
                                </div>
                            )
                        })}
                    </div>
                </DragDropContext>
            </div>
            </AdaptiveCard>

            <Drawer
                isOpen={drawerOpen}
                onClose={() => {
                    setDrawerOpen(false)
                    resetCreateForm()
                }}
                title="Создать сделку"
                footer={
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="plain"
                            onClick={() => {
                                setDrawerOpen(false)
                                resetCreateForm()
                            }}
                        >
                            Отмена
                        </Button>
                        <Button
                            variant="solid"
                            color="primary"
                            loading={creating}
                            disabled={!createForm.name || creating}
                            onClick={handleCreate}
                            {...qa('deals.create.submit')}
                        >
                            Создать
                        </Button>
                    </div>
                }
            >
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Название сделки *</label>
                        <Input
                            placeholder="Введите название сделки"
                            value={createForm.name}
                            onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                            {...qa('deals.create.name')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Сумма</label>
                        <Input
                            type="number"
                            placeholder="Введите сумму"
                            value={createForm.amount}
                            onChange={(e) => setCreateForm((p) => ({ ...p, amount: e.target.value }))}
                            {...qa('deals.create.amount')}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Источник</label>
                        <Select
                            placeholder="Выберите источник"
                            isClearable
                            options={sourceOptions}
                            value={sourceOptions.find((o) => o.value === createForm.source) || null}
                            onChange={(opt) => setCreateForm((p) => ({ ...p, source: opt?.value || '' }))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Ответственный</label>
                        <Select
                            placeholder="Выберите ответственного"
                            isClearable
                            options={memberOptions}
                            value={memberOptions.find((o) => o.value === createForm.assigneeId) || null}
                            onChange={(opt) => setCreateForm((p) => ({ ...p, assigneeId: opt?.value || '' }))}
                        />
                    </div>
                </div>
            </Drawer>

            {closeDialog && (
                <CloseDealDialog
                    result={closeDialog.result}
                    deal={closeDialog.deal}
                    isOpen={!!closeDialog}
                    onClose={() => setCloseDialog(null)}
                    onClosed={() => {
                        setColMeta({})
                        mutate()
                    }}
                />
            )}
        </Container>
    )
}

export default DealKanban
