import {
    PiPlusDuotone,
    PiPhoneDuotone,
    PiEnvelopeDuotone,
    PiGlobeDuotone,
    PiInfoDuotone,
    PiFactoryDuotone,
    PiChatCircleTextDuotone,
    PiWarningCircleDuotone,
} from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Avatar from '@/components/ui/Avatar'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import type { Company, Contact, RelatedCompany, RelatedCompanyRelation } from '@/@types/crm'
import { qa } from '../../../qa'

const AVATAR_COLORS = [
    'bg-purple-500 text-white',
    'bg-emerald-500 text-white',
    'bg-pink-500 text-white',
    'bg-blue-500 text-white',
    'bg-amber-500 text-white',
]

const RELATION_LABELS: Record<RelatedCompanyRelation, string> = {
    head: 'ГОЛОВНОЙ ОФИС',
    current: 'ТЕКУЩАЯ',
    branch: 'ФИЛИАЛ',
    subsidiary: 'ДОЧКА',
}

const RELATION_STYLES: Record<RelatedCompanyRelation, string> = {
    head: 'bg-blue-600 text-white border-blue-600',
    current: 'bg-gray-500 text-white border-gray-500 dark:bg-gray-600 dark:border-gray-600',
    branch: 'bg-gray-500 text-white border-gray-500 dark:bg-gray-600 dark:border-gray-600',
    subsidiary: 'bg-gray-500 text-white border-gray-500 dark:bg-gray-600 dark:border-gray-600',
}

function getInitials(contact: Contact): string {
    const first = contact.firstName?.[0] ?? ''
    const last = contact.lastName?.[0] ?? ''
    return (first + last).toUpperCase().slice(0, 2) || '-'
}

export interface CompanyInfoWidgetProps {
    company: Company
    contacts: Contact[]
    /**
     * Связи контактов пришли обрезанными (gateway упёрся в потолок свипа —
     * `stats.contactsTruncated` композита карточки). Тогда счётчик — нижняя
     * граница, и секция обязана это сказать вслух, а не молча занижать число.
     */
    contactsTruncated?: boolean
    onAddContact?: () => void
    onContactClick?: (contact: Contact) => void
    onCompanyClick?: (id: string) => void
    onEditNotes?: () => void
}

const Section = ({
    title,
    children,
    action,
}: {
    title: React.ReactNode
    children: React.ReactNode
    action?: React.ReactNode
}) => (
    <div className="mb-5 last:mb-0">
        <div className="flex items-center justify-between gap-2 mb-2">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                {title}
            </h5>
            {action}
        </div>
        {children}
    </div>
)

