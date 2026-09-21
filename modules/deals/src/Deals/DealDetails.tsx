import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import useSWR from 'swr'
import dayjs from 'dayjs'
import {
    PiReceiptDuotone,
    PiClockCounterClockwiseDuotone,
    PiTrophyDuotone,
    PiProhibitDuotone,
    PiArrowCounterClockwiseDuotone,
    PiUserPlusDuotone,
    PiWarningDuotone,
    PiTagDuotone,
    PiQuestion,
    PiArrowRightDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Tabs from '@/components/ui/Tabs'
import Tooltip from '@/components/ui/Tooltip'
import Loading from '@/components/shared/Loading'
import RecordShareControl from '@/components/shared/RecordShareControl'
import DocumentsTab from '@/components/shared/documents/DocumentsTab'
import useDocumentsModuleEnabled from '@/utils/hooks/useDocumentsModuleEnabled'
import { qa } from '../qa'
import HostSlot from '@/components/shared/HostSlot'
import UserProfileLink from '@/components/shared/UserProfileLink'
import usePermission from '@/utils/hooks/usePermission'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import { useSessionUser } from '@/store/authStore'
import { PROJECT_MANAGE_ROLES } from '@/configs/permission.config'
import {
    apiGetDeal,
    apiGetDealStageHistory,
    apiGetPipelines,
    apiGetActivities,
    apiGetDealOrdersSummary,
    apiGetProduct,
    apiDeleteDeal,
    apiMoveDealStage,
    apiFindContactDuplicates,
    apiQualifyDeal,
} from '@/services/CrmService'
import type { Deal, Pipeline, Activity, Order, Product } from '@/@types/crm'
import HistoryTimeline from '@/components/shared/HistoryTimeline'
import DealHeaderWidget from './DealHeaderWidget'
import DealHeaderStats from './DealHeaderStats'
import DealInfoWidget from './DealInfoWidget'
import CompanyOrdersWidget from './CompanyOrdersWidget'
import { CompanyActivitiesWidget } from '@fairflow/shared-ui'
import CloseDealDialog from './CloseDealDialog'
import ReopenDealDialog from './ReopenDealDialog'
import QualifyDealDialog from './QualifyDealDialog'
import DriftPanel from './DriftPanel'
import { dealStatus, isClosed, formatCurrency, extractError, notifyError, notifySuccess } from './dealUtils'

// Box-паттерн: подпись убрана → короткая надпись + «?»-тултип с пояснением.
const HelpIcon = ({ title }: { title: string }) => (
    <Tooltip title={title}>
        <span className="flex cursor-help text-gray-400 hover:text-gray-200">
            <PiQuestion className="text-base" />
        </span>
    </Tooltip>
)

const DealDetails = () => {
    const { id } = useParams<{ id: string }>()
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    // Роль пользователя в текущем проекте — из сессии, которую host уже держит
    // (`user.projects[].role`); отдельного источника роли не заводим.
    const { projects } = useWorkspaceRole()
    const sessionUserId = useSessionUser((s) => s.user.userId)
    const projectRole = useMemo(
        () => projects.find((p) => p.id === pid)?.role,
        [projects, pid],
    )

    const [closeDialog, setCloseDialog] = useState<'won' | 'lost' | null>(null)
    const [reopenOpen, setReopenOpen] = useState(false)
    const [qualifyOpen, setQualifyOpen] = useState(false)
    const [driftOpen, setDriftOpen] = useState(false)
    const [actionPending, setActionPending] = useState(false)
    const [activeTab, setActiveTab] = useState('info')
    const documentsModuleEnabled = useDocumentsModuleEnabled()

    const { data: deal, isLoading: dealLoading, error: dealError, mutate: mutateDeal } = useSWR(
        id && pid ? [`/api/v1/deals/${id}`, id, pid] : null,
        () => apiGetDeal<Deal>(id!, pid!),
        { revalidateOnFocus: false, shouldRetryOnError: false }
    )

    const { data: pipelinesData } = useSWR(
        deal ? ['/api/v1/pipelines'] : null,
        () => apiGetPipelines<Pipeline[]>(),
        { revalidateOnFocus: false }
    )

    const { data: activitiesData, isLoading: activitiesLoading } = useSWR(
        deal ? ['/api/v1/activities', { pageSize: 1000, dealId: deal.id }] : null,
        () => apiGetActivities<{ list: Activity[]; total: number }, { pageSize: number; dealId: string }>({
            pageSize: 1000,
            dealId: deal!.id,
        }),
        { revalidateOnFocus: false }
    )

    const { data: ordersSummary, isLoading: ordersLoading } = useSWR(
        deal ? ['/api/v1/deals/orders-summary', deal.id] : null,
        () => apiGetDealOrdersSummary(deal!.id),
        { revalidateOnFocus: false }
    )

    // FR-ORDERS-440: deal card uses the lightweight orders-summary aggregate,
    // not a full list scan (`pageSize:1000`). The aggregate carries the display
    // names the widget renders (type/stage/product/deal) — see gateway
    // `dealOrdersSummary` / domain `getOrdersSummaryForDeal`.
    const orders = useMemo<Order[]>(
        () =>
            (ordersSummary?.items ?? []).map((item) => ({
                id: item.id,
                number: item.number,
                typeId: '',
                typeName: item.typeName ?? '',
                productName: item.productName || undefined,
                dealName: item.dealName || undefined,
                stageId: item.stageId,
                stageName: item.stageName ?? '',
                assigneeName: item.assigneeName,
                fields: {},
                status: item.status as Order['status'],
                // Агрегат не несёт дат — виджет карточки их не рендерит.
                createdAt: 0,
                updatedAt: 0,
            })),
        [ordersSummary],
    )

    // BX-FLOW-6: «Тип продажи» сделки берётся у её продукта (product.orderTypeId) —
    // делает связь воронка→тип продажи→документы явной прямо на карточке сделки.
    const { data: product, isLoading: productLoading } = useSWR(
        deal?.productId ? [`/api/v1/products/${deal.productId}`, deal.productId, pid] : null,
        () => apiGetProduct<Product>(deal!.productId!, pid || undefined),
        { revalidateOnFocus: false, shouldRetryOnError: false }
    )

    const activities = activitiesData?.list || []

    const currentPipeline = useMemo(() => {
        if (!deal || !pipelinesData) return null
        return pipelinesData.find((p) => p.id === deal.pipelineId)
    }, [deal, pipelinesData])

    const stageOptions = useMemo(() => {
        if (!currentPipeline) return []
        return currentPipeline.stages.map((s) => ({
            value: s.id,
            label: s.name,
        }))
    }, [currentPipeline])

    const { data: stageHistoryData } = useSWR(
        deal && pid ? [`/api/v1/deals/${deal.id}/stage-history`, deal.id, pid] : null,
        () => apiGetDealStageHistory<{
            entries: Array<{
                fromStageId: string
                toStageId: string
                enteredAt: number
                exitedAt: number
                movedBy: string
                kind: string
                durationMs: number
                label?: string
            }>
        }>(deal!.id, pid!),
        { revalidateOnFocus: false },
    )

    // FR-MDEAL-16 / FR-REPORTS-250: полная история из projection; fallback — embedded stageLog.
    const historyEvents = useMemo(() => {
        const apiEntries = stageHistoryData?.entries ?? []
        if (apiEntries.length > 0) {
            const stageName = (stageId: string, label?: string) => {
                if (label) return label
                const s = currentPipeline?.stages.find((x) => x.id === stageId)
                return s?.name || stageId || '—'
            }
            return [...apiEntries]
                .sort((a, b) => b.enteredAt - a.enteredAt)
                .map((entry, i) => ({
                    id: `stage-${i}`,
                    time: dayjs.unix(entry.enteredAt / 1000).format('DD.MM.YYYY HH:mm'),
                    user: entry.movedBy || deal?.assigneeName || '—',
                    action: 'Смена стадии',
                    details: `Стадия: ${stageName(entry.toStageId, entry.label)} (${Math.round(entry.durationMs / 3_600_000)} ч)`,
                }))
        }
        if (!deal) return []
        const log = deal.stageLog
        if (log && log.length > 0) {
            const sorted = [...log].sort((a, b) => b.enteredAt - a.enteredAt)
            return sorted.map((entry, i) => ({
                id: `stage-${i}`,
                time: dayjs.unix(entry.enteredAt).format('DD.MM.YYYY HH:mm'),
                user: deal.assigneeName || '—',
                action: 'Смена стадии',
                details: `Стадия: ${entry.stage}`,
            }))
        }
        return [
            {
                id: 'created',
                time: dayjs.unix(deal.createdAt).format('DD.MM.YYYY HH:mm'),
                user: deal.assigneeName || '—',
                action: 'Создание',
                details: `Сделка «${deal.name}» создана`,
            },
        ]
    }, [deal, stageHistoryData, currentPipeline])

    const handleEdit = () => navigate(`/deals/${id}/edit`)

    const handleDelete = async () => {
        if (!deal) return
        if (!window.confirm('Удалить эту сделку? Её можно будет восстановить из корзины.')) return
        setActionPending(true)
        try {
            await apiDeleteDeal<Deal>(deal.id)
            notifySuccess('Сделка удалена')
            navigate(`/deals`)
        } catch (err) {
            notifyError(extractError(err, 'Не удалось удалить сделку'))
        } finally {
            setActionPending(false)
        }
    }

    const handleMoveToStage = async (stageId: string) => {
        if (!deal || stageId === deal.stageId) return
        const prev = deal
        // Optimistic move; rollback on error (ST-29 / ST-7).
        mutateDeal({ ...deal, stageId }, false)
        setActionPending(true)
        try {
            const updated = await apiMoveDealStage<Deal>(deal.id, stageId)
            mutateDeal(updated ?? { ...prev, stageId }, false)
            notifySuccess('Стадия изменена')
        } catch (err) {
            mutateDeal(prev, false)
            notifyError(extractError(err, 'Не удалось переместить сделку'))
        } finally {
            setActionPending(false)
        }
    }

    /** FR-DEALS-060: a single live exact match auto-qualifies via gateway (no fork). */
    const handleQualifyClick = async () => {
        if (!deal || !pid) return
        const phone = (deal.lightPhone ?? deal.contactPhone ?? '').trim()
        const email = (deal.lightEmail ?? deal.contactEmail ?? '').trim()
        setActionPending(true)
        try {
            if (phone || email) {
                const dup = await apiFindContactDuplicates({
                    projectId: pid,
                    phone: phone || undefined,
                    email: email || undefined,
                })
                const list = dup?.candidates ?? []
                const live = list.filter((c) => !c.deleted)
                const trash = list.filter((c) => c.deleted)
                if (live.length === 1 && trash.length === 0) {
                    await apiQualifyDeal(deal.id, { target: 'contact' })
                    notifySuccess('Контакт привязан автоматически')
                    await mutateDeal()
                    return
                }
            }
            setQualifyOpen(true)
        } catch (err) {
            notifyError(extractError(err, 'Не удалось квалифицировать сделку'))
            setQualifyOpen(true)
        } finally {
            setActionPending(false)
        }
    }

    if (dealLoading) {
        return (
            <Container>
                <Loading loading={true} />
            </Container>
        )
    }

    // ST-6: distinguish a load error (retryable) from a genuine not-found (ST-9).
    if (dealError && !deal) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-8" {...qa('deals.details.error')}>
                        <p className="text-gray-500">Не удалось загрузить сделку</p>
                        <div className="flex justify-center gap-2 mt-4">
                            <Button
                                variant="solid"
                                color="primary"
                                onClick={() => mutateDeal()}
                                {...qa('deals.details.errorRetry')}
                            >
                                Повторить
                            </Button>
                            <Button variant="plain" onClick={() => navigate(`/deals`)}>
                                К списку
                            </Button>
                        </div>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    if (!deal) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-8" {...qa('deals.details.notFound')}>
                        <p className="text-gray-500">Сделка не найдена</p>
                        <Button
                            variant="solid"
                            color="primary"
                            className="mt-4"
                            onClick={() => navigate(`/deals`)}
                        >
                            Вернуться к списку
                        </Button>
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    const status = dealStatus(deal)
    const closed = isClosed(deal)
    const canWrite = can('deals', 'write')

    // BX-FLOW-6: тип продажи + гейт «Создать продажу» по контексту won.
    // Тип продажи настроен, если у продукта есть живой (не dangling) orderTypeId.
    const saleTypeConfigured = !!(product?.orderTypeId && !product.orderTypeDangling)
    const saleTypeLabel = !deal.productId
        ? 'Продукт не указан'
        : productLoading
          ? '…'
          : saleTypeConfigured
            ? product!.orderTypeName || 'Тип продажи'
            : product?.orderTypeName
              ? `${product.orderTypeName} (удалён)`
              : 'Не настроен'
    const hasOrders = orders.length > 0
    // Ручной путь остаётся фолбэком, но привязан к выигрышу: продажа — следствие won-сделки.
    const canCreateSale = canWrite && status === 'won'
    const goCreateSale = () =>
        navigate(
            `/orders?dealId=${deal.id}&contactId=${deal.contactId || ''}&companyId=${deal.companyId || ''}`
        )
    const goCreateMultiSales = () =>
        navigate(
            `/orders?dealId=${deal.id}&contactId=${deal.contactId || ''}&companyId=${deal.companyId || ''}&productId=${deal.productId || ''}&multi=1`
        )
    // Гейт переоткрытия зеркалит серверный предикат ОБОИХ звеньев маршрута
    // `POST /v1/deals/:id/reopen` (иначе кнопка либо врёт, либо прячется зря):
    //   BFF   — `@RequirePermission('deals','write')` (crm-bff.controller.ts);
    //   домен — `@RequireRoles('manager')` на `PipeGrpc.ReopenDeal`, то есть
    //           роль в проекте не ниже manager (rbac.ts projectRoleAtLeast:
    //           manager/admin/owner = PROJECT_MANAGE_ROLES на фронте).
    // Прежний `deals:manage` — право НАСТРОЕК (воронки/источники/причины), его у
    // роли manager нет by design, поэтому кнопка не показывалась тем, кому
    // сервер переоткрытие как раз разрешает.
    const roleAtLeastManager = Boolean(
        projectRole && PROJECT_MANAGE_ROLES.includes(projectRole),
    )
    const canReopen = can('deals', 'write') && roleAtLeastManager
    const canQualifyContacts = can('contacts', 'write')
    // EL-DEALS-DET-8: qualify is offered for light leads with no linked contact yet.
    const needsQualify = !deal.contactId && (deal.lightName || deal.lightPhone || deal.lightEmail || deal.contactName)
    // EL-DEALS-DET-18: soft drift indicator on the linked contact/company snapshot.
    const hasDrift = !!deal.driftFlag

    return (
        <Container>
            <div className="flex flex-col gap-4" {...qa('deals.details.root')}>
                <DealHeaderWidget
                    deal={deal}
                    stageOptions={stageOptions}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onMoveToStage={closed ? undefined : handleMoveToStage}
                />

                {/* SCR-DEALS-DETAILS lifecycle actions (close won/lost, reopen). */}
                <div className="flex flex-wrap items-center gap-2">
                    {status === 'open' && canWrite && (
                        <>
                            <Button
                                size="sm"
                                variant="solid"
                                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                                icon={<PiTrophyDuotone />}
                                disabled={actionPending}
                                onClick={() => setCloseDialog('won')}
                                {...qa('deals.details.closeWon')}
                            >
                                Закрыть (Won)
                            </Button>
                            <Button
                                size="sm"
                                variant="default"
                                icon={<PiProhibitDuotone />}
                                disabled={actionPending}
                                onClick={() => setCloseDialog('lost')}
                                {...qa('deals.details.closeLost')}
                            >
                                Закрыть (Lost)
                            </Button>
                        </>
                    )}
                    {closed && (
                        <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
                                status === 'won'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            }`}
                        >
                            {status === 'won' ? 'Выиграна' : 'Проиграна'}
                        </span>
                    )}
                    {closed && canReopen && (
                        <Button
                            size="sm"
                            variant="default"
                            icon={<PiArrowCounterClockwiseDuotone />}
                            disabled={actionPending}
                            onClick={() => setReopenOpen(true)}
                            {...qa('deals.details.reopen')}
                        >
                            Переоткрыть
                        </Button>
                    )}
                    {status === 'lost' && (deal.lostReasonComment || deal.lostReason) && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            Причина: {deal.lostReasonComment || deal.lostReason}
                        </span>
                    )}

                    {/* EL-DEALS-DET-8: qualify light lead → contact (deals:write + contacts:write). */}
                    {needsQualify && canWrite && canQualifyContacts && (
                        <Button
                            size="sm"
                            variant="solid"
                            color="primary"
                            icon={<PiUserPlusDuotone />}
                            disabled={actionPending}
                            onClick={() => void handleQualifyClick()}
                            {...qa('deals.details.qualify')}
                        >
                            Квалифицировать
                        </Button>
                    )}

                    {/* EL-DEALS-DET-18: soft drift — never blocks (FR-MDEAL-30). */}
                    {hasDrift && (
                        <Button
                            size="sm"
                            variant="default"
                            className="border-amber-300 text-amber-700 dark:text-amber-300"
                            icon={<PiWarningDuotone />}
                            disabled={actionPending}
                            onClick={() => setDriftOpen(true)}
                            {...qa('deals.details.drift')}
                        >
                            Изменения контакта
                        </Button>
                    )}

                    <div {...qa('deals.details.hostAction')}>
                        <HostSlot
                            id="deal.card.action"
                            context={{ dealId: deal.id, status }}
                            className="inline-flex flex-wrap items-center gap-2"
                        />
                    </div>
                </div>

                <DealHeaderStats
                    deal={deal}
                    orders={orders}
                    activitiesCount={activities.length}
                    loading={ordersLoading || activitiesLoading}
                />

                {currentPipeline && (
                    <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                Воронка: {currentPipeline.name}
                            </span>
                        </div>
                        <div className="flex gap-1">
                            {currentPipeline.stages.map((stage, index) => {
                                const currentIndex = currentPipeline.stages.findIndex((s) => s.id === deal.stageId)
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
                            {currentPipeline.stages.map((stage) => (
                                <span
                                    key={stage.id}
                                    className={`text-xs flex-shrink-0 ${
                                        stage.id === deal.stageId
                                            ? 'font-semibold text-blue-600 dark:text-blue-400'
                                            : 'text-gray-500'
                                    }`}
                                >
                                    {stage.name}
                                </span>
                            ))}
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
                                        <Tabs.TabList className="!p-0 !border-0 !bg-transparent !min-h-0">
                                            <Tabs.TabNav value="info" className="!py-1 !px-2 text-sm" {...qa('deals.details.tab', { tab: 'info' })}>
                                                Информация
                                            </Tabs.TabNav>
                                            {documentsModuleEnabled && (
                                                <Tabs.TabNav
                                                    value="documents"
                                                    {...qa('deals.details.tab', { tab: 'documents' })}
                                                    className="!py-1 !px-2 text-sm"
                                                >
                                                    Документы
                                                </Tabs.TabNav>
                                            )}
                                        </Tabs.TabList>
                                    ),
                                    bordered: true,
                                }}
                            >
                                <div className="p-5 overflow-y-auto flex-1">
                                    <Tabs.TabContent value="info">
                                        <DealInfoWidget
                                            deal={deal}
                                            onEditNotes={handleEdit}
                                            onCompanyClick={(companyId) => navigate(`/companies/${companyId}`)}
                                            onContactClick={(contactId) => navigate(`/contacts/${contactId}`)}
                                        />
                                    </Tabs.TabContent>
                                    {documentsModuleEnabled && (
                                        <Tabs.TabContent value="documents">
                                            <DocumentsTab contextType="deal" recordId={deal.id} />
                                        </Tabs.TabContent>
                                    )}
                                </div>
                            </Card>
                        </Tabs>
                    </div>
                    <div className="flex flex-col min-h-0 gap-4">
                        {/* BX-FLOW-6: тип продажи (из продукта) — воронка→тип продажи явны на карточке. */}
                        <div {...qa('deals.details.hostSlot.sidebar')}>
                            <HostSlot
                                id="deal.card.sidebar"
                                context={{ dealId: deal.id }}
                                className="flex flex-col gap-4 min-h-0"
                            />
                        </div>
                        <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" {...qa('deals.details.saleType')}>
                            <div className="flex items-center gap-2 mb-2">
                                <PiTagDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                <h4 className="text-base font-semibold">Тип продажи</h4>
                                <HelpIcon title="Тип продажи берётся у продукта сделки. Он задаёт процесс оформления продажи и доступные шаблоны документов. При выигрыше сделки продажа этого типа создаётся автоматически." />
                            </div>
                        <div
                            className={`text-sm font-medium ${
                                saleTypeConfigured
                                    ? 'text-gray-900 dark:text-gray-100'
                                    : 'text-amber-600 dark:text-amber-400'
                            }`}
                            {...qa('deals.details.saleType')}
                        >
                                {saleTypeLabel}
                            </div>
                            {deal.productName && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Продукт: {deal.productName}
                                </div>
                            )}

                            {/* Гейт по контексту won: продажа — следствие выигрыша сделки. */}
                            {status === 'won' ? (
                                hasOrders ? (
                                    <div className="mt-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 px-3 py-2" {...qa('deals.details.wonOrders')}>
                                        <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">
                                            Продажа оформлена
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            {orders.map((order) => (
                                                <button
                                                    key={order.id}
                                                    type="button"
                                                    className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:underline text-left"
                                                    {...qa('deals.details.orderLink', { order: order.id })}
                                                    onClick={() => navigate(`/orders/${order.id}`)}
                                                >
                                                    <PiArrowRightDuotone className="w-4 h-4 flex-shrink-0" />
                                                    Продажа {order.number}
                                                </button>
                                            ))}
                                        </div>
                                        {canCreateSale && (
                                            <Button
                                                variant="default"
                                                size="sm"
                                                block
                                                className="mt-2"
                                                {...qa('deals.details.createMultiOrders')}
                                                onClick={goCreateMultiSales}
                                            >
                                                Ещё продажи (по продуктам)
                                            </Button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="mt-3">
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                            {saleTypeConfigured
                                                ? 'При выигрыше продажа создаётся автоматически. Если её нет — оформите вручную.'
                                                : 'Тип продажи не настроен, поэтому продажа не создалась автоматически. Оформите её вручную.'}
                                        </p>
                                        {canCreateSale && (
                                            <div className="flex flex-col gap-2">
                                                <Button
                                                    variant="solid"
                                                    color="primary"
                                                    size="sm"
                                                    block
                                                    icon={<PiReceiptDuotone />}
                                                    {...qa('deals.details.createOrder')}
                                                    onClick={goCreateSale}
                                                    {...qa('deals.details.createSale')}
                                                >
                                                    Создать продажу
                                                </Button>
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    block
                                                    {...qa('deals.details.createMultiOrders')}
                                                    onClick={goCreateMultiSales}
                                                >
                                                    Несколько продаж (по продуктам)
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )
                            ) : (
                                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                                    Продажа создаётся после выигрыша сделки.
                                </p>
                            )}
                        </div>

                        <HostSlot
                            id="deal.card.sidebar"
                            context={{ dealId: deal.id }}
                        />

                        <CompanyOrdersWidget
                            orders={orders}
                            onOrderClick={(order) => navigate(`/orders/${order.id}`)}
                            loading={ordersLoading}
                            qaScope="deals.details.ordersWidget"
                        />
                        {/* FR-ACCESS-400/420: manager+ or record owner; control fail-closes. */}
                        {(roleAtLeastManager ||
                            Boolean(deal.assigneeId && deal.assigneeId === sessionUserId)) && (
                            <AdaptiveCard {...qa('deals.details.share')}>
                                <RecordShareControl
                                    projectId={pid}
                                    resource="deals"
                                    recordId={deal.id}
                                    recordOwnerUserId={deal.assigneeId}
                                />
                            </AdaptiveCard>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* FR-ACTIVITIES-150 / RFC-3 §1.2: mount-point `deal.card.tab`.
                        Врезка «Активности» приезжает из модуля activities
                        (ActivityCardTab: хронология + «следующий шаг» + «+ Активность»),
                        если модуль включён в проекте и есть право. Иначе (модуль
                        выключен, standalone-режим) остаётся встроенный
                        read-only-таймлайн — дублирования на экране нет. */}
                    <div className="flex flex-col min-h-0" {...qa('deals.details.activitiesWidget')}>
                        <HostSlot
                            id="deal.card.tab"
                            context={{ dealId: deal.id, contactId: deal.contactId }}
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
                    <div className="flex flex-col min-h-0" {...qa('deals.details.history')}>
                        <Card
                            className="w-full flex-1 flex flex-col min-h-0 max-h-[60vh] border border-gray-200 dark:border-gray-700"
                            bodyClass="flex-1 min-h-0 flex flex-col overflow-hidden"
                            {...qa('deals.details.history')}
                            header={{
                                content: (
                                    <div className="flex items-center gap-2">
                                        <PiClockCounterClockwiseDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                        <h4 className="text-base font-semibold">История</h4>
                                    </div>
                                ),
                                extra: (
                                    <span className="inline-flex p-2 rounded-lg" aria-hidden>
                                        <span className="w-4 h-4" />
                                    </span>
                                ),
                                bordered: true,
                            }}
                        >
                            <div className="flex-1 min-h-0 overflow-y-auto">
                                <HistoryTimeline
                                    events={historyEvents}
                                    emptyMessage="История изменений сделки будет отображаться здесь"
                                />
                            </div>
                        </Card>
                    </div>
                </div>
            </div>

            {closeDialog && (
                <CloseDealDialog
                    result={closeDialog}
                    deal={deal}
                    isOpen={!!closeDialog}
                    onClose={() => setCloseDialog(null)}
                    onClosed={(updated) => mutateDeal(updated, false)}
                />
            )}

            <ReopenDealDialog
                deal={deal}
                pipeline={currentPipeline}
                isOpen={reopenOpen}
                onClose={() => setReopenOpen(false)}
                onReopened={(updated) => mutateDeal(updated, false)}
            />

            {qualifyOpen && (
                <QualifyDealDialog
                    deal={deal}
                    isOpen={qualifyOpen}
                    onClose={() => setQualifyOpen(false)}
                    onQualified={(updated) => mutateDeal(updated, false)}
                />
            )}

            {driftOpen && (
                <DriftPanel
                    deal={deal}
                    isOpen={driftOpen}
                    onClose={() => setDriftOpen(false)}
                    onAccepted={(updated) => mutateDeal(updated, false)}
                />
            )}
        </Container>
    )
}

export default DealDetails
