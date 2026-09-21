import {
    PiCalendarDuotone,
    PiClockDuotone,
    PiUserDuotone,
    PiMapPinDuotone,
    PiHandshakeDuotone,
    PiBuildingsDuotone,
    PiReceiptDuotone,
    PiInfoDuotone,
    PiLightningDuotone,
} from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import dayjs from 'dayjs'
import type { Activity } from '@/@types/crm'
import { toEpochMs } from './activityShared'
import { automationRuleBadge } from './created-by-rule'
import { qa } from '../qa'

export interface ActivityInfoWidgetProps {
    activity: Activity
    isOverdue?: boolean
    onDealClick?: (dealId: string) => void
    onContactClick?: (contactId: string) => void
    onCompanyClick?: (companyId: string) => void
    onOrderClick?: (orderId: string) => void
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-5 last:mb-0">
        <div className="flex items-center justify-between gap-2 mb-2">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                {title}
            </h5>
        </div>
        {children}
    </div>
)

const ActivityInfoWidget = ({
    activity,
    isOverdue = false,
    onDealClick,
    onContactClick,
    onCompanyClick,
    onOrderClick,
}: ActivityInfoWidgetProps) => {
    const ruleBadge = automationRuleBadge(activity.createdByRule)

    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
            bodyClass="flex-1 min-h-0 flex flex-col overflow-y-auto"
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiInfoDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">Информация об активности</h4>
                    </div>
                ),
                bordered: true,
            }}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ruleBadge && (
                    <div className="md:col-span-2">
                        <Tag className="bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200 inline-flex items-center gap-1">
                            <PiLightningDuotone className="w-3.5 h-3.5" />
                            {ruleBadge}
                        </Tag>
                    </div>
                )}
                <div className="space-y-0">
                    <Section title="Даты и время">
                        <div className="space-y-2 text-sm">
                            {activity.dueDate && (
                                <div className="flex items-start gap-2">
                                    <PiCalendarDuotone className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <div className="text-gray-500 dark:text-gray-400">Срок</div>
                                        <div className={`font-medium ${isOverdue ? 'text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>
                                            {dayjs(toEpochMs(activity.dueDate)).format('DD.MM.YYYY HH:mm')}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {activity.startDate && (
                                <div className="flex items-start gap-2">
                                    <PiClockDuotone className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <div className="text-gray-500 dark:text-gray-400">Начало — Конец</div>
                                        <div className="font-medium text-gray-900 dark:text-gray-100">
                                            {dayjs(toEpochMs(activity.startDate)).format('DD.MM.YYYY HH:mm')}
                                            {activity.endDate && (
                                                <span> — {dayjs(toEpochMs(activity.endDate)).format('HH:mm')}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {activity.duration != null && (
                                <div className="flex items-start gap-2">
                                    <PiClockDuotone className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <div className="text-gray-500 dark:text-gray-400">Длительность</div>
                                        <div className="font-medium text-gray-900 dark:text-gray-100">
                                            {activity.duration} мин.
                                        </div>
                                    </div>
                                </div>
                            )}
                            {!activity.dueDate && !activity.startDate && !activity.duration && (
                                <div className="text-gray-500 dark:text-gray-400 py-2">Нет данных</div>
                            )}
                        </div>
                    </Section>

                    <Section title="Участники">
                        <div className="space-y-2 text-sm">
                            {activity.assigneeName && (
                                <div className="flex items-center gap-2">
                                    <PiUserDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    <span className="text-gray-700 dark:text-gray-300">{activity.assigneeName}</span>
                                </div>
                            )}
                            {activity.participants && activity.participants.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {activity.participants.map((p) => (
                                        <Tag
                                            key={p}
                                            className="bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                        >
                                            {p}
                                        </Tag>
                                    ))}
                                </div>
                            )}
                            {activity.location && (
                                <div className="flex items-center gap-2 mt-2">
                                    <PiMapPinDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    <span className="text-gray-700 dark:text-gray-300">{activity.location}</span>
                                </div>
                            )}
                            {!activity.assigneeName && !activity.participants?.length && !activity.location && (
                                <div className="text-gray-500 dark:text-gray-400 py-2">Нет данных</div>
                            )}
                        </div>
                    </Section>
                </div>

                <div className="space-y-0">
                    <Section title="Связи">
                        <div className="space-y-2 text-sm">
                            {activity.dealName && (
                                <div className="flex items-center gap-2">
                                    <PiHandshakeDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    {activity.dealId ? (
                                        <button
                                            type="button"
                                            onClick={() => onDealClick?.(activity.dealId!)}
                                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate text-left"
                                            {...qa('activities.info.dealLink', {
                                                deal: activity.dealId,
                                            })}
                                        >
                                            {activity.dealName}
                                        </button>
                                    ) : (
                                        <span className="text-gray-700 dark:text-gray-300">{activity.dealName}</span>
                                    )}
                                </div>
                            )}
                            {activity.contactName && (
                                <div className="flex items-center gap-2">
                                    <PiUserDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    {activity.contactId ? (
                                        <button
                                            type="button"
                                            onClick={() => onContactClick?.(activity.contactId!)}
                                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate text-left"
                                            {...qa('activities.info.contactLink', {
                                                contact: activity.contactId,
                                            })}
                                        >
                                            {activity.contactName}
                                        </button>
                                    ) : (
                                        <span className="text-gray-700 dark:text-gray-300">{activity.contactName}</span>
                                    )}
                                </div>
                            )}
                            {activity.companyName && (
                                <div className="flex items-center gap-2">
                                    <PiBuildingsDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    {activity.companyId ? (
                                        <button
                                            type="button"
                                            onClick={() => onCompanyClick?.(activity.companyId!)}
                                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate text-left"
                                            {...qa('activities.info.companyLink', {
                                                company: activity.companyId,
                                            })}
                                        >
                                            {activity.companyName}
                                        </button>
                                    ) : (
                                        <span className="text-gray-700 dark:text-gray-300">{activity.companyName}</span>
                                    )}
                                </div>
                            )}
                            {activity.orderName && (
                                <div className="flex items-center gap-2">
                                    <PiReceiptDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    {activity.orderId ? (
                                        <button
                                            type="button"
                                            onClick={() => onOrderClick?.(activity.orderId!)}
                                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate text-left"
                                            {...qa('activities.info.orderLink', {
                                                order: activity.orderId,
                                            })}
                                        >
                                            {activity.orderName}
                                        </button>
                                    ) : (
                                        <span className="text-gray-700 dark:text-gray-300">{activity.orderName}</span>
                                    )}
                                </div>
                            )}
                            {!activity.dealName && !activity.contactName && !activity.companyName && !activity.orderName && (
                                <div className="text-gray-500 dark:text-gray-400 py-2">Нет связей</div>
                            )}
                        </div>
                    </Section>
                </div>
            </div>
        </Card>
    )
}

export default ActivityInfoWidget
