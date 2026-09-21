import { useState } from 'react'
import {
    PiBuildingsDuotone,
    PiPencilDuotone,
    PiPhoneDuotone,
    PiEnvelopeDuotone,
    PiChatCircleDuotone,
    PiGlobeDuotone,
    PiTrashDuotone,
    PiPrinterDuotone,
    PiLinkDuotone,
    PiFileTextDuotone,
} from 'react-icons/pi'
import {
    useFloating,
    autoUpdate,
    offset,
    flip,
    shift,
    useClick,
    useDismiss,
    useInteractions,
    FloatingPortal,
} from '@floating-ui/react'
import Avatar from '@/components/ui/Avatar'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import CompanyRequisitesWidget from './CompanyRequisitesWidget'
import { useGlobalEntityDrawer } from '@/store/globalEntityDrawerStore'
import type { Company } from '@/@types/crm'
import { qa } from '../../../qa'

export interface CompanyHeaderStats {
    dealsTotalAmount: number
    dealsWonAmount: number
    dealsCount: number
    ordersCount: number
    contactsCount: number
}

export interface CompanyHeaderWidgetProps {
    company: Company
    onEdit?: () => void
    onPrint?: () => void
    onCopyLink?: () => void
    onDelete?: () => void
    onPhone?: () => void
    onChat?: () => void
    onEmail?: () => void
    onRequisitesCopy?: () => void
    isPinned?: boolean
}

