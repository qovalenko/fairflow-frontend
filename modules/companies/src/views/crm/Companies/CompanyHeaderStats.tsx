import {
    PiHandshakeDuotone,
    PiCurrencyCircleDollarDuotone,
    PiShoppingCartDuotone,
} from 'react-icons/pi'
import Skeleton from '@/components/ui/Skeleton'
import type { CompanyHeaderStats as StatsType } from './CompanyHeaderWidget'
import { qa } from '../../../qa'

const formatMoney = (amount: number, currency = 'RUB') =>
    new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
    }).format(amount)

const STAT_BLOCKS_CONFIG = [
    {
        key: 'dealsTotal',
        label: 'Сумма сделок',
        icon: PiHandshakeDuotone,
        iconClass: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
    },
    {
        key: 'dealsWon',
        label: 'Оборот',
        icon: PiCurrencyCircleDollarDuotone,
        iconClass: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
    },
    {
        key: 'dealsCount',
        label: 'Сделок',
        icon: PiHandshakeDuotone,
        iconClass: 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400',
    },
    {
        key: 'ordersCount',
        label: 'Продаж',
        icon: PiShoppingCartDuotone,
        iconClass: 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400',
    },
] as const

const statBlocks = (stats: StatsType) =>
    [
        { ...STAT_BLOCKS_CONFIG[0], value: formatMoney(stats.dealsTotalAmount) },
        { ...STAT_BLOCKS_CONFIG[1], value: formatMoney(stats.dealsWonAmount) },
        { ...STAT_BLOCKS_CONFIG[2], value: String(stats.dealsCount) },
        { ...STAT_BLOCKS_CONFIG[3], value: String(stats.ordersCount) },
    ] as const

export interface CompanyHeaderStatsProps {
    stats: StatsType
    loading?: boolean
}

const CompanyHeaderStats = ({ stats, loading = false }: CompanyHeaderStatsProps) => {
    const blocks = loading
        ? STAT_BLOCKS_CONFIG.map((b) => ({ ...b, value: '' }))
        : statBlocks(stats)
    return (
        <div
            className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            {...qa('companies.card.stats')}
        >
            <div className="flex flex-col md:flex-row md:divide-x md:divide-gray-200 md:dark:divide-gray-600">
                {blocks.map((block) => (
                    <div
                        key={block.key}
                        className="flex items-center gap-3 min-w-0 flex-1 py-3 md:py-0 px-4 md:first:pl-0 md:last:pr-0"
                        {...qa('companies.card.stat', { stat: block.key })}
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

export default CompanyHeaderStats
