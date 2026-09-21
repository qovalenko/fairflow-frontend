import { PiShoppingCartDuotone } from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import type { Order } from '@/@types/crm'
import { qa } from '../qa'

const statusConfig: Record<string, { label: string; className: string }> = {
    active: {
        label: 'Активен',
        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    },
    error: {
        label: '⚠ Ошибка отправки',
        className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    },
    completed: {
        label: 'Завершён',
        className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    },
    cancelled: {
        label: 'Отменён',
        className: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
    },
}

/**
 * Домен отдаёт статусы машины состояний (`ACTIVE/SENDING/DONE/SEND_ERROR/CANCELLED`,
 * FR-MORD §5.4), legacy-ключи конфига — строчные. Без нормализации все
 * не-активные продажи показывались как «Активен».
 */
export const statusKeyOf = (status: string): keyof typeof statusConfig => {
    const s = String(status ?? '').toLowerCase()
    if (s === 'send_error' || s === 'error') return 'error'
    if (s === 'done' || s === 'completed') return 'completed'
    if (s === 'cancelled') return 'cancelled'
    return 'active'
}

export interface CompanyOrdersWidgetProps {
    orders: Order[]
    onOrderClick?: (order: Order) => void
    loading?: boolean
    /** Optional qa-id root (e.g. deals.details.ordersWidget). */
    qaScope?: string
}

const CompanyOrdersWidget = ({
    orders,
    onOrderClick,
    loading = false,
    qaScope,
}: CompanyOrdersWidgetProps) => {
    const rootQa = qaScope ? qa(qaScope) : {}
    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
            bodyClass="flex-1 min-h-0 flex flex-col"
            {...rootQa}
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiShoppingCartDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">Продажи</h4>
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
            <div className="flex-1 flex flex-col min-h-0">
                {loading ? (
                    <div className="flex flex-col gap-3 py-2">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-3">
                                <Skeleton height={40} className="flex-1 rounded-lg" />
                                <Skeleton height={40} width={80} className="rounded-lg flex-shrink-0" />
                            </div>
                        ))}
                    </div>
                ) : orders.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        Нет продаж
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-600">
                        {orders.map((order) => {
                            const status = statusConfig[statusKeyOf(order.status)]
                            return (
                                <div
                                    key={order.id}
                                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-4 px-4 rounded-lg transition-colors"
                                    {...qa('deals.details.ordersWidget.row', { order: order.id })}
                                    onClick={() => onOrderClick?.(order)}
                                    {...(qaScope ? qa(`${qaScope}.row`, { order: order.id }) : {})}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                            {order.number}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                            {order.typeName}
                                            {order.productName && ` · ${order.productName}`}
                                            {order.dealName && ` · ${order.dealName}`}
                                        </div>
                                    </div>
                                    <div className="flex-shrink-0 flex flex-col items-end gap-1">
                                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                                            {order.stageName}
                                        </div>
                                        <span
                                            className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}
                                        >
                                            {status.label}
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </Card>
    )
}

export default CompanyOrdersWidget
