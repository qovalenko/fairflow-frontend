import {
    PiCalendarDuotone,
    PiUserDuotone,
    PiLinkDuotone,
} from 'react-icons/pi'
import dayjs from 'dayjs'
import type { Activity } from '@/@types/crm'
import { toEpochMs } from './activityShared'

export interface ActivityHeaderStatsProps {
    activity: Activity
}

const ActivityHeaderStats = ({ activity }: ActivityHeaderStatsProps) => {
    const linksCount = [
        activity.dealId,
        activity.contactId,
        activity.companyId,
        activity.orderId,
    ].filter(Boolean).length

    const statBlocks = [
        {
            label: 'Срок',
            value: activity.dueDate
                ? dayjs(toEpochMs(activity.dueDate)).format('DD.MM.YYYY HH:mm')
                : '—',
            icon: PiCalendarDuotone,
            iconClass: 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400',
        },
        {
            label: 'Ответственный',
            value: activity.assigneeName || '—',
            icon: PiUserDuotone,
            iconClass: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400',
        },
        {
            label: 'Связи',
            value: linksCount > 0 ? `${linksCount} связ.` : 'Нет',
            icon: PiLinkDuotone,
            iconClass: 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400',
        },
    ]

    return (
        <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
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
                            <div className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100 truncate">
                                {block.value}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default ActivityHeaderStats
