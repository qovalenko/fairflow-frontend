import { PiPencilDuotone, PiReceiptDuotone } from 'react-icons/pi'
import Avatar from '@/components/ui/Avatar'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import Select from '@/components/ui/Select'
import { useGlobalEntityDrawer } from '@/store/globalEntityDrawerStore'
import type { Order } from '@/@types/crm'
import { qa } from './qa'

const statusConfig: Record<string, { label: string; className: string }> = {
    active: {
        label: 'Активен',
        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    },
    error: {
        label: '⚠ DLQ',
        className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    },
    completed: {
        label: 'Завершён',
        className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    },
}

export interface OrderHeaderWidgetProps {
    order: Order
    stageOptions: { value: string; label: string }[]
    onEdit?: () => void
    onMoveToStage?: (stageId: string) => void
}

const OrderHeaderWidget = ({ order, stageOptions, onEdit, onMoveToStage }: OrderHeaderWidgetProps) => {
    const status = statusConfig[order.status] ?? statusConfig.active
    const assigneeInitials = order.assigneeName
        ? order.assigneeName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
        : '—'

    return (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center">
                        <PiReceiptDuotone className="w-7 h-7 text-white" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{order.number}</h3>
                            <Tag className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                                {order.typeName}
                            </Tag>
                            <Tag className={status.className}>{status.label}</Tag>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{order.stageName}</div>
                        {(order.dealName || order.companyName) && (
                            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-gray-600 dark:text-gray-400">
                                {order.dealName && <span>{order.dealName}</span>}
                                {order.companyName && <span>· {order.companyName}</span>}
                            </div>
                        )}
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
                            {...qa('orders.details.header.edit')}
                        >
                            <PiPencilDuotone className="w-5 h-5" />
                        </button>
                    </Tooltip>
                    {stageOptions.length > 0 && onMoveToStage && (
                        <div className="min-w-[140px]" {...qa('orders.details.header.moveStage')}>
                            <Select
                                placeholder="Переместить"
                                options={stageOptions}
                                value={stageOptions.find((o) => o.value === order.stageId) || null}
                                onChange={(option) => option && onMoveToStage(option.value)}
                                size="sm"
                                className="min-w-[140px]"
                            />
                        </div>
                    )}
                </div>

                {order.assigneeName && (
                    <button
                        type="button"
                        disabled={!order.assigneeId}
                        onClick={() =>
                            order.assigneeId &&
                            useGlobalEntityDrawer.getState().open('user', order.assigneeId)
                        }
                        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-left disabled:cursor-default enabled:hover:border-blue-300 enabled:dark:hover:border-blue-600"
                    >
                        <Avatar size="md" className="bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300">
                            {assigneeInitials}
                        </Avatar>
                        <div>
                            <div className="font-semibold text-gray-900 dark:text-gray-100">{order.assigneeName}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Ответственный</div>
                        </div>
                    </button>
                )}
            </div>
        </div>
    )
}

export default OrderHeaderWidget
