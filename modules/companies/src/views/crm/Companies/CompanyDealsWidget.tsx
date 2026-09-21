import { PiHandshakeDuotone } from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import type { Deal } from '@/@types/crm'
import { qa } from '../../../qa'

export interface CompanyDealsWidgetProps {
    deals: Deal[]
    onDealClick?: (deal: Deal) => void
    loading?: boolean
}

const CompanyDealsWidget = ({ deals, onDealClick, loading = false }: CompanyDealsWidgetProps) => {
    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
            bodyClass="flex-1 min-h-0 flex flex-col"
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiHandshakeDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">Сделки</h4>
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
                    <div className="flex flex-col gap-3 py-2" {...qa('companies.card.dealsLoading')}>
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-3">
                                <Skeleton height={40} className="flex-1 rounded-lg" />
                                <Skeleton height={40} width={80} className="rounded-lg flex-shrink-0" />
                            </div>
                        ))}
                    </div>
                ) : deals.length === 0 ? (
                    <div
                        className="py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                        {...qa('companies.card.dealsEmpty')}
                    >
                        Нет сделок
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-600">
                        {deals.map((deal) => (
                            <div
                                key={deal.id}
                                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-4 px-4 rounded-lg transition-colors"
                                onClick={() => onDealClick?.(deal)}
                                {...qa('companies.details.dealRow', { deal: deal.id })}
                                {...qa('companies.card.dealRow', { deal: deal.id })}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                        {deal.name}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {deal.contactName && `${deal.contactName} · `}
                                        {deal.stageName}
                                    </div>
                                </div>
                                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                                    <div className="font-bold text-gray-900 dark:text-gray-100">
                                        {new Intl.NumberFormat('ru-RU', {
                                            style: 'currency',
                                            currency: deal.currency || 'RUB',
                                            maximumFractionDigits: 0,
                                        }).format(deal.amount)}
                                    </div>
                                    <span
                                        className={`text-xs px-2 py-0.5 rounded-full ${
                                            deal.result === 'won'
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                                                : deal.result === 'lost'
                                                ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                        }`}
                                    >
                                        {deal.result === 'won' ? 'Won' : deal.result === 'lost' ? 'Lost' : 'Active'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    )
}

export default CompanyDealsWidget
