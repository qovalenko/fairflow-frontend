import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import useSWR from 'swr'
import {
    PiPlusDuotone,
    PiPencilDuotone,
    PiLightningDuotone,
    PiGearSixDuotone,
    PiListDuotone,
    PiKanbanDuotone,
    PiPlugsDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Segment from '@/components/ui/Segment'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Loading from '@/components/shared/Loading'
import EntityCreateDrawer from '@/components/template/EntityCreateDrawer'
import useSegmentRouteTransition from '@/utils/hooks/useSegmentRouteTransition'
import usePermission from '@/utils/hooks/usePermission'
import type { OrderType, OrderTypeStage } from '@/@types/crm'
import { apiGetOrderTypes } from '@/services/CrmService'
import { normalizeList, isModuleDisabledError } from './orderUtils'
import { qa } from './qa'

/** Нормализованная карточка типа для grid (поверх AS-IS OrderType + TO-BE-полей контракта §3.1). */
type OrderTypeCard = {
    id: string
    name: string
    schemaVersion: string
    fieldsCount: number
    stagesCount: number
    documentsCount: number
    webhookEnabled: boolean
    activeOrdersCount: number
    stages: string[]
}

function toCard(t: OrderType & {
    currentVersion?: number
    description?: string
    documentTemplates?: unknown[]
    finalActionSpec?: { type?: string }
}): OrderTypeCard {
    const stageNames = (t.stages ?? []).map((s: OrderTypeStage) => s.name)
    return {
        id: t.id,
        name: t.name,
        schemaVersion: String(t.currentVersion ?? t.schemaVersion ?? 1),
        fieldsCount: t.fields?.length ?? 0,
        stagesCount: t.stages?.length ?? 0,
        documentsCount: t.documentTemplates?.length ?? 0,
        webhookEnabled: t.webhookEnabled ?? t.finalActionSpec?.type === 'webhook',
        activeOrdersCount: t.activeOrders ?? 0,
        stages: stageNames,
    }
}

const OrderTypes = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canManage = can('orders', 'manage')
    const [orderDrawerOpen, setOrderDrawerOpen] = useState(false)

    const { data, isLoading, error, mutate } = useSWR(
        pid ? ['/api/v1/order-types', pid] : null,
        () => apiGetOrderTypes<OrderType[] | { list: OrderType[] }>(),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const cards = useMemo(() => normalizeList<OrderType>(data).map(toCard), [data])

    const navigateToView = (value: string) => {
        if (value === 'kanban') navigate('/orders/kanban')
        else if (value === 'list') navigate('/orders')
        else return
    }

    const [segmentValue, handleViewToggle] = useSegmentRouteTransition('types', navigateToView)

    const header = (
        <>
            <div className="flex items-center justify-between">
                <div>
                    <h3>Продажи</h3>
                    <p className="text-sm text-gray-500 mt-1">Продажи создаются из карточки сделки</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="solid"
                        color="primary"
                        size="sm"
                        icon={<PiPlusDuotone />}
                        onClick={() => setOrderDrawerOpen(true)}
                    >
                        Продажа
                    </Button>
                    <Segment value={segmentValue} onChange={(val) => handleViewToggle(val as string)} size="sm">
                        <Segment.Item value="list">
                            <div className="flex items-center gap-1">
                                <PiListDuotone className="w-4 h-4" />
                                <span>Список</span>
                            </div>
                        </Segment.Item>
                        <Segment.Item value="kanban">
                            <div className="flex items-center gap-1">
                                <PiKanbanDuotone className="w-4 h-4" />
                                <span>Доска</span>
                            </div>
                        </Segment.Item>
                    </Segment>
                    {/* TODO-417: индикатор текущего раздела, а не кнопка. Раньше здесь
                        был Button с `onClick={() => {}}` — кликабельная заглушка на том
                        самом экране, куда она «вела». */}
                    <span
                        aria-current="page"
                        title="Типы продаж"
                        className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-primary-subtle text-primary"
                    >
                        <PiGearSixDuotone className="w-4 h-4" />
                    </span>
                </div>
            </div>
            <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">Типы продаж</h3>
                {/* EL-TYPES-BTN-NEW — orders:manage (ST-11/12). */}
                {canManage && (
                    <Button
                        variant="plain"
                        size="sm"
                        icon={<PiPlusDuotone />}
                        className="!border-0 !bg-gray-100 dark:!bg-gray-700 !text-gray-500 dark:!text-gray-400 hover:!bg-gray-200 dark:hover:!bg-gray-600 hover:!text-gray-700 dark:hover:!text-gray-200 hover:!ring-0"
                        {...qa('orders.types.create')}
                        onClick={() => navigate('/orders/types/new')}
                    >
                        Тип продажи
                    </Button>
                )}
            </div>
        </>
    )

    let body: React.ReactNode
    if (!pid) {
        // ST-19: проект не выбран.
        body = (
            <div className="text-center py-10" {...qa('orders.types.noProject')}>
                <p className="text-gray-500 mb-1">Проект не выбран</p>
                <p className="text-sm text-gray-400">Выберите или создайте проект.</p>
            </div>
        )
    } else if (isLoading) {
        // ST-1: загрузка.
        body = <Loading loading={true} />
    } else if (error && isModuleDisabledError(error)) {
        // ST-17: раздел выключен в проекте (403 MODULE_DISABLED). Грациозная
        // деградация вместо «Повторить» (ретрай не поможет) — CTA в настройки
        // модулей тем, у кого есть project:manage.
        body = (
            <div
                className="flex flex-col items-center justify-center py-16 text-center gap-3"
                {...qa('orders.types.moduleDisabled')}
            >
                <PiPlugsDuotone className="w-14 h-14 text-gray-300 dark:text-gray-600" />
                <p className="font-semibold">Раздел выключен</p>
                <p className="text-gray-500 text-sm max-w-sm">
                    Типы продаж станут доступны после включения модуля «Продажи»
                    в настройках проекта.
                </p>
                {can('project', 'manage') && pid && (
                    <Button
                        variant="solid"
                        color="primary"
                        className="mt-2"
                        onClick={() => navigate(`/p/${pid}/settings/modules`)}
                    >
                        Настройки модулей
                    </Button>
                )}
            </div>
        )
    } else if (error) {
        // ST-6: ошибка загрузки.
        body = (
            <div className="text-center py-10">
                <p className="text-gray-500">Не удалось загрузить типы продаж</p>
                <Button
                    variant="solid"
                    color="primary"
                    className="mt-4"
                    {...qa('orders.types.retry')}
                    onClick={() => mutate()}
                >
                    Повторить
                </Button>
            </div>
        )
    } else if (cards.length === 0) {
        // ST-3: нет типов → онбординг.
        body = (
            <div className="text-center py-10" {...qa('orders.types.empty')}>
                <p className="text-gray-500 mb-1">Типов продаж пока нет</p>
                <p className="text-sm text-gray-400 mb-4">
                    Тип продажи описывает процесс оформления: поля, этапы, документы и финальное действие.
                </p>
                {canManage && (
                    <Button
                        variant="solid"
                        color="primary"
                        icon={<PiPlusDuotone />}
                        onClick={() => navigate('/orders/types/new')}
                    >
                        Создать тип продажи
                    </Button>
                )}
            </div>
        )
    } else {
        body = (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" {...qa('orders.types.list')}>
                {cards.map((orderType) => (
                    <Card key={orderType.id}>
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h5 className="font-semibold heading-text text-lg">{orderType.name}</h5>
                                <span className="text-xs text-gray-500">Схема v{orderType.schemaVersion}</span>
                            </div>
                            {/* EL-TYPES-CARD-EDIT — orders:manage. */}
                            {canManage && (
                                <Button
                                    size="xs"
                                    variant="plain"
                                    icon={<PiPencilDuotone />}
                                    {...qa('orders.types.edit', { type: orderType.id })}
                                    onClick={() => navigate(`/orders/types/${orderType.id}/edit`)}
                                >
                                    Редактировать
                                </Button>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                            <div className="flex items-center gap-2">
                                <PiGearSixDuotone className="w-4 h-4 text-gray-400" />
                                <span className="text-gray-600 dark:text-gray-400">{orderType.fieldsCount} полей</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600 dark:text-gray-400">{orderType.stagesCount} этапов</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-gray-600 dark:text-gray-400">{orderType.documentsCount} шаблонов</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <PiLightningDuotone
                                    className={`w-4 h-4 ${
                                        orderType.webhookEnabled ? 'text-emerald-500' : 'text-gray-300'
                                    }`}
                                />
                                <span className="text-gray-600 dark:text-gray-400">
                                    Webhook {orderType.webhookEnabled ? 'вкл' : 'выкл'}
                                </span>
                            </div>
                        </div>

                        <div className="mb-3">
                            <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                {orderType.activeOrdersCount} активных продаж
                            </Tag>
                        </div>

                        {orderType.stages.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-3 border-t">
                                {orderType.stages.map((stage, index) => (
                                    <div key={index} className="flex items-center gap-1">
                                        <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                                            {stage}
                                        </span>
                                        {index < orderType.stages.length - 1 && (
                                            <span className="text-gray-300 text-xs">→</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                ))}
            </div>
        )
    }

    return (
        <Container>
            <AdaptiveCard>
                <div className="flex flex-col gap-4">
                    {header}
                    {body}
                </div>
            </AdaptiveCard>
            <EntityCreateDrawer
                entityType="order"
                isOpen={orderDrawerOpen}
                onClose={() => setOrderDrawerOpen(false)}
                onSuccess={() => setOrderDrawerOpen(false)}
            />
        </Container>
    )
}

export default OrderTypes
