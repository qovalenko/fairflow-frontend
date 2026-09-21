import {
    PiBuildingsDuotone,
    PiInfoDuotone,
    PiChatCircleTextDuotone,
    PiCalendarDuotone,
} from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Tooltip from '@/components/ui/Tooltip'
import Tag from '@/components/ui/Tag'
import dayjs from 'dayjs'
import type { Contact } from '@/@types/crm'
import { qa } from './qa'

export interface ContactInfoWidgetProps {
    contact: Contact
    onEditNotes?: () => void
    onCompanyClick?: (companyId: string) => void
}

const Section = ({
    title,
    children,
}: {
    title: string
    children: React.ReactNode
}) => (
    <div className="mb-5 last:mb-0">
        <div className="flex items-center justify-between gap-2 mb-2">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                {title}
            </h5>
        </div>
        {children}
    </div>
)

const ContactInfoWidget = ({
    contact,
    onEditNotes,
    onCompanyClick,
}: ContactInfoWidgetProps) => {
    const hasCompanies = (contact.companies?.length ?? 0) > 0 || contact.companyId || contact.companyName
    const hasNotes = contact.notes && contact.notes.trim().length > 0
    const hasTags = contact.tags && contact.tags.length > 0
    const hasOrphanedCompanies =
        contact.orphanedCompanyIds && contact.orphanedCompanyIds.length > 0

    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
            bodyClass="flex-1 min-h-0 flex flex-col overflow-y-auto"
            {...qa('contacts.details.info')}
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiInfoDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">Информация о контакте</h4>
                    </div>
                ),
                bordered: true,
            }}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl">
                {hasOrphanedCompanies && (
                    <div
                        className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                        {...qa('contacts.details.orphanCompanyBanner')}
                    >
                        Связь с удалённой компанией ({contact.orphanedCompanyIds!.join(', ')}) —
                        компания удалена, привязка осиротела.
                    </div>
                )}
                <div className="space-y-0">
                    {hasCompanies && (
                        <Section title="Компании">
                            <div className="space-y-2">
                                {contact.companies?.length ? (
                                    contact.companies.map((c) => (
                                        <div
                                            key={c.id}
                                            className="flex items-center gap-2 py-2 px-3 rounded-2xl cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-2 px-2"
                                            onClick={() => onCompanyClick?.(c.id)}
                                            {...qa('contacts.details.companyLink', { company: c.id })}
                                        >
                                            <PiBuildingsDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                                                    {c.name}
                                                </div>
                                                {c.role && (
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                                        {c.role}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : contact.companyId ? (
                                    <div
                                        className="flex items-center gap-2 py-2 px-3 rounded-2xl cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-2 px-2"
                                        onClick={() => onCompanyClick?.(contact.companyId!)}
                                        {...qa('contacts.details.companyLink', {
                                            company: contact.companyId!,
                                        })}
                                    >
                                        <PiBuildingsDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                        <span className="font-medium text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                            {contact.companyName}
                                        </span>
                                    </div>
                                ) : (
                                    contact.companyName && (
                                        <div className="flex items-center gap-2 py-2 px-3">
                                            <PiBuildingsDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                                {contact.companyName}
                                            </span>
                                        </div>
                                    )
                                )}
                            </div>
                        </Section>
                    )}

                    <Section title="Даты">
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <PiCalendarDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="text-gray-700 dark:text-gray-300">
                                    Создан: {dayjs.unix(contact.createdAt).format('DD.MM.YYYY HH:mm')}
                                </span>
                            </div>
                            {contact.updatedAt !== contact.createdAt && (
                                <div className="flex items-center gap-2">
                                    <PiCalendarDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    <span className="text-gray-700 dark:text-gray-300">
                                        Обновлён: {dayjs.unix(contact.updatedAt).format('DD.MM.YYYY HH:mm')}
                                    </span>
                                </div>
                            )}
                        </div>
                    </Section>
                </div>

                <div className="space-y-0">
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
                                {contact.notes}
                            </div>
                        </div>
                    )}

                    {hasTags && (
                        <div className="mb-5 last:mb-0">
                            <div className="flex flex-wrap gap-2">
                                {contact.tags!.map((tag) => (
                                    <Tag
                                        key={tag}
                                        className="bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 text-xs border border-gray-200 dark:border-gray-600"
                                    >
                                        {tag}
                                    </Tag>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Card>
    )
}

export default ContactInfoWidget