const CompanyHeaderWidget = ({
    company,
    onEdit,
    onPrint,
    onCopyLink,
    onDelete,
    onPhone,
    onChat,
    onEmail,
    onRequisitesCopy,
    isPinned = false,
}: CompanyHeaderWidgetProps) => {
    const [requisitesOpen, setRequisitesOpen] = useState(false)

    const hasRequisites =
        company.ogrn ||
        company.kpp ||
        company.legalAddress ||
        company.actualAddress ||
        company.bankName ||
        company.bik ||
        company.correspondentAccount ||
        company.settlementAccount

    const { refs, floatingStyles, context } = useFloating({
        open: requisitesOpen,
        onOpenChange: setRequisitesOpen,
        placement: 'bottom-end',
        whileElementsMounted: autoUpdate,
        middleware: [offset(8), flip(), shift()],
    })

    const click = useClick(context)
    const dismiss = useDismiss(context, { outsidePress: true })
    const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss])

    const assigneeInitials = company.assigneeName
        ? company.assigneeName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
        : '-'

    return (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
                        <PiBuildingsDuotone className="w-7 h-7 text-white" />
                    </div>
                    <div className="min-w-0">
                        <h3
                            className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate"
                            {...qa('companies.card.name', { company: company.id })}
                        >
                            {company.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                            {company.inn && (
                                <span className="flex items-center gap-1.5" {...qa('companies.card.inn')}>
                                    <PiGlobeDuotone className="w-4 h-4 text-gray-400" />
                                    ИНН: {company.inn}
                                </span>
                            )}
                            {company.phone && (
                                <a
                                    href={`tel:${company.phone.replace(/\D/g, '')}`}
                                    className="flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    {...qa('companies.card.phone')}
                                >
                                    <PiPhoneDuotone className="w-4 h-4 text-gray-400" />
                                    {company.phone}
                                </a>
                            )}
                            {company.email && (
                                <a
                                    href={`mailto:${company.email}`}
                                    className="flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    {...qa('companies.card.email')}
                                >
                                    <PiEnvelopeDuotone className="w-4 h-4 text-gray-400" />
                                    {company.email}
                                </a>
                            )}
                        </div>
                        {(company.tags?.length || (company.industry && !company.tags?.includes(company.industry))) ? (
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                {company.tags?.map((tag) => (
                                    <Tag
                                        key={tag}
                                        className={
                                            tag === 'VIP'
                                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                                : 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400'
                                        }
                                    >
                                        {tag}
                                    </Tag>
                                ))}
                                {company.industry && !company.tags?.includes(company.industry) && (
                                    <Tag className="bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400 uppercase text-xs">
                                        {company.industry}
                                    </Tag>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-end gap-3 flex-shrink-0">
                <div className="flex items-center gap-1">
                    <Tooltip title="Редактировать">
                        <button
                            type="button"
                            onClick={onEdit}
                            aria-label="Редактировать"
                            {...qa('companies.card.edit')}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            <PiPencilDuotone className="w-5 h-5" />
                        </button>
                    </Tooltip>
                    {hasRequisites && (
                        <Tooltip title="Реквизиты">
                            <button
                                ref={refs.setReference}
                                type="button"
                                {...getReferenceProps()}
                                aria-label="Реквизиты"
                                {...qa('companies.card.requisites')}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                <PiFileTextDuotone className="w-5 h-5" />
                            </button>
                        </Tooltip>
                    )}
                    <Tooltip title="Печатать">
                        <button
                            type="button"
                            onClick={onPrint}
                            aria-label="Печатать"
                            {...qa('companies.card.print')}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            <PiPrinterDuotone className="w-5 h-5" />
                        </button>
                    </Tooltip>
                    <Tooltip title="Копировать ссылку на профиль">
                        <button
                            type="button"
                            onClick={onCopyLink}
                            aria-label="Копировать ссылку на профиль"
                            {...qa('companies.card.copyLink')}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            <PiLinkDuotone className="w-5 h-5" />
                        </button>
                    </Tooltip>
                    <Tooltip title="Удалить">
                        <button
                            type="button"
                            onClick={onDelete}
                            aria-label="Удалить"
                            {...qa('companies.card.delete')}
                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                        >
                            <PiTrashDuotone className="w-5 h-5" />
                        </button>
                    </Tooltip>
                </div>

                {company.assigneeName && (
                    <div className="relative flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                        {isPinned && (
                            <span className="absolute -top-2 left-3 px-2 py-0.5 text-xs font-medium rounded bg-blue-600 text-white">
                                ЗАКРЕПЛЁН
                            </span>
                        )}
                        <button
                            type="button"
                            disabled={!company.assigneeId}
                            onClick={() =>
                                company.assigneeId &&
                                useGlobalEntityDrawer.getState().open('user', company.assigneeId)
                            }
                            className="relative flex items-center gap-3 text-left disabled:cursor-default"
                        >
                        <div className="relative flex-shrink-0">
                            <Avatar size="md" className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                                {assigneeInitials}
                            </Avatar>
                            <span
                                className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-gray-800"
                                title="Онлайн"
                            />
                        </div>
                        <div>
                            <div className="font-semibold text-gray-900 dark:text-gray-100">
                                {company.assigneeName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                Менеджер аккаунта
                            </div>
                        </div>
                        </button>
                        {/* Кнопка без обработчика — мёртвый клик: рисуем только те
                            каналы, которые карточка реально умеет открыть. */}
                        {(onPhone || onChat || onEmail) && (
                            <div className="flex items-center gap-1 ml-2">
                                {onPhone && (
                                    <button
                                        type="button"
                                        onClick={onPhone}
                                        aria-label="Позвонить"
                                        className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                        title="Позвонить"
                                    >
                                        <PiPhoneDuotone className="w-4 h-4" />
                                    </button>
                                )}
                                {onChat && (
                                    <button
                                        type="button"
                                        onClick={onChat}
                                        aria-label="Написать"
                                        className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                        title="Написать"
                                    >
                                        <PiChatCircleDuotone className="w-4 h-4" />
                                    </button>
                                )}
                                {onEmail && (
                                    <button
                                        type="button"
                                        onClick={onEmail}
                                        aria-label="Эл. почта"
                                        className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                        title="Эл. почта"
                                    >
                                        <PiEnvelopeDuotone className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {requisitesOpen && hasRequisites && (
                <FloatingPortal>
                    <div
                        ref={refs.setFloating}
                        style={floatingStyles}
                        {...getFloatingProps()}
                        className="z-50 w-80"
                    >
                        <CompanyRequisitesWidget
                            company={company}
                            onCopy={() => {
                                onRequisitesCopy?.()
                            }}
                        />
                    </div>
                </FloatingPortal>
            )}
        </div>
    )
}

export default CompanyHeaderWidget
