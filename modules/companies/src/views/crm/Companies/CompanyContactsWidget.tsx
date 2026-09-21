import { PiUsersDuotone, PiPlusDuotone, PiPhoneDuotone, PiEnvelopeDuotone } from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Avatar from '@/components/ui/Avatar'
import Tooltip from '@/components/ui/Tooltip'
import type { Contact } from '@/@types/crm'
import { qa } from '../../../qa'

const AVATAR_COLORS = [
    'bg-purple-500 text-white',
    'bg-emerald-500 text-white',
    'bg-pink-500 text-white',
    'bg-blue-500 text-white',
    'bg-amber-500 text-white',
]

function getInitials(contact: Contact): string {
    const first = contact.firstName?.[0] ?? ''
    const last = contact.lastName?.[0] ?? ''
    return (first + last).toUpperCase().slice(0, 2) || '-'
}

function getAvatarColor(index: number): string {
    return AVATAR_COLORS[index % AVATAR_COLORS.length]
}

export interface CompanyContactsWidgetProps {
    contacts: Contact[]
    onAddContact?: () => void
    onContactClick?: (contact: Contact) => void
    onPhone?: (contact: Contact) => void
    onEmail?: (contact: Contact) => void
}

const CompanyContactsWidget = ({
    contacts,
    onAddContact,
    onContactClick,
}: CompanyContactsWidgetProps) => {
    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0"
            bodyClass="flex-1 min-h-0 flex flex-col"
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiUsersDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">Контакты</h4>
                    </div>
                ),
                extra: onAddContact && (
                    <Tooltip title="Добавить контакт">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                onAddContact()
                            }}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            aria-label="Добавить контакт"
                            {...qa('companies.card.addContact')}
                        >
                            <PiPlusDuotone className="w-4 h-4" />
                        </button>
                    </Tooltip>
                ),
                bordered: true,
            }}
        >
            <div className="flex-1 flex flex-col min-h-0">
                {contacts.length === 0 ? (
                    <div
                        className="py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                        {...qa('companies.card.contactsEmpty')}
                    >
                        Нет контактов
                    </div>
                ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-600">
                        {contacts.map((contact, index) => {
                            const fullName = `${contact.firstName} ${contact.lastName}${contact.middleName ? ` ${contact.middleName}` : ''}`
                            const initials = getInitials(contact)
                            const avatarColor = getAvatarColor(index)

                            return (
                                <div
                                    key={contact.id}
                                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-4 px-4 rounded-lg transition-colors"
                                    onClick={() => onContactClick?.(contact)}
                                    {...qa('companies.card.contactRow', { contact: contact.id })}
                                >
                                    <div className="flex-shrink-0">
                                        <Avatar
                                            size="md"
                                            className={avatarColor}
                                        >
                                            {initials}
                                        </Avatar>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                            {fullName}
                                        </div>
                                        {contact.position && (
                                            <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                                {contact.position}
                                            </div>
                                        )}
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-sm text-gray-600 dark:text-gray-400">
                                            {contact.phone && (
                                                <a
                                                    href={`tel:${contact.phone.replace(/\D/g, '')}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                >
                                                    <PiPhoneDuotone className="w-3.5 h-3.5 flex-shrink-0" />
                                                    <span className="truncate">{contact.phone}</span>
                                                </a>
                                            )}
                                            {contact.email && (
                                                <a
                                                    href={`mailto:${contact.email}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate min-w-0"
                                                >
                                                    <PiEnvelopeDuotone className="w-3.5 h-3.5 flex-shrink-0" />
                                                    <span className="truncate">{contact.email}</span>
                                                </a>
                                            )}
                                        </div>
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

export default CompanyContactsWidget
