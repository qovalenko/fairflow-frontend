import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import useSWR from 'swr'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import {
    PiListDuotone,
    PiKanbanDuotone,
    PiGearSixDuotone,
    PiWarningDuotone,
    PiClockCountdownDuotone,
    PiPlusDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Tooltip from '@/components/ui/Tooltip'
import Segment from '@/components/ui/Segment'
import Select from '@/components/ui/Select'
import EntityCreateDrawer from '@/components/template/EntityCreateDrawer'
import useSegmentRouteTransition from '@/utils/hooks/useSegmentRouteTransition'
import Tag from '@/components/ui/Tag'
import Loading from '@/components/shared/Loading'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import usePermission from '@/utils/hooks/usePermission'
import { apiGetOrdersKanban, apiGetOrderTypes, apiMoveOrderStage } from '@/services/CrmService'
import type { Order, OrderTypeStage, OrderType } from '@/@types/crm'
import {
    normalizeList,
    formatOrderDate,
    isModuleDisabledError,
    ModuleDisabledNotice,
} from './orderUtils'
import { qa } from './qa'

type KanbanColumn = OrderTypeStage & { orders: Order[] }
type KanbanData = {
    typeId?: string
    columns: KanbanColumn[]
}

const OrderKanban = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const location = useLocation()
    const can = usePermission()
    const canWrite = can('orders', 'write')
    const canMove = can('orders', 'move')
    const isKanbanView = location.pathname.includes('/kanban')
    const [orderDrawerOpen, setOrderDrawerOpen] = useState(false)
    const [typeId, setTypeId] = useState<string>('')

    // Типы продаж — для селектора (EL-KAN-TYPE-SELECT, FR-MORD-30).
    const { data: typesData } = useSWR(
        pid ? ['/api/v1/order-types', pid] : null,
        () => apiGetOrderTypes<OrderType[] | { list: OrderType[] }>(),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )
    const typeOptions = useMemo(
        () => normalizeList<OrderType>(typesData).map((t) => ({ value: t.id, label: t.name })),
        [typesData],
    )

    const { data: kanbanData, isLoading, error, mutate } = useSWR<KanbanData>(
        pid ? ['/api/v1/orders/kanban', pid, typeId] : null,
        async () => {
            // API отдаёт колонки как { stageId, stageName, orders/items }, а UI ждёт { id, name }.
            // typeId уходит в запрос (BFF `GET /orders/kanban?typeId=`): раньше
            // селектор типа менял только ключ SWR, а доска всегда приходила по
            // первому типу проекта.
            const raw = await apiGetOrdersKanban<KanbanData & { columns?: unknown[] }>(typeId || undefined)
            const cols = (raw?.columns ?? []) as Array<
                Partial<KanbanColumn> & { stageId?: string; stageName?: string; items?: Order[] }
            >
            return {
                ...raw,
                columns: cols.map((c) => ({
                    ...c,
                    id: c.id ?? c.stageId ?? '',
                    name: c.name ?? c.stageName ?? '',
                    orders: c.orders ?? c.items ?? [],
                })) as KanbanColumn[],
            }
        },
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // BFF без typeId отдаёт доску по «умному» дефолту (тип с продажами, не types[0]).
    // Синхронизируем селектор, чтобы UI не показывал пустой placeholder при
    // уже загруженной доске другого типа.
    useEffect(() => {
        if (!typeId && kanbanData?.typeId) {
            setTypeId(kanbanData.typeId)
        }
    }, [kanbanData?.typeId, typeId])

    const orderListToolbarAnimateKey = 'crm:orders:list-toolbar-animate'

    const navigateToView = (value: string) => {
        if (value === 'kanban') navigate('/orders/kanban')
        else if (value === 'types') navigate('/orders/types')
        else {
            window.sessionStorage.setItem(orderListToolbarAnimateKey, '1')
            navigate('/orders')
        }
    }

    const [segmentValue, handleViewToggle] = useSegmentRouteTransition(
        isKanbanView ? 'kanban' : 'list',
        navigateToView,
    )

    const onDragEnd = async (result: DropResult) => {
        const { destination, source, draggableId } = result
        if (!destination) return
        if (destination.droppableId === source.droppableId && destination.index === source.index) return
        if (!canMove || !kanbanData) return

        const sourceColumn = kanbanData.columns.find((col) => col.id === source.droppableId)
        const destColumn = kanbanData.columns.find((col) => col.id === destination.droppableId)
        if (!sourceColumn || !destColumn) return
        const order = sourceColumn.orders.find((o) => o.id === draggableId)
        if (!order) return

        // Optimistic update (ST-29).
        const newColumns = kanbanData.columns.map((col) => {
            if (col.id === source.droppableId) {
                return { ...col, orders: col.orders.filter((o) => o.id !== draggableId) }
            }
            if (col.id === destination.droppableId) {
                const newOrders = [...col.orders]
                newOrders.splice(destination.index, 0, {
                    ...order,
                    stageId: col.id,
                    stageName: col.name,
                })
                return { ...col, orders: newOrders }
            }
            return col
        })
        mutate({ ...kanbanData, columns: newColumns }, false)

        // Persist (FR-MORD-15): required-gate/drift-gate ошибки → откат + toast (ST-7).
        try {
            await apiMoveOrderStage(draggableId, destColumn.id)
            mutate()
        } catch (err) {
            const e = err as { response?: { data?: { error?: { message?: string; code?: string } } } }
            const code = e?.response?.data?.error?.code
            const msg =
                e?.response?.data?.error?.message ||
                (code === 'REQUIRED_FIELDS_MISSING'
                    ? 'Не заполнены обязательные поля этапа'
                    : code === 'DRIFT_NOT_ACCEPTED'
                      ? 'Реквизиты изменились — подтвердите перед оформлением'
                      : 'Не удалось переместить продажу')
            toast.push(
                <Notification title="Ошибка" type="danger" {...qa('orders.kanban.moveError')}>
                    {msg}
                </Notification>,
                { placement: 'top-center' },
            )
            mutate() // rollback к серверному состоянию
        }
    }

    const getCardBorderColor = (order: Order) => {
        if (order.status === 'error' || order.status === 'SEND_ERROR') return 'border-l-4 border-l-red-500'
        if (order.status === 'completed' || order.status === 'DONE') return 'border-l-4 border-l-gray-400'
        if (order.status === 'SENDING') return 'border-l-4 border-l-amber-500'
        return 'border-l-4 border-l-blue-500'
    }

    const toolbar = (
        <div className="flex items-center justify-between">
            <div>
                <h3>Продажи</h3>
                <p className="text-sm text-gray-500 mt-1">Продажи создаются из карточки сделки</p>
            </div>
            <div className="flex items-center gap-2">
                {typeOptions.length > 1 && (
                    <div className="w-[200px]" {...qa('orders.kanban.typeSelect')}>
                        <Select
                            size="sm"
                            placeholder="Тип продажи"
                            isClearable
                            options={typeOptions}
                            value={typeOptions.find((o) => o.value === typeId) || null}
                            onChange={(opt) => setTypeId(opt?.value || '')}
                        />
                    </div>
                )}
                {canWrite && (
                    <Tooltip title="Создать продажу">
                        <span className="inline-flex">
                            <Button
                                variant="solid"
                                color="primary"
                                size="sm"
                                icon={<PiPlusDuotone />}
                                {...qa('orders.kanban.create')}
                                onClick={() => setOrderDrawerOpen(true)}
                            />
                        </span>
                    </Tooltip>
                )}
                <Tooltip title="Типы продаж">
                    <Button
                        variant="plain"
                        size="sm"
                        icon={<PiGearSixDuotone className="w-4 h-4" />}
                        {...qa('orders.kanban.typesGear')}
                        onClick={() => navigate('/orders/types')}
                    />
                </Tooltip>
                <Segment value={segmentValue} onChange={(val) => handleViewToggle(val as string)} size="sm">
                    <Segment.Item value="list">
                        <div className="flex items-center gap-1" {...qa('orders.list.viewList')}>
                            <PiListDuotone className="w-4 h-4" />
                            <span>Список</span>
                        </div>
                    </Segment.Item>
                    <Segment.Item value="kanban">
                        <div className="flex items-center gap-1" {...qa('orders.list.viewKanban')}>
                            <PiKanbanDuotone className="w-4 h-4" />
                            <span>Доска</span>
                        </div>
                    </Segment.Item>
                </Segment>
            </div>
        </div>
    )

    // ST-19: проект не выбран.
    if (!pid) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="flex flex-col gap-4">
                        {toolbar}
                        <div className="text-center py-10" {...qa('orders.kanban.noProject')}>
                            <p className="text-gray-500 mb-1">Проект не выбран</p>
                            <p className="text-sm text-gray-400">Выберите или создайте проект.</p>
                        </div>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ST-1: загрузка.
    if (isLoading) {
        return (
            <Container>
                <Loading loading={true} />
            </Container>
        )
    }

    const columns = kanbanData?.columns ?? []
    const isEmpty = columns.length === 0 || columns.every((c) => c.orders.length === 0)

    return (
        <Container>
            <AdaptiveCard>
                <div className="flex flex-col gap-4">
                    {toolbar}

                    {/* TODO-416 / ST-17: модуль выключен в проекте → «Повторить» бесполезен. */}
                    {error && isModuleDisabledError(error) ? (
                        <div {...qa('orders.kanban.moduleDisabled')}>
                            <ModuleDisabledNotice text="Доска продаж станет доступна после включения модуля «Продажи» в настройках проекта." />
                        </div>
                    ) : error ? (
                        <div className="text-center py-10">
                            <p className="text-gray-500">Не удалось загрузить доску</p>
                            <Button
                                variant="solid"
                                color="primary"
                                className="mt-4"
                                {...qa('orders.kanban.retry')}
                                onClick={() => mutate()}
                            >
                                Повторить
                            </Button>
                        </div>
                    ) : columns.length === 0 ? (
                        /* ST-3: нет типов/этапов → онбординг в конструктор. */
                        <div className="text-center py-10" {...qa('orders.kanban.empty')}>
                            <p className="text-gray-500 mb-1">Доска пуста</p>
                            <p className="text-sm text-gray-400 mb-4">
                                Нет типов продаж с этапами. Создайте тип продажи, чтобы появились колонки.
                            </p>
                            <Button
                                variant="solid"
                                color="primary"
                                icon={<PiGearSixDuotone />}
                                {...qa('orders.kanban.typesCta')}
                                onClick={() => navigate('/orders/types')}
                            >
                                К типам продаж
                            </Button>
                        </div>
                    ) : (
                        <>
                            {/* ST-4: тип выбран, но продаж нет (мягкая подсказка над доской). */}
                            {isEmpty && (
                                <p className="text-sm text-gray-400">
                                    По выбранному типу продаж пока нет — перетащите карточку или создайте продажу.
                                </p>
                            )}
                            <DragDropContext onDragEnd={onDragEnd}>
                                <div className="flex gap-4 overflow-x-auto pb-4">
                                    {columns.map((column) => (
                                        <div
                                            key={column.id}
                                            className="flex-shrink-0 w-[300px] bg-gray-50 dark:bg-gray-800 rounded-lg p-4"
                                            {...qa('orders.kanban.column', { stage: column.id })}
                                        >
                                            <div className="mb-4">
                                                <div className="flex items-center justify-between mb-1">
                                                    <h4 className="font-semibold text-lg">{column.name}</h4>
                                                    <span className="text-sm text-gray-500 bg-white dark:bg-gray-700 px-2 py-1 rounded">
                                                        {column.orders.length}
                                                    </span>
                                                </div>
                                            </div>

                                            <Droppable droppableId={column.id} isDropDisabled={!canMove}>
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.droppableProps}
                                                        className={`min-h-[200px] space-y-2 transition-colors rounded-lg p-1 ${
                                                            snapshot.isDraggingOver ? 'bg-gray-100 dark:bg-gray-700' : ''
                                                        }`}
                                                    >
                                                        {column.orders.map((order, index) => (
                                                            <Draggable
                                                                key={order.id}
                                                                draggableId={order.id}
                                                                index={index}
                                                                isDragDisabled={!canMove}
                                                            >
                                                                {(dragProvided, dragSnapshot) => (
                                                                    <div
                                                                        ref={dragProvided.innerRef}
                                                                        {...dragProvided.draggableProps}
                                                                        {...dragProvided.dragHandleProps}
                                                                        {...qa('orders.kanban.card', { order: order.id })}
                                                                        className={`bg-white dark:bg-gray-700 rounded-lg p-3 shadow-sm transition-shadow ${
                                                                            canMove ? 'cursor-move' : 'cursor-pointer'
                                                                        } ${
                                                                            dragSnapshot.isDragging
                                                                                ? 'shadow-lg'
                                                                                : 'hover:shadow-md'
                                                                        } ${getCardBorderColor(order)}`}
                                                                        onClick={() => navigate(`/orders/${order.id}`)}
                                                                    >
                                                                        <div className="flex items-center justify-between mb-2">
                                                                            <span className="font-semibold text-sm">
                                                                                {order.number}
                                                                            </span>
                                                                            <Tag className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-xs">
                                                                                {order.typeName}
                                                                            </Tag>
                                                                        </div>

                                                                        {order.dealName && (
                                                                            <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 truncate">
                                                                                {order.dealName}
                                                                            </div>
                                                                        )}

                                                                        <div className="flex items-center justify-between mt-2">
                                                                            <span className="text-xs text-gray-500">
                                                                                {order.assigneeName || '—'}
                                                                            </span>
                                                                            <div className="flex items-center gap-1">
                                                                                {(order.status === 'error' ||
                                                                                    order.status === 'SEND_ERROR') && (
                                                                                    <span
                                                                                        className="text-red-500"
                                                                                        title="Ошибка отправки"
                                                                                    >
                                                                                        <PiWarningDuotone className="w-3.5 h-3.5" />
                                                                                    </span>
                                                                                )}
                                                                                {order.hasDrift && (
                                                                                    <Tooltip title="Реквизиты изменились — откройте продажу, чтобы принять">
                                                                                        <span
                                                                                            className="text-amber-500 inline-flex cursor-help"
                                                                                            {...qa('orders.kanban.driftIcon', { order: order.id })}
                                                                                        >
                                                                                            <PiClockCountdownDuotone className="w-3.5 h-3.5" />
                                                                                        </span>
                                                                                    </Tooltip>
                                                                                )}
                                                                            </div>
                                                                        </div>

                                                                        <div className="text-xs text-gray-400 mt-1">
                                                                            {formatOrderDate(order.createdAt, 'DD.MM.YYYY')}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </Draggable>
                                                        ))}
                                                        {provided.placeholder}
                                                    </div>
                                                )}
                                            </Droppable>
                                        </div>
                                    ))}
                                </div>
                            </DragDropContext>
                        </>
                    )}
                </div>
            </AdaptiveCard>
            <EntityCreateDrawer
                entityType="order"
                isOpen={orderDrawerOpen}
                onClose={() => setOrderDrawerOpen(false)}
                onSuccess={() => {
                    setOrderDrawerOpen(false)
                    mutate()
                }}
            />
        </Container>
    )
}

export default OrderKanban
