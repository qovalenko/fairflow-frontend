import {
    PiPencilDuotone,
    PiTrashDuotone,
    PiHandshakeDuotone,
    PiUserDuotone,
} from 'react-icons/pi'
import Avatar from '@/components/ui/Avatar'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import Select from '@/components/ui/Select'
import { useGlobalEntityDrawer } from '@/store/globalEntityDrawerStore'
import type { Deal } from '@/@types/crm'
import { qa } from '../qa'
import { makeSelectOption } from '../selectQa'

const formatCurrency = (amount: number, currency = 'RUB') =>
    new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
    }).format(amount)

export interface DealHeaderWidgetProps {
    deal: Deal
    stageOptions: { value: string; label: string }[]
    onEdit?: () => void
    onDelete?: () => void
    onMoveToStage?: (stageId: string) => void
}

const DealHeaderWidget = ({
    deal,
    stageOptions,
    onEdit,
    onDelete,
    onMoveToStage,
}: DealHeaderWidgetProps) => {
    const assigneeInitials = deal.assigneeName
        ? deal.assigneeName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
        : '—'

    return (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center">
                        <PiHandshakeDuotone className="w-7 h-7 text-white" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                                {deal.name}
                            </h3>
                            {deal.result === 'won' && (
                                <Tag className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                                    Выиграна
                                </Tag>
                            )}
                            {deal.result === 'lost' && (
                                <Tag className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                                    Проиграна
                                </Tag>
                            )}
                        </div>
                        <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                            {formatCurrency(deal.amount, deal.currency)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                {deal.stageName}
                            </Tag>
                            {deal.companyName && (
                                <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                    {deal.companyName}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-end gap-3 flex-shrink-0 sm:items-end">
                <div className="flex items-center gap-1 flex-wrap justify-end">
                    <Tooltip title="Редактировать">
                        <button
                            type="button"
                            onClick={onEdit}
                            aria-label="Редактировать"
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            {...qa('deals.details.edit')}
                        >
                            <PiPencilDuotone className="w-5 h-5" />
                        </button>
                    </Tooltip>
                    {stageOptions.length > 0 && onMoveToStage && (
                        <Select
                            placeholder="Переместить"
                            options={stageOptions}
                            value={stageOptions.find((o) => o.value === deal.stageId) || null}
                            onChange={(option) => option && onMoveToStage(option.value)}
                            size="sm"
                            className="min-w-[140px]"
                            components={{ Option: makeSelectOption('deals.details.moveStage') }}
                            {...qa('deals.details.moveStage')}
                        />
                    )}
                    <Tooltip title="Удалить">
                        <button
                            type="button"
                            onClick={onDelete}
                            aria-label="Удалить"
                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                            {...qa('deals.details.delete')}
                        >
                            <PiTrashDuotone className="w-5 h-5" />
                        </button>
                    </Tooltip>
                </div>

                {deal.assigneeName && (
                    <button
                        type="button"
                        disabled={!deal.assigneeId}
                        onClick={() =>
                            deal.assigneeId &&
                            useGlobalEntityDrawer.getState().open('user', deal.assigneeId)
                        }
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-left disabled:cursor-default enabled:hover:border-blue-300 enabled:dark:hover:border-blue-600"
                    >
                        <Avatar size="md" className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                            {assigneeInitials}
                        </Avatar>
                        <div>
                            <div className="font-semibold text-gray-900 dark:text-gray-100">
                                {deal.assigneeName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                Ответственный
                            </div>
                        </div>
                    </button>
                )}
            </div>
        </div>
    )
}

export default DealHeaderWidget
