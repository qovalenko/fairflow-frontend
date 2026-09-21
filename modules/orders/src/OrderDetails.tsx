import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import useSWR from 'swr'
import {
    PiWarningDuotone,
    PiClockCountdownDuotone,
    PiFileTextDuotone,
    PiClockCounterClockwiseDuotone,
    PiPaperPlaneTiltDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Loading from '@/components/shared/Loading'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Tabs from '@/components/ui/Tabs'
import usePermission from '@/utils/hooks/usePermission'
import {
    apiGetOrder,
    apiGetOrderType,
    apiGetOrderHistory,
    apiGetActivities,
    apiMoveOrderStage,
    apiRetryOrderFinalAction,
    apiAcceptOrderDrift,
    apiCheckOrderDrift,
    apiCancelOrder,
} from '@/services/CrmService'
import type {
    Order,
    OrderTypeDetail,
    OrderDriftStatus,
    OrderHistoryItem,
    Activity,
} from '@/@types/crm'
import DocumentsTab from '@/components/shared/documents/DocumentsTab'
import useDocumentsModuleEnabled from '@/utils/hooks/useDocumentsModuleEnabled'
import HistoryTimeline, {
    type HistoryTimelineEvent,
} from '@/components/shared/HistoryTimeline'
import HostSlot from '@/components/shared/HostSlot'
import UserProfileLink from '@/components/shared/UserProfileLink'
import { CompanyActivitiesWidget } from '@fairflow/shared-ui'
import OrderHeaderWidget from './OrderHeaderWidget'
import OrderInfoWidget from './OrderInfoWidget'
import {
    extractError,
    notifyError,
    notifySuccess,
    formatOrderDate,
    isModuleDisabledError,
    ModuleDisabledNotice,
} from './orderUtils'
import { qa } from './qa'

const { TabNav, TabList, TabContent } = Tabs

const OrderDetails = () => {
    const { id } = useParams<{ id: string }>()
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState('info')
    const documentsModuleEnabled = useDocumentsModuleEnabled()

    const can = usePermission()
    const canMove = can('orders', 'move')

    const { data: order, isLoading, error, mutate } = useSWR(
        id ? [`/api/v1/orders/${id}`, id] : null,
        () => apiGetOrder<Order>(id!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // FR-ORDERS-120: продажа закреплена за ревизией типа (`orderTypeVersion`), и
    // сервер валидирует переходы/поля именно по ней. Раньше карточка строила
    // прогресс по ТЕКУЩЕЙ версии типа (`GET /order-types`) — после любой правки
    // типа UI показывал этапы, которых у этой продажи нет.
    const { data: typeDetail } = useSWR(
        order ? [`/api/v1/order-types/${order.typeId}`, order.typeId, order.orderTypeVersion] : null,
        () => apiGetOrderType<OrderTypeDetail>(order!.typeId, order!.orderTypeVersion),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    // FR-ORDERS-360: пер-филд diff дрейфа (§3.14 CheckDrift). Тянем только когда
    // сервер отдал hasDrift — иначе лишний запрос на каждой карточке.
    const { data: driftStatus, isLoading: driftLoading, mutate: mutateDrift } = useSWR(
        order?.hasDrift ? [`/api/v1/orders/${order.id}/drift`, order.id] : null,
        () => apiCheckOrderDrift<OrderDriftStatus>(order!.id),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const { data: activitiesData, isLoading: activitiesLoading } = useSWR(
        order ? ['/api/v1/activities', { pageSize: 1000, orderId: order.id }] : null,
        () => apiGetActivities<{ list: Activity[]; total: number }, { pageSize: number; orderId: string }>({ pageSize: 1000, orderId: order!.id }),
        { revalidateOnFocus: false },
    )

    const activities = activitiesData?.list || []

    /**
     * TODO-414: реальная лента изменений продажи из неизменяемой цепочки audit
     * (`GET /v1/orders/:id/history`) — тот же контракт, что у контактов/компаний.
     * Раньше карточка «История» рисовала два выдуманных события из createdAt/
     * updatedAt с автором из ответственного; теперь показываем то, что произошло
     * на самом деле, а при пустой ленте — честную пустоту, а не подделку.
     */
    const {
        data: historyData,
        error: historyError,
        isLoading: historyLoading,
    } = useSWR(
        order ? [`/api/v1/orders/${order.id}/history`, order.id] : null,
        () => apiGetOrderHistory<{ items: OrderHistoryItem[] }>(order!.id, { limit: 50 }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const historyEvents: HistoryTimelineEvent[] = useMemo(
        () =>
            (historyData?.items ?? []).map((ev, idx) => ({
                id: ev.id || `h${idx}`,
                timestamp: ev.timestamp,
                time: formatOrderDate(ev.timestamp),
                // Автора не выдумываем: у служебных фактов саги его нет и быть не должно.
                user: ev.userName || ev.userId || '—',
                action: ev.summary || ev.type || 'Изменение',
                details: '',
                diff: ev.changedFields?.map((c) => ({
                    field: c.field,
                    old: c.old || '—',
                    new: c.new || '—',
                })),
            })),
        [historyData],
    )

    // Этапы закреплённой ревизии, упорядоченные по `order` (домен не гарантирует
    // порядок в массиве).
    const revisionStages = useMemo(() => {
        const stages = typeDetail?.revision?.stages
        if (!Array.isArray(stages)) return []
        return [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    }, [typeDetail])

    const stageOptions = useMemo(
        () => revisionStages.map((s) => ({ value: s.id, label: s.name })),
        [revisionStages],
    )

    // FR-ORDERS-320: попытки — свежие сверху (домен пушит их в конец массива).
    const finalActionAttempts = useMemo(() => {
        const attempts = order?.finalActionState?.attempts
        if (!Array.isArray(attempts) || attempts.length === 0) return []
        return [...attempts].sort((a, b) => (b.attemptNo ?? b.at ?? 0) - (a.attemptNo ?? a.at ?? 0))
    }, [order])

    const handleEdit = () => navigate(`/orders/${id}/edit`)
    // FR-MORD-15: переход по этапам через API; required/drift-gate → toast (ST-7).
    const handleMoveToStage = async (stageId: string) => {
        if (!order || !canMove) return
        try {
            await apiMoveOrderStage(order.id, stageId)
            notifySuccess('Этап изменён')
            mutate()
        } catch (err) {
            toast.push(
                <Notification title="Ошибка" type="danger" {...qa('orders.details.moveStageError')}>
                    {extractError(err, 'Не удалось изменить этап')}
                </Notification>,
                { placement: 'top-center' },
            )
        }
    }

    // FR-MORD-27: повтор финального действия (Manager+).
    const handleRetryFinalAction = async () => {
        if (!order) return
        try {
            await apiRetryOrderFinalAction(order.id)
            notifySuccess('Отправка запущена повторно')
            mutate()
        } catch (err) {
            notifyError(extractError(err, 'Не удалось повторить отправку'))
        }
    }

    // FR-MORD-21: подтверждение drift (перезахват snapshot).
    const handleAcceptDrift = async () => {
        if (!order) return
        try {
            await apiAcceptOrderDrift(order.id)
            notifySuccess('Изменения реквизитов приняты')
            mutate()
            // Снимок перезахвачен — старый diff больше не актуален.
            mutateDrift()
        } catch (err) {
            notifyError(extractError(err, 'Не удалось принять изменения'))
        }
    }

    // FR-MORD-29: отмена продажи → CANCELLED (ACTIVE|SEND_ERROR → CANCELLED).
    const [cancelling, setCancelling] = useState(false)
    const handleCancel = async () => {
        if (!order) return
        if (!window.confirm(`Отменить продажу ${order.number}? Действие необратимо.`)) return
        setCancelling(true)
        try {
            await apiCancelOrder(order.id)
            notifySuccess('Продажа отменена')
            mutate()
        } catch (err) {
            notifyError(extractError(err, 'Не удалось отменить продажу'))
        } finally {
            setCancelling(false)
        }
    }

    // Отмена доступна только из не-терминальных статусов (контракт §3.12).
    const cancellable = (s?: string) => s === 'ACTIVE' || s === 'SEND_ERROR' || s === 'active' || s === 'error'

    if (isLoading) {
        return (
            <Container>
                <Loading loading={true} />
            </Container>
        )
    }

    // ST-6: ошибка загрузки (различимо от ST-9). 404 → «не найдена» (ST-9),
    // прочее (500/сеть) → честная ошибка с текстом от BFF для диагностики.
    const errStatus = (error as { response?: { status?: number } } | undefined)?.response?.status
    if (error && errStatus === 404) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-8" {...qa('orders.details.notFound')}>
                        <p className="text-gray-500">Продажа не найдена</p>
                        <Button
                            variant="solid"
                            color="primary"
                            className="mt-4"
                            {...qa('orders.details.backToList')}
                            onClick={() => navigate('/orders')}
                        >
                            Вернуться к списку
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }
    // TODO-416 / ST-17: 403 MODULE_DISABLED — модуль выключен в проекте.
    // Ретрай не поможет: показываем «Раздел выключен» + CTA в настройки модулей.
    if (error && isModuleDisabledError(error)) {
        return (
            <Container>
                <AdaptiveCard>
                    <ModuleDisabledNotice text="Карточка продажи станет доступна после включения модуля «Продажи» в настройках проекта." />
                    <div className="text-center">
                        <Button variant="plain" {...qa('orders.details.backToList')} onClick={() => navigate('/orders')}>
                            К списку
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }
    if (error) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-8" {...qa('orders.details.loadError')}>
                        <p className="text-gray-500">Не удалось загрузить продажу</p>
                        <p className="text-xs text-gray-400 mt-1">{extractError(error, 'Ошибка загрузки')}</p>
                        <div className="flex justify-center gap-2 mt-4">
                            <Button
                                variant="solid"
                                color="primary"
                                {...qa('orders.details.loadRetry')}
                                onClick={() => mutate()}
                            >
                                Повторить
                            </Button>
                            <Button
                                variant="plain"
                                {...qa('orders.details.backToList')}
                                onClick={() => navigate('/orders')}
                            >
                                К списку
                            </Button>
                        </div>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    // ST-9: не найдена / скрыта видимостью.
    if (!order) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-8" {...qa('orders.details.notFound')}>
                        <p className="text-gray-500">Продажа не найдена</p>
                        <Button
                            variant="solid"
                            color="primary"
                            className="mt-4"
                            {...qa('orders.details.backToList')}
                            onClick={() => navigate('/orders')}
                        >
                            Вернуться к списку
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container>
            <div className="flex flex-col gap-4">
                <OrderHeaderWidget
                    order={order}
                    stageOptions={stageOptions}
                    onEdit={handleEdit}
                    onMoveToStage={handleMoveToStage}
                />

                {/* EL-DET-BTN-CANCEL (FR-MORD-29): отмена продажи — orders:write, из ACTIVE/SEND_ERROR. */}
                {can('orders', 'write') && cancellable(order.status) && (
                    <div className="flex justify-end">
                        <Button
                            size="sm"
                            variant="plain"
                            className="text-red-600 hover:text-red-700"
                            loading={cancelling}
                            {...qa('orders.details.cancel')}
                            onClick={handleCancel}
                        >
                            Отменить продажу
                        </Button>
                    </div>
                )}

                {(order.status === 'error' || order.status === 'SEND_ERROR') && (
                    <div
                        className="flex items-start justify-between gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                        {...qa('orders.details.sendErrorBanner')}
                    >
                        <div className="flex items-start gap-3">
                            <PiWarningDuotone className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <div className="font-semibold text-red-700 dark:text-red-400 mb-1">
                                    Ошибка отправки (финальное действие)
                                </div>
                                <div className="text-sm text-red-600 dark:text-red-300">
                                    {order.dlqError || 'Финальное действие не выполнено. Доступен повтор после исправления.'}
                                </div>
                            </div>
                        </div>
                        {/* FR-MORD-27: повтор — Manager+ (orders.integration:invoke). */}
                        {can('orders.integration', 'invoke') && (
                            <Button
                                size="sm"
                                variant="solid"
                                color="red"
                                {...qa('orders.details.retry')}
                                onClick={handleRetryFinalAction}
                            >
                                Повторить отправку
                            </Button>
                        )}
                    </div>
                )}

                {/* FR-ORDERS-250/360/380: баннер по РЕАЛЬНОМУ полю ответа `hasDrift`
                    (раньше условие висело на несуществующем `driftWarning` — баннер
                    не показывался никогда), diff — из §3.14 CheckDrift. */}
                {order.hasDrift && (
                    <div
                        className="flex items-start justify-between gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                        {...qa('orders.details.driftBanner')}
                    >
                        <div className="flex items-start gap-3 min-w-0">
                            <PiClockCountdownDuotone className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <div className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
                                    {driftStatus?.sourceState === 'deleted'
                                        ? 'Источник реквизитов удалён'
                                        : 'Реквизиты изменились (drift)'}
                                </div>
                                <div className="text-sm text-amber-600 dark:text-amber-300">
                                    {driftStatus?.sourceState === 'deleted'
                                        ? 'Контакт или компания, из которых собран снимок продажи, удалены. Оформление заблокировано до подтверждения.'
                                        : 'Реквизиты контакта/компании изменились после создания продажи. Пока изменения не приняты, перевод на следующий этап заблокирован.'}
                                </div>

                                {/* ST-1: diff ещё грузится. */}
                                {driftLoading && (
                                    <div
                                        className="text-xs text-amber-600/80 dark:text-amber-300/80 mt-2"
                                        {...qa('orders.details.driftLoading')}
                                    >
                                        Загружаем список изменений…
                                    </div>
                                )}

                                {/* Пер-филд diff (было → стало). */}
                                {!driftLoading && !!driftStatus?.diffs?.length && (
                                    <div className="mt-3 overflow-x-auto" {...qa('orders.details.driftDiff')}>
                                        <table className="text-xs w-full">
                                            <thead>
                                                <tr className="text-amber-700/70 dark:text-amber-300/70 text-left">
                                                    <th className="pr-4 pb-1 font-medium">Реквизит</th>
                                                    <th className="pr-4 pb-1 font-medium">Было</th>
                                                    <th className="pb-1 font-medium">Стало</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {driftStatus!.diffs!.map((d, i) => (
                                                    <tr
                                                        key={`${d.entity ?? ''}.${d.field ?? ''}.${i}`}
                                                        className="align-top"
                                                    >
                                                        <td className="pr-4 py-0.5 text-amber-800 dark:text-amber-200 whitespace-nowrap">
                                                            {[d.entity, d.field].filter(Boolean).join('.') || '—'}
                                                        </td>
                                                        <td className="pr-4 py-0.5 text-amber-600 dark:text-amber-300 line-through">
                                                            {d.old || '—'}
                                                        </td>
                                                        <td className="py-0.5 text-amber-900 dark:text-amber-100 font-medium">
                                                            {d.new || '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Флаг стоит, а diff пуст — честно говорим, а не рисуем пустую таблицу. */}
                                {!driftLoading &&
                                    driftStatus &&
                                    !driftStatus.diffs?.length &&
                                    driftStatus.sourceState !== 'deleted' && (
                                        <div className="text-xs text-amber-600/80 dark:text-amber-300/80 mt-2">
                                            Детализация изменений недоступна.
                                        </div>
                                    )}
                            </div>
                        </div>
                        {/* FR-MORD-21: принять изменения — владелец/Manager+ (orders:write). */}
                        {can('orders', 'write') && (
                            <Button
                                size="sm"
                                variant="solid"
                                className="bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0"
                                {...qa('orders.details.driftAccept')}
                                onClick={handleAcceptDrift}
                            >
                                Принять изменения
                            </Button>
                        )}
                    </div>
                )}

                {revisionStages.length > 0 && (
                    <div
                        className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                        {...qa('orders.details.progress')}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Прогресс
                                {order.orderTypeVersion != null && (
                                    <span className="text-xs text-gray-400 ml-2">
                                        по версии типа {order.orderTypeVersion}
                                    </span>
                                )}
                            </span>
                            <span className="text-sm font-medium">
                                {revisionStages.findIndex((s) => s.id === order.stageId) + 1} / {revisionStages.length}
                            </span>
                        </div>
                        <div className="flex gap-1">
                            {revisionStages.map((stage, index) => {
                                const currentIndex = revisionStages.findIndex((s) => s.id === order.stageId)
                                const isActive = index === currentIndex
                                const isCompleted = index < currentIndex
                                return (
                                    <div
                                        key={stage.id}
                                        className={`flex-1 h-2 rounded ${
                                            isActive ? 'bg-blue-500' : isCompleted ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-gray-700'
                                        }`}
                                        title={stage.name}
                                    />
                                )
                            })}
                        </div>
                        <div className="flex justify-between mt-1 overflow-x-auto gap-1">
                            {revisionStages.map((stage, index) => {
                                const currentIndex = revisionStages.findIndex((s) => s.id === order.stageId)
                                return (
                                    <span
                                        key={stage.id}
                                        className={`text-xs flex-shrink-0 ${
                                            index === currentIndex
                                                ? 'font-semibold text-blue-600 dark:text-blue-400'
                                                : index < currentIndex
                                                  ? 'text-emerald-600 dark:text-emerald-400'
                                                  : 'text-gray-500'
                                        }`}
                                    >
                                        {stage.name}
                                    </span>
                                )
                            })}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 flex flex-col min-h-0">
                        <Tabs value={activeTab} onChange={(val) => setActiveTab(val)}>
                            <Card
                                className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
                                bodyClass="flex-1 min-h-0 flex flex-col overflow-hidden p-0"
                                header={{
                                    content: (
                                        <div className="flex items-center justify-between w-full">
                                            <div className="flex items-center gap-2">
                                                <PiFileTextDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                                <h4 className="text-base font-semibold">Детали</h4>
                                            </div>
                                            <TabList className="!p-0 !border-0 !bg-transparent !min-h-0">
                                                <TabNav value="info" className="!py-1 !px-2 text-sm" {...qa('orders.details.tabInfo')}>
                                                    Информация
                                                </TabNav>
                                                {documentsModuleEnabled && (
                                                    <TabNav
                                                        value="documents"
                                                        className="!py-1 !px-2 text-sm"
                                                        {...qa('orders.details.tab', { tab: 'documents' })}
                                                    >
                                                        Документы
                                                    </TabNav>
                                                )}
                                            </TabList>
                                        </div>
                                    ),
                                    bordered: true,
                                }}
                            >
                                <div className="p-5 overflow-y-auto flex-1">
                                    <TabContent value="info">
                                        <OrderInfoWidget
                                            order={order}
                                            onDealClick={(dealId) => navigate(`/deals/${dealId}`)}
                                            onContactClick={(contactId) => navigate(`/contacts/${contactId}`)}
                                            onCompanyClick={(companyId) => navigate(`/companies/${companyId}`)}
                                            embedded
                                        />
                                    </TabContent>
                                    {documentsModuleEnabled && (
                                        <TabContent value="documents">
                                            <DocumentsTab contextType="order" recordId={order.id} />
                                        </TabContent>
                                    )}
                                </div>
                            </Card>
                        </Tabs>
                    </div>
                    {/* FR-ACTIVITIES-150 / RFC-3 §1.2: mount-point `order.card.tab`.
                        Врезка «Активности» приезжает из модуля activities
                        (ActivityCardTab: хронология + «следующий шаг» + «+ Активность»),
                        если модуль включён в проекте и есть право. Иначе (модуль
                        выключен, standalone-режим) остаётся встроенный
                        read-only-таймлайн — дублирования на экране нет. */}
                    <div className="flex flex-col min-h-0" {...qa('orders.details.activities')}>
                        <HostSlot
                            id="order.card.tab"
                            context={{ orderId: order.id }}
                            className="flex flex-col gap-4 min-h-0"
                            fallback={
                                <CompanyActivitiesWidget
                                    activities={activities}
                                    onActivityClick={(activity) => navigate(`/activities/${activity.id}`)}
                                    loading={activitiesLoading}
                                    renderAssignee={(activity) =>
                                        activity.assigneeId && activity.assigneeName ? (
                                            <UserProfileLink userId={activity.assigneeId}>
                                                {activity.assigneeName}
                                            </UserProfileLink>
                                        ) : (
                                            activity.assigneeName
                                        )
                                    }
                                />
                            }
                        />
                    </div>
                </div>

                {/* FR-ORDERS-320: лог попыток финального действия. gateway отдаёт его
                    в `order.finalActionState` (attempts[] + lastError), но UI его ни
                    разу не показывал — при провале отправки пользователь видел только
                    статус SEND_ERROR без кодов ответа и истории. */}
                {finalActionAttempts.length > 0 && (
                    <Card
                        className="w-full flex flex-col border border-gray-200 dark:border-gray-700"
                        bodyClass="flex flex-col"
                        {...qa('orders.details.attemptsTable')}
                        header={{
                            content: (
                                <div className="flex items-center justify-between w-full gap-2">
                                    <div className="flex items-center gap-2">
                                        <PiPaperPlaneTiltDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                        <h4 className="text-base font-semibold">Попытки отправки</h4>
                                    </div>
                                    {order.finalActionState?.status && (
                                        <span className="text-xs text-gray-500">
                                            Статус: {order.finalActionState.status}
                                        </span>
                                    )}
                                </div>
                            ),
                            bordered: true,
                        }}
                    >
                        {order.finalActionState?.lastError && (
                            <div className="mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300 break-words">
                                {order.finalActionState.lastError}
                            </div>
                        )}
                        <div className="overflow-x-auto">
                            <table className="text-sm w-full">
                                <thead>
                                    <tr className="text-gray-500 text-left border-b border-gray-200 dark:border-gray-700">
                                        <th className="pr-4 py-2 font-medium">#</th>
                                        <th className="pr-4 py-2 font-medium">Время</th>
                                        <th className="pr-4 py-2 font-medium">Код</th>
                                        <th className="pr-4 py-2 font-medium">Длительность</th>
                                        <th className="py-2 font-medium">Ответ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {finalActionAttempts.map((a, i) => {
                                        const code = a.responseCode
                                        const ok = typeof code === 'number' && code >= 200 && code < 300
                                        return (
                                            <tr
                                                key={`${a.attemptNo ?? i}-${a.at ?? i}`}
                                                className="border-b border-gray-100 dark:border-gray-800 last:border-0 align-top"
                                            >
                                                <td className="pr-4 py-2 whitespace-nowrap">{a.attemptNo ?? i + 1}</td>
                                                <td className="pr-4 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">
                                                    {a.at ? formatOrderDate(a.at) : '—'}
                                                </td>
                                                <td className="pr-4 py-2 whitespace-nowrap">
                                                    {code == null ? (
                                                        <span className="text-gray-400">—</span>
                                                    ) : (
                                                        <span
                                                            className={
                                                                ok
                                                                    ? 'text-emerald-600 dark:text-emerald-400'
                                                                    : 'text-red-600 dark:text-red-400'
                                                            }
                                                        >
                                                            {code}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="pr-4 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">
                                                    {a.durationMs != null ? `${a.durationMs} мс` : '—'}
                                                </td>
                                                <td className="py-2 text-gray-600 dark:text-gray-300 break-words max-w-md">
                                                    {a.errorBody || '—'}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {order.finalActionState?.succeededAt && (
                            <div className="mt-3 text-xs text-emerald-600 dark:text-emerald-400">
                                Успешно отправлено {formatOrderDate(order.finalActionState.succeededAt)}
                            </div>
                        )}
                    </Card>
                )}

                <Card
                    className="w-full flex flex-col border border-gray-200 dark:border-gray-700"
                    bodyClass="flex flex-col"
                    {...qa('orders.details.tabHistory')}
                    header={{
                        content: (
                            <div className="flex items-center gap-2">
                                <PiClockCounterClockwiseDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                <h4 className="text-base font-semibold">История</h4>
                            </div>
                        ),
                        bordered: true,
                    }}
                >
                    {/*
                     * TODO-414: факты самой продажи (создана/изменена) + РЕАЛЬНАЯ лента
                     * событий из цепочки audit. Синтетических событий с выдуманным автором
                     * и diff тут больше нет: пусто — значит записей действительно нет.
                     */}
                    <dl className="text-sm">
                        <div className="flex items-center justify-between gap-4 py-1">
                            <dt className="text-gray-500 dark:text-gray-400">Создана</dt>
                            <dd className="text-gray-800 dark:text-gray-100">
                                {formatOrderDate(order.createdAt)}
                            </dd>
                        </div>
                        <div className="flex items-center justify-between gap-4 py-1">
                            <dt className="text-gray-500 dark:text-gray-400">
                                Последнее изменение
                            </dt>
                            <dd className="text-gray-800 dark:text-gray-100">
                                {formatOrderDate(order.updatedAt)}
                            </dd>
                        </div>
                    </dl>
                    <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-2">
                        {historyError ? (
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                Не удалось загрузить историю изменений.
                            </div>
                        ) : historyLoading ? (
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                Загрузка истории…
                            </div>
                        ) : (
                            <HistoryTimeline
                                events={historyEvents}
                                emptyMessage="Изменений пока не зафиксировано"
                            />
                        )}
                    </div>
                </Card>
            </div>
        </Container>
    )
}

export default OrderDetails
