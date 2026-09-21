import {
    PiBuildingsDuotone,
    PiUserDuotone,
    PiInfoDuotone,
    PiPackageDuotone,
    PiCalendarDuotone,
    PiChatCircleTextDuotone,
    PiCodeDuotone,
} from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import dayjs from 'dayjs'
import type { Deal } from '@/@types/crm'
import { qa } from '../qa'

export interface DealInfoWidgetProps {
    deal: Deal
    onEditNotes?: () => void
    onCompanyClick?: (companyId: string) => void
    onContactClick?: (contactId: string) => void
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

const DealInfoWidget = ({
    deal,
    onEditNotes,
    onCompanyClick,
    onContactClick,
}: DealInfoWidgetProps) => {
    const hasNotes = deal.notes && deal.notes.trim().length > 0

    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
            bodyClass="flex-1 min-h-0 flex flex-col overflow-y-auto"
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiInfoDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">Информация о сделке</h4>
                    </div>
                ),
                bordered: true,
            }}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl">
                <div className="space-y-0">
                    <Section title="Участники">
                        <div className="space-y-2 text-sm">
                            {deal.companyName && (
                                <div className="flex items-center gap-2">
                                    <PiBuildingsDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    {deal.companyId ? (
                                        <button
                                            type="button"
                                            onClick={() => onCompanyClick?.(deal.companyId!)}
                                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate text-left"
                                            {...qa('deals.details.companyLink', { company: deal.companyId })}
                                        >
                                            {deal.companyName}
                                        </button>
                                    ) : (
                                        <span className="text-gray-700 dark:text-gray-300">{deal.companyName}</span>
                                    )}
                                </div>
                            )}
                            {deal.contactName && (
                                <div className="flex items-center gap-2">
                                    <PiUserDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    {deal.contactId ? (
                                        <button
                                            type="button"
                                            onClick={() => onContactClick?.(deal.contactId!)}
                                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate text-left"
                                            {...qa('deals.details.contactLink', { contact: deal.contactId })}
                                        >
                                            {deal.contactName}
                                        </button>
                                    ) : (
                                        <span className="text-gray-700 dark:text-gray-300">{deal.contactName}</span>
                                    )}
                                </div>
                            )}
                            {deal.productName && (
                                <div className="flex items-center gap-2">
                                    <PiPackageDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    <span className="text-gray-700 dark:text-gray-300">{deal.productName}</span>
                                </div>
                            )}
                            {!deal.companyName && !deal.contactName && !deal.productName && (
                                <div className="text-gray-500 dark:text-gray-400 py-2">Нет данных</div>
                            )}
                        </div>
                    </Section>

                    <Section title="Даты">
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <PiCalendarDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="text-gray-700 dark:text-gray-300">
                                    Создана: {dayjs.unix(deal.createdAt).format('DD.MM.YYYY HH:mm')}
                                </span>
                            </div>
                            {deal.expectedCloseDate && (
                                <div className="flex items-center gap-2">
                                    <PiCalendarDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    <span className="text-gray-700 dark:text-gray-300">
                                        Ожидаемое закрытие: {dayjs.unix(deal.expectedCloseDate).format('DD.MM.YYYY')}
                                    </span>
                                </div>
                            )}
                            {deal.closedAt && (
                                <div className="flex items-center gap-2">
                                    <PiCalendarDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    <span className="text-gray-700 dark:text-gray-300">
                                        Закрыта: {dayjs.unix(deal.closedAt).format('DD.MM.YYYY HH:mm')}
                                    </span>
                                </div>
                            )}
                        </div>
                    </Section>
                </div>

                <div className="space-y-0">
                    {deal.source && (
                        <div className="mb-5">
                            <div className="flex items-center gap-2 mb-2">
                                <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                                    Источник
                                </h5>
                            </div>
                            <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                {deal.source}
                            </Tag>
                        </div>
                    )}

                    {hasNotes && (
                        <div className="mb-5 last:mb-0 relative">
                            {onEditNotes && (
                                <Tooltip title="Изменить заметку">
                                    <button
                                        type="button"
                                        onClick={onEditNotes}
                                        className="absolute top-2 right-2 z-10 p-2 rounded-lg hover:bg-sky-200/60 dark:hover:bg-sky-800/50 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                        aria-label="Изменить заметку"
                                    >
                                        <PiChatCircleTextDuotone className="w-4 h-4" />
                                    </button>
                                </Tooltip>
                            )}
                            <div className="text-sm text-sky-800 dark:text-sky-100 whitespace-pre-wrap rounded-2xl p-4 pr-12 flex flex-col justify-center bg-sky-100 dark:bg-sky-900/75">
                                {deal.notes}
                            </div>
                        </div>
                    )}

                    {deal.lostReason && (
                        <div className="mb-5">
                            <div className="flex items-center gap-2 mb-2">
                                <PiCodeDuotone className="w-4 h-4 text-gray-400" />
                                <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                                    Причина проигрыша
                                </h5>
                            </div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">{deal.lostReason}</div>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    )
}

export default DealInfoWidget