const CompanyInfoWidget = ({
    company,
    contacts,
    contactsTruncated = false,
    onAddContact,
    onContactClick,
    onCompanyClick,
    onEditNotes,
}: CompanyInfoWidgetProps) => {
    const hasGeneralInfo =
        company.phone ||
        company.email ||
        company.website ||
        company.industry !== undefined

    const relatedCompanies = company.relatedCompanies ?? []
    const hasTags = company.tags && company.tags.length > 0
    const hasNotes = company.notes && company.notes.trim().length > 0

    function RelatedCompanyTreeItem({ item, depth }: { item: RelatedCompany; depth: number }) {
        const isCurrent = item.relationType === 'current' || item.id === company.id
        const hasChildren = item.children && item.children.length > 0

        return (
            <div className={depth > 0 ? 'mt-0.5' : ''}>
                <div
                    className={`
                        flex items-center justify-between gap-2 py-1.5 pr-2 rounded-2xl cursor-pointer transition-colors -mx-2 px-2
                        hover:bg-gray-50 dark:hover:bg-gray-700/50
                        ${isCurrent ? 'bg-gray-50 dark:bg-gray-700/50' : ''}
                    `}
                    onClick={() => onCompanyClick?.(item.id)}
                >
                    <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                            {item.name}
                        </div>
                        {item.inn && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                ИНН: {item.inn}
                            </div>
                        )}
                    </div>
                    <Tag
                        className={`flex-shrink-0 text-[10px] font-medium uppercase px-1.5 py-0.5 ${RELATION_STYLES[item.relationType]}`}
                    >
                        {RELATION_LABELS[item.relationType]}
                    </Tag>
                </div>
                {hasChildren && (
                    <div className="ml-3 pl-3 border-l-2 border-gray-200 dark:border-gray-600">
                        {item.children!.map((child) => (
                            <RelatedCompanyTreeItem key={child.id} item={child} depth={depth + 1} />
                        ))}
                    </div>
                )}
            </div>
        )
    }

    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
            bodyClass="flex-1 min-h-0 flex flex-col overflow-y-auto"
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiInfoDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">Информация о компании</h4>
                    </div>
                ),
                bordered: true,
            }}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl">
                <div className="space-y-0">
                    {hasGeneralInfo && (
                        <Section title="Общая информация">
                            <div className="space-y-2 text-sm">
                                {company.phone && (
                                    <div className="flex items-center gap-2">
                                        <PiPhoneDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                        <a
                                            href={`tel:${company.phone.replace(/\D/g, '')}`}
                                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                                        >
                                            {company.phone}
                                        </a>
                                    </div>
                                )}
                                {company.email && (
                                    <div className="flex items-center gap-2">
                                        <PiEnvelopeDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                        <a
                                            href={`mailto:${company.email}`}
                                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                                        >
                                            {company.email}
                                        </a>
                                    </div>
                                )}
                                {company.website && (
                                    <div className="flex items-center gap-2">
                                        <PiGlobeDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                        <a
                                            href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 truncate"
                                        >
                                            {company.website}
                                        </a>
                                    </div>
                                )}
                                {company.industry && (
                                    <div className="flex items-center gap-2">
                                        <PiFactoryDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                        <span className="text-gray-700 dark:text-gray-300">{company.industry}</span>
                                    </div>
                                )}
                            </div>
                        </Section>
                    )}

                    {/* Иерархия связанных компаний ещё не поддержана бэкендом:
                        `relatedCompanies` нет ни в proto Company, ни в mapCompany
                        на gateway, поэтому массив всегда пуст. Секция рисовалась
                        безусловно и стабильно показывала «Нет связанных компаний» —
                        рендерим её только при непустых данных, чтобы карточка не
                        обещала несуществующую функциональность. Разметка дерева
                        остаётся готовой к появлению поля в ответе. */}
                    {relatedCompanies.length > 0 && (
                        <Section title="Связанные компании">
                            <div className="space-y-2">
                                {relatedCompanies.map((item) => (
                                    <RelatedCompanyTreeItem key={item.id} item={item} depth={0} />
                                ))}
                            </div>
                        </Section>
                    )}
                </div>

                <div className="space-y-0">
                    {hasNotes && (
                        <div className="mb-5 last:mb-0 relative">
                            {onEditNotes && (
                                <Tooltip title="Изменить примечание">
                                    <button
                                        type="button"
                                        onClick={onEditNotes}
                                        className="absolute top-2 right-2 z-10 p-2 rounded-lg hover:bg-sky-200/60 dark:hover:bg-sky-800/50 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                        aria-label="Изменить примечание"
                                    >
                                        <PiChatCircleTextDuotone className="w-4 h-4" />
                                    </button>
                                </Tooltip>
                            )}
                            <div className="text-sm text-sky-800 dark:text-sky-100 whitespace-pre-wrap rounded-2xl p-4 pr-12 flex flex-col justify-center bg-sky-100 dark:bg-sky-900/75">
                                {company.notes}
                            </div>
                        </div>
                    )}

                    <Section
                        title={
                            <span className="inline-flex items-baseline gap-1.5">
                                Контакты
                                {contacts.length > 0 && (
                                    <span
                                        className="tabular-nums font-medium text-gray-500 dark:text-gray-400"
                                        title={
                                            contactsTruncated
                                                ? 'Показаны не все связи: выборка контактов обрезана по лимиту'
                                                : undefined
                                        }
                                    >
                                        {contactsTruncated
                                            ? `${contacts.length}+`
                                            : contacts.length}
                                    </span>
                                )}
                            </span>
                        }
                        action={
                            onAddContact && (
                                <Tooltip title="Добавить контакт">
                                    <button
                                        type="button"
                                        onClick={onAddContact}
                                        className="p-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-blue-600 dark:text-blue-400"
                                        aria-label="Добавить контакт"
                                        {...qa('companies.card.addContact')}
                                    >
                                        <PiPlusDuotone className="w-4 h-4" />
                                    </button>
                                </Tooltip>
                            )
                        }
                    >
                        {contacts.length === 0 ? (
                            <div
                                className="text-sm text-gray-500 dark:text-gray-400 py-3"
                                {...qa('companies.card.contactsEmpty')}
                            >
                                Нет контактов
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {contacts.map((contact, index) => {
                                    const fullName = `${contact.firstName} ${contact.lastName}${contact.middleName ? ` ${contact.middleName}` : ''}`
                                    const initials = getInitials(contact)
                                    const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length]
                                    const isPrimary =
                                        contact.isPrimary === true ||
                                        company.contactIds?.[0] === contact.id ||
                                        index === 0
                                    const primaryClasses =
                                        'bg-amber-100 dark:bg-amber-900/75 hover:bg-amber-200/80 dark:hover:bg-amber-900/90'
                                    const defaultClasses =
                                        'bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    const primaryTextClasses = 'text-gray-900 dark:text-gray-100'
                                    const defaultTextClasses = 'text-gray-900 dark:text-gray-100'
                                    const primarySubtextClasses = 'text-gray-500 dark:text-gray-400'
                                    const defaultSubtextClasses = 'text-gray-500 dark:text-gray-400'
                                    const primaryIconClasses =
                                        'text-gray-500 dark:text-gray-400 hover:text-amber-600 hover:bg-amber-200/60 dark:hover:bg-amber-800/50 dark:hover:text-amber-200'
                                    const defaultIconClasses =
                                        'text-gray-500 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-blue-400'
                                    return (
                                        <div
                                            key={contact.id}
                                            className={`flex items-center gap-2 py-3 px-4 rounded-2xl cursor-pointer transition-colors ${isPrimary ? primaryClasses : defaultClasses}`}
                                            onClick={() => onContactClick?.(contact)}
                                            {...qa('companies.card.contactRow', { contact: contact.id })}
                                        >
                                            <Avatar size="sm" className={`flex-shrink-0 ${avatarColor}`}>
                                                {initials}
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <div
                                                    className={`font-semibold text-sm truncate ${isPrimary ? primaryTextClasses : defaultTextClasses}`}
                                                >
                                                    {fullName}
                                                </div>
                                                {contact.position && (
                                                    <div
                                                        className={`text-xs truncate mt-0.5 ${isPrimary ? primarySubtextClasses : defaultSubtextClasses}`}
                                                    >
                                                        {contact.position}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {contact.phone && (
                                                    <Tooltip title={contact.phone} wrapperClass="inline-flex">
                                                        <a
                                                            href={`tel:${contact.phone.replace(/\D/g, '')}`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className={`inline-flex p-1.5 rounded-md transition-colors ${isPrimary ? primaryIconClasses : defaultIconClasses}`}
                                                            aria-label={`Позвонить: ${contact.phone}`}
                                                        >
                                                            <PiPhoneDuotone className="w-4 h-4" />
                                                        </a>
                                                    </Tooltip>
                                                )}
                                                {contact.email && (
                                                    <Tooltip title={contact.email} wrapperClass="inline-flex">
                                                        <a
                                                            href={`mailto:${contact.email}`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className={`inline-flex p-1.5 rounded-md transition-colors ${isPrimary ? primaryIconClasses : defaultIconClasses}`}
                                                            aria-label={`Написать: ${contact.email}`}
                                                        >
                                                            <PiEnvelopeDuotone className="w-4 h-4" />
                                                        </a>
                                                    </Tooltip>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        {contactsTruncated && (
                            <div
                                className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
                                {...qa('companies.card.contactsTruncated')}
                            >
                                <PiWarningCircleDuotone className="w-4 h-4 flex-shrink-0" />
                                <span>
                                    Показаны не все связи: выборка контактов компании обрезана по
                                    лимиту. Уточните список в разделе «Контакты».
                                </span>
                            </div>
                        )}
                    </Section>

                    {hasTags && (
                        <div className="mb-5 last:mb-0">
                            <div className="flex flex-wrap gap-2">
                                {company.tags!.map((tag) => (
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

export default CompanyInfoWidget
