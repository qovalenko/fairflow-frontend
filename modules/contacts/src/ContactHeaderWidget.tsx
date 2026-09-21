import {
    PiPencilDuotone,
    PiTrashDuotone,
    PiPhoneDuotone,
    PiEnvelopeDuotone,
    PiGitMergeDuotone,
} from 'react-icons/pi'
import Avatar from '@/components/ui/Avatar'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import { useGlobalEntityDrawer } from '@/store/globalEntityDrawerStore'
import type { Contact } from '@/@types/crm'
import { qa } from './qa'

export interface ContactHeaderWidgetProps {
    contact: Contact
    fullName: string
    onEdit?: () => void
    onDelete?: () => void
    onMerge?: () => void
    mergeBusy?: boolean
}

const ContactHeaderWidget = ({
    contact,
    fullName,
    onEdit,
    onDelete,
    onMerge,
    mergeBusy,
}: ContactHeaderWidgetProps) => {
    const initials =
        [contact.firstName?.[0], contact.lastName?.[0]]
            .filter(Boolean)
            .join('')
            .toUpperCase()
            .slice(0, 2) || '—'

    const assigneeInitials = contact.assigneeName
        ? contact.assigneeName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
        : '—'

    return (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-start gap-4">
                    <Avatar size="lg" className="flex-shrink-0 bg-blue-500 text-white">
                        {initials}
                    </Avatar>
                    <div className="min-w-0">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                            {fullName}
                        </h3>
                        {contact.position && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                {contact.position}
                            </p>
                        )}
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                            {contact.phone && (
                                <a
                                    href={`tel:${contact.phone.replace(/\D/g, '')}`}
                                    className="flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    {...qa('contacts.details.phoneLink')}
                                >
                                    <PiPhoneDuotone className="w-4 h-4 text-gray-400" />
                                    {contact.phone}
                                </a>
                            )}
                            {contact.email && (
                                <a
                                    href={`mailto:${contact.email}`}
                                    className="flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate"
                                    {...qa('contacts.details.emailLink')}
                                >
                                    <PiEnvelopeDuotone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                    <span className="truncate">{contact.email}</span>
                                </a>
                            )}
                        </div>
                        {contact.tags && contact.tags.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                {contact.tags.map((tag) => (
                                    <Tag
                                        key={tag}
                                        className="bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400"
                                    >
                                        {tag}
                                    </Tag>
                                ))}
                            </div>
                        )}
                        {contact.source && (
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                    {contact.source}
                                </Tag>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-end gap-3 flex-shrink-0 sm:items-end">
                <div className="flex items-center gap-1">
                    {onMerge && (
                        <Tooltip title="Найти и слить дубль">
                            <button
                                type="button"
                                onClick={onMerge}
                                disabled={mergeBusy}
                                aria-label="Слить дубль"
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
                                {...qa('contacts.details.merge')}
                            >
                                <PiGitMergeDuotone className="w-5 h-5" />
                            </button>
                        </Tooltip>
                    )}
                    {onEdit && (
                        <Tooltip title="Редактировать">
                            <button
                                type="button"
                                onClick={onEdit}
                                aria-label="Редактировать"
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                {...qa('contacts.details.edit')}
                            >
                                <PiPencilDuotone className="w-5 h-5" />
                            </button>
                        </Tooltip>
                    )}
                    {onDelete && (
                        <Tooltip title="Удалить">
                            <button
                                type="button"
                                onClick={onDelete}
                                aria-label="Удалить"
                                className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                                {...qa('contacts.details.delete')}
                            >
                                <PiTrashDuotone className="w-5 h-5" />
                            </button>
                        </Tooltip>
                    )}
                </div>

                {contact.assigneeName && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                        <button
                            type="button"
                            disabled={!contact.assigneeId}
                            onClick={() =>
                                contact.assigneeId &&
                                useGlobalEntityDrawer.getState().open('user', contact.assigneeId)
                            }
                            className="flex items-center gap-3 text-left disabled:cursor-default"
                        >
                        <div className="flex-shrink-0">
                            <Avatar size="md" className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                                {assigneeInitials}
                            </Avatar>
                        </div>
                        <div>
                            <div className="font-semibold text-gray-900 dark:text-gray-100">
                                {contact.assigneeName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                Менеджер аккаунта
                            </div>
                        </div>
                        </button>
                        <div className="flex items-center gap-1 ml-2">
                            {contact.phone && (
                                <a
                                    href={`tel:${contact.phone.replace(/\D/g, '')}`}
                                    className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                    title="Позвонить"
                                    aria-label="Позвонить"
                                >
                                    <PiPhoneDuotone className="w-4 h-4" />
                                </a>
                            )}
                            {contact.email && (
                                <a
                                    href={`mailto:${contact.email}`}
                                    className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                    title="Эл. почта"
                                    aria-label="Написать"
                                >
                                    <PiEnvelopeDuotone className="w-4 h-4" />
                                </a>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ContactHeaderWidget
