import {
    PiPencilDuotone,
    PiTrashDuotone,
    PiCalendarCheckDuotone,
    PiFlagDuotone,
    PiUserDuotone,
    PiCheckCircleDuotone,
} from 'react-icons/pi'
import Button from '@/components/ui/Button'
import dayjs from 'dayjs'
import Avatar from '@/components/ui/Avatar'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import Select from '@/components/ui/Select'
import type { Activity, ActivityType, ActivityStatus } from '@/@types/crm'
import { qa } from '../qa'

const typeConfig: Record<ActivityType, { icon: string; label: string }> = {
    task: { icon: '📋', label: 'Задача' },
    call: { icon: '📞', label: 'Звонок' },
    meeting: { icon: '🤝', label: 'Встреча' },
    note: { icon: '📝', label: 'Заметка' },
}

const statusConfig: Record<ActivityStatus, { label: string; className: string }> = {
    planned: {
        label: 'Запланировано',
        className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    },
    in_progress: {
        label: 'В работе',
        className: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    },
    completed: {
        label: 'Завершено',
        className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    },
    cancelled: {
        label: 'Отменено',
        className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    },
}

const priorityConfig: Record<string, { label: string; className: string }> = {
    low: {
        label: 'Низкий',
        className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    },
    medium: {
        label: 'Средний',
        className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    },
    high: {
        label: 'Высокий',
        className: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    },
    urgent: {
        label: 'Срочный',
        className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    },
}

const statusOptions = [
    { value: 'planned', label: 'Запланировано' },
    { value: 'in_progress', label: 'В работе' },
    { value: 'completed', label: 'Завершено' },
    { value: 'cancelled', label: 'Отменено' },
]

export interface ActivityHeaderWidgetProps {
    activity: Activity
    isOverdue?: boolean
    onEdit?: () => void
    onDelete?: () => void
    onStatusChange?: (status: string) => void
    onComplete?: () => void
    /** FR-ACTIVITIES-210: open built-in follow-up dialog after complete. */
    onCompleteWithFollowUp?: () => void
    /** Право мутации (write/manage) — иначе статус/edit/complete скрыты (ST-11/12). */
    canMutate?: boolean
    /** Право удаления (delete/manage) — иначе кнопка удаления скрыта. */
    canDelete?: boolean
    /** Идёт мутация — блокирует элементы управления (ST-26). */
    busy?: boolean
}

const ActivityHeaderWidget = ({
    activity,
    isOverdue = false,
    onEdit,
    onDelete,
    onStatusChange,
    onComplete,
    onCompleteWithFollowUp,
    canMutate = true,
    canDelete = true,
    busy = false,
}: ActivityHeaderWidgetProps) => {
    const typeInfo = typeConfig[activity.type]
    const statusInfo = statusConfig[activity.status]
    const priorityInfo = priorityConfig[activity.priority]
    const isTerminal = activity.status === 'completed' || activity.status === 'cancelled'

    const assigneeInitials = activity.assigneeName
        ? activity.assigneeName
              .split(' ')
              .map((n) => n[0])
              .join('')
              .slice(0, 2)
        : '—'

    return (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-2xl">
                        {typeInfo.icon}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                                {activity.title}
                            </h3>
                            <Tag className="text-gray-600 dark:text-gray-400">{typeInfo.label}</Tag>
                            {isOverdue && (
                                <Tag
                                    className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                                    {...qa('activities.details.overdueBadge')}
                                >
                                    Просрочено
                                </Tag>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Tag className={statusInfo.className}>{statusInfo.label}</Tag>
                            <Tag className={priorityInfo.className}>
                                <PiFlagDuotone className="w-3.5 h-3.5 mr-1 inline" />
                                {priorityInfo.label}
                            </Tag>
                            {activity.direction && (
                                <Tag
                                    className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                                    {...qa('activities.details.directionTag', {
                                        direction: activity.direction,
                                    })}
                                >
                                    {activity.direction === 'inbound' ||
                                    activity.direction === 'incoming'
                                        ? 'Входящий'
                                        : 'Исходящий'}
                                </Tag>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-end gap-3 flex-shrink-0 sm:items-end">
                <div className="flex items-center gap-1 flex-wrap justify-end">
                    {canMutate && !isTerminal && onComplete && (
                        <Button
                            variant="solid"
                            color="primary"
                            size="sm"
                            icon={<PiCheckCircleDuotone />}
                            loading={busy}
                            onClick={onComplete}
                            {...qa('activities.details.complete')}
                        >
                            Завершить
                        </Button>
                    )}
                    {canMutate && !isTerminal && onCompleteWithFollowUp && (
                        <Button
                            variant="default"
                            size="sm"
                            loading={busy}
                            onClick={onCompleteWithFollowUp}
                            {...qa('activities.details.completeFollowUp')}
                        >
                            Завершить и следующую
                        </Button>
                    )}
                    {canMutate && (
                        <div {...qa('activities.details.status')}>
                            <Select
                                placeholder="Статус"
                                options={statusOptions}
                                value={statusOptions.find((o) => o.value === activity.status) || null}
                                onChange={(option) => option && onStatusChange?.(option.value)}
                                isDisabled={busy || isTerminal}
                                size="sm"
                                className="min-w-[140px]"
                            />
                        </div>
                    )}
                    {canMutate && (
                        <Tooltip title="Редактировать">
                            <button
                                type="button"
                                onClick={onEdit}
                                disabled={busy}
                                aria-label="Редактировать"
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
                                {...qa('activities.details.edit')}
                            >
                                <PiPencilDuotone className="w-5 h-5" />
                            </button>
                        </Tooltip>
                    )}
                    {canDelete && (
                        <Tooltip title="Удалить">
                            <button
                                type="button"
                                onClick={onDelete}
                                disabled={busy}
                                aria-label="Удалить"
                                className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 disabled:opacity-50"
                                {...qa('activities.details.delete')}
                            >
                                <PiTrashDuotone className="w-5 h-5" />
                            </button>
                        </Tooltip>
                    )}
                </div>

                {activity.assigneeName && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
                        <Avatar size="md" className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                            {assigneeInitials}
                        </Avatar>
                        <div>
                            <div className="font-semibold text-gray-900 dark:text-gray-100">
                                {activity.assigneeName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                Ответственный
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ActivityHeaderWidget
