import { PiHandshakeDuotone, PiCurrencyCircleDollarDuotone } from 'react-icons/pi'
import Skeleton from '@/components/ui/Skeleton'
import type { Deal } from '@/@types/crm'
import { qa } from './qa'

const formatMoney = (amount: number, currency = 'RUB') =>
    new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
    }).format(amount)

export interface ContactHeaderStatsProps {
    deals: Deal[]
    loading?: boolean
}

const ContactHeaderStats = ({ deals, loading = false }: ContactHeaderStatsProps) => {
    const dealsTotalAmount = deals.reduce((sum, d) => sum + d.amount, 0)
    const dealsWonAmount = deals.filter((d) => d.result === 'won').reduce((sum, d) => sum + d.amount, 0)

    const statBlocks = [
        {
            label: 'Сумма сделок',
            value: formatMoney(dealsTotalAmount),
            icon: PiHandshakeDuotone,
            iconClass: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
        },
        {
            label: 'Оборот',
            value: formatMoney(dealsWonAmount),
            icon: PiCurrencyCircleDollarDuotone,
            iconClass: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Сделок',
            value: String(deals.length),
            icon: PiHandshakeDuotone,
            iconClass: 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400',
        },
    ]

    return (
        <div
            className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            {...qa('contacts.details.stats')}
        >
            <div className="flex flex-col md:flex-row md:divide-x md:divide-gray-200 md:dark:divide-gray-600">
                {statBlocks.map((block) => (
                    <div
                        key={block.label}
                        className="flex items-center gap-3 min-w-0 flex-1 py-3 md:py-0 px-4 md:first:pl-0 md:last:pr-0"
                    >
                        <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${block.iconClass}`}
                        >
                            <block.icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                {block.label}
                            </div>
                            {loading ? (
                                <Skeleton className="mt-1" height={28} width={93} />
                            ) : (
                                <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
                                    {block.value}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default ContactHeaderStats
