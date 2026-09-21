import { PiHandshakeDuotone, PiUserDuotone, PiBuildingsDuotone, PiInfoDuotone, PiCalendarDuotone, PiPackageDuotone } from 'react-icons/pi'
import Card from '@/components/ui/Card'
import type { Order } from '@/@types/crm'
import { formatOrderDate } from './orderUtils'
import { qa } from './qa'

const PRODUCT_UNIT_LABEL: Record<string, string> = {
    ONE_TIME: 'разово',
    MONTHLY: 'ежемес.',
    YEARLY: 'ежегодно',
}

/** FR-PRODUCTS-180: цена/валюта/единица/категория — снимок на продаже, не текущий каталог. */
export function formatOrderProductSnapshot(order: Order): string {
    const parts: string[] = []
    if (order.productCategory) parts.push(order.productCategory)
    if (order.productPrice != null && Number.isFinite(order.productPrice)) {
        const cur =
            order.productCurrency && /^[A-Z]{3}$/i.test(order.productCurrency)
                ? order.productCurrency.toUpperCase()
                : 'RUB'
        try {
            parts.push(
                new Intl.NumberFormat('ru-RU', {
                    style: 'currency',
                    currency: cur,
                    maximumFractionDigits: 0,
                }).format(order.productPrice),
            )
        } catch {
            parts.push(String(order.productPrice))
        }
    }
    const unit = order.productUnit
        ? (PRODUCT_UNIT_LABEL[order.productUnit] ?? order.productUnit)
        : ''
    if (unit) parts.push(unit)
    return parts.join(' · ')
}

export interface OrderInfoWidgetProps {
    order: Order
    onDealClick?: (dealId: string) => void
    onContactClick?: (contactId: string) => void
    onCompanyClick?: (companyId: string) => void
    embedded?: boolean
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-5 last:mb-0">
        <div className="flex items-center justify-between gap-2 mb-2">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">{title}</h5>
        </div>
        {children}
    </div>
)

const OrderInfoWidget = ({ order, onDealClick, onContactClick, onCompanyClick, embedded = false }: OrderInfoWidgetProps) => {
    const hasFields = order.fields && Object.keys(order.fields).length > 0
    const hasNotes = order.notes && order.notes.trim().length > 0
    const hasProduct = Boolean(order.productName || order.productId)
    const productSnapshot = hasProduct ? formatOrderProductSnapshot(order) : ''

    const content = (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl">
            <div className="space-y-0">
                <Section title="Связи">
                    <div className="space-y-2 text-sm">
                        {order.dealName && order.dealId && (
                            <div className="flex items-center gap-2">
                                <PiHandshakeDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <button
                                    type="button"
                                    onClick={() => onDealClick?.(order.dealId!)}
                                    className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate text-left"
                                    {...qa('orders.details.info.dealLink')}
                                >
                                    {order.dealName}
                                </button>
                            </div>
                        )}
                        {order.contactName && order.contactId && (
                            <div className="flex items-center gap-2">
                                <PiUserDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <button
                                    type="button"
                                    onClick={() => onContactClick?.(order.contactId!)}
                                    className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate text-left"
                                    {...qa('orders.details.info.contactLink')}
                                >
                                    {order.contactName}
                                </button>
                            </div>
                        )}
                        {order.companyName && order.companyId && (
                            <div className="flex items-center gap-2">
                                <PiBuildingsDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <button
                                    type="button"
                                    onClick={() => onCompanyClick?.(order.companyId!)}
                                    className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate text-left"
                                    {...qa('orders.details.info.companyLink')}
                                >
                                    {order.companyName}
                                </button>
                            </div>
                        )}
                        {hasProduct && (
                            <div className="flex items-start gap-2">
                                <PiPackageDuotone className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                <div className="min-w-0">
                                    <div className="text-gray-700 dark:text-gray-300 truncate">
                                        {order.productName || 'Продукт'}
                                    </div>
                                    {productSnapshot && (
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            {productSnapshot}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {!order.dealName && !order.contactName && !order.companyName && !hasProduct && (
                            <div className="text-gray-500 dark:text-gray-400 py-2">Нет связей</div>
                        )}
                    </div>
                </Section>

                <Section title="Даты">
                    <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                            <PiCalendarDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-300">
                                Создана: {formatOrderDate(order.createdAt)}
                            </span>
                        </div>
                        {order.updatedAt !== order.createdAt && (
                            <div className="flex items-center gap-2">
                                <PiCalendarDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="text-gray-700 dark:text-gray-300">
                                    Обновлена: {formatOrderDate(order.updatedAt)}
                                </span>
                            </div>
                        )}
                    </div>
                </Section>
            </div>

            <div className="space-y-0">
                {hasNotes && (
                    <Section title="Заметки">
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {order.notes}
                        </p>
                    </Section>
                )}
                {hasFields && (
                    <Section title="Данные продажи">
                        <div className="space-y-2">
                            {Object.entries(order.fields).map(([key, value]) => (
                                <div key={key} className="flex justify-between gap-2 text-sm">
                                    <span className="text-gray-500 dark:text-gray-400">{key}</span>
                                    <span className="text-gray-900 dark:text-gray-100 font-medium text-right">
                                        {String(value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}
            </div>
        </div>
    )

    if (embedded) return content

    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
            bodyClass="flex-1 min-h-0 flex flex-col overflow-y-auto"
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiInfoDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">Информация о продаже</h4>
                    </div>
                ),
                bordered: true,
            }}
        >
            {content}
        </Card>
    )
}

export default OrderInfoWidget
