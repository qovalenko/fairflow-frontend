import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import 'dayjs/locale/ru'
import {
    PiWarningOctagonDuotone,
    PiArrowRightDuotone,
    PiCheckCircleDuotone,
    PiArrowClockwiseDuotone,
    PiListChecksDuotone,
    PiPhoneDuotone,
    PiUsersDuotone,
    PiNoteDuotone,
} from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { apiGetActivities, apiGetOverdueCount } from '@/services/CrmService'
import type { Activity, ActivityType } from '@/@types/crm'
import { normalizeList, normalizeActivity, isOverdue } from './activityShared'
import { useOverdueAssigneeGroups } from './overdueAssigneeGroups'
import { qa } from '../qa'

/**
 * SCR-ACTIVITIES-DASHBOARD-WIDGET — виджет «Просроченные» на системном
 * дашборде (mount-point `dashboard.widget`, FR-MACT-20/9).
 *
 * Данные: счётчик `GET /api/activities/overdue-count` (scope, кэш 30–60с,
 * ST-28 lag) + список просроченных (фильтр `overdueOnly`). Состояния:
 * ST-1 loading, ST-3 empty (позитивная формулировка), ST-6 error+retry,
 * ST-10 нет read → виджет не рендерится (null), ST-8 graceful (host boundary).
 */

const typeIcon: Record<ActivityType, React.ReactNode> = {
    task: <PiListChecksDuotone className="h-4 w-4" />,
    call: <PiPhoneDuotone className="h-4 w-4" />,
    meeting: <PiUsersDuotone className="h-4 w-4" />,
    note: <PiNoteDuotone className="h-4 w-4" />,
}

const ActivityOverdueWidget = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canRead = can('activities', 'read')

    const {
        data: countData,
        error: countError,
        mutate: mutateCount,
    } = useSWR(
        canRead && pid ? ['/api/v1/activities/overdue-count', pid] : null,
        () => apiGetOverdueCount<{ count: number }>(pid!),
        { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 30000 },
    )

    const {
        data: listData,
        isLoading,
        error: listError,
        mutate: mutateList,
    } = useSWR(
        canRead && pid ? ['/api/v1/activities/overdue-widget', pid] : null,
        () =>
            apiGetActivities<{ list: Activity[]; total: number }, Record<string, unknown>>({
                projectId: pid!,
                overdueOnly: true,
                pageSize: 5,
            }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const list = useMemo(
        () =>
            normalizeList<unknown>(listData?.list)
                .map(normalizeActivity)
                .filter((a): a is Activity => Boolean(a))
                .filter((a) => isOverdue(a)),
        [listData],
    )
    const groups = useOverdueAssigneeGroups(list)

    const count =
        typeof countData?.count === 'number' ? countData.count : list.length
    const error = countError && listError

    if (!canRead) return null

    const retry = () => {
        mutateCount()
        mutateList()
    }

    return (
        <Card>
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-500 dark:bg-red-900/40 dark:text-red-300">
                        <PiWarningOctagonDuotone className="h-5 w-5" />
                    </span>
                    <div>
                        <h5 className="text-base font-semibold">Просроченные</h5>
                        <p className="text-xs text-gray-400" {...qa('activities.overdueWidget.lag')}>
                            Может обновляться с задержкой
                        </p>
                    </div>
                </div>
                {!error && (
                    <Tag
                        className={
                            count > 0
                                ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
                        }
                    >
                        {count}
                    </Tag>
                )}
            </div>

            {error ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Не удалось загрузить просроченные.
                    </p>
                    <Button
                        size="sm"
                        variant="default"
                        icon={<PiArrowClockwiseDuotone />}
                        onClick={retry}
                        {...qa('activities.overdueWidget.retry')}
                    >
                        Повторить
                    </Button>
                </div>
            ) : isLoading ? (
                <div className="flex flex-col gap-2">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700"
                        />
                    ))}
                </div>
            ) : list.length === 0 ? (
                <div
                    className="flex flex-col items-center gap-2 py-8 text-center"
                    {...qa('activities.overdueWidget.empty')}
                >
                    <PiCheckCircleDuotone className="h-8 w-8 text-emerald-500" />
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        Просроченных нет
                    </p>
                    <p className="max-w-xs text-xs text-gray-500 dark:text-gray-400">
                        Все активности в работе или завершены вовремя.
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {groups.map((group) => (
                        <div
                            key={group.assigneeId}
                            {...qa('activities.overdueWidget.assigneeGroup', {
                                assignee: group.assigneeId,
                            })}
                        >
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                {group.assigneeName}
                                <span className="ml-1 font-normal">({group.items.length})</span>
                            </p>
                            <div className="flex flex-col gap-2">
                                {group.items.map((a) => (
                                    <button
                                        key={a.id}
                                        type="button"
                                        className="flex w-full items-center gap-3 rounded-lg border border-red-100 bg-red-50/40 px-3 py-2 text-left transition-colors hover:bg-red-50 dark:border-red-900/40 dark:bg-red-900/10 dark:hover:bg-red-900/20"
                                        onClick={() => navigate(`/activities/${a.id}`)}
                                        {...qa('activities.overdueWidget.row', {
                                            activity: a.id,
                                        })}
                                    >
                                        <span className="text-red-500">{typeIcon[a.type]}</span>
                                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                            {a.title}
                                        </span>
                                        {a.dueDate && (
                                            <span className="shrink-0 text-xs font-medium text-red-500">
                                                {dayjs
                                                    .unix(
                                                        a.dueDate > 1e12
                                                            ? Math.floor(a.dueDate / 1000)
                                                            : a.dueDate,
                                                    )
                                                    .format('DD.MM')}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!error && (count > 0 || list.length > 0) && (
                <div className="mt-4">
                    <Button
                        block
                        size="sm"
                        variant="plain"
                        icon={<PiArrowRightDuotone />}
                        iconAlignment="end"
                        onClick={() => navigate('/activities?overdue=1')}
                        {...qa('activities.overdueWidget.allActivities')}
                    >
                        Все активности
                    </Button>
                </div>
            )}
        </Card>
    )
}

export default ActivityOverdueWidget
