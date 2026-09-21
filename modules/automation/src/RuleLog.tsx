import { useState } from 'react'
import { useNavigate } from 'react-router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { PiArrowsClockwiseDuotone } from 'react-icons/pi'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import type { ColumnDef } from '@/components/shared/DataTable'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Button from '@/components/ui/Button'
import Skeleton from '@/components/ui/Skeleton'
import toast from '@/components/ui/toast'
import {
    apiListExecutions,
    apiRetryDlq,
    dispatchErrorSummary,
    EXECUTION_STATUS_LABEL,
    EXECUTION_STATUS_COLOR,
    SKIP_REASON_LABEL,
    type RuleExecution,
} from '@/services/AutomationService'
import { ErrorState, FreshnessLabel, errMessage } from './shared'
import { qa } from './qa'

const PAGE_SIZE = 20

const statusOptions = [
    { value: '', label: 'Все статусы' },
    { value: 'success', label: 'Успешно' },
    { value: 'skipped', label: 'Пропущено (вкл. идемпотентность)' },
    { value: 'fail', label: 'Ошибка dispatch' },
    { value: 'partial_fail', label: 'Частичная ошибка' },
    { value: 'throttled', label: 'Ограничено' },
    { value: 'suppressed_loop', label: 'Подавлен цикл' },
]

/**
 * SCR-AUTOMATION-RULE-LOG — журнал выполнений правила (встроен в форму, edit).
 * FR-MAUT-18: status / skip_reason / action_results / entity.
 */
const RuleLog = ({
    ruleId,
    projectId,
    canManage,
}: {
    ruleId: string
    projectId: string
    canManage: boolean
}) => {
    const navigate = useNavigate()
    const [status, setStatus] = useState('')
    const [pageIndex, setPageIndex] = useState(0)
    const [retryingId, setRetryingId] = useState<string | null>(null)

    const swrKey = ['/automation/executions', projectId, ruleId, status, pageIndex]
    const { data, isLoading, error, mutate, isValidating } = useSWR(
        swrKey,
        () =>
            apiListExecutions(ruleId, {
                projectId,
                status: (status || undefined) as never,
                pageIndex,
                pageSize: PAGE_SIZE,
            }),
        { revalidateOnFocus: false, keepPreviousData: true },
    )

    const rows = data?.list ?? []
    const total = data?.total ?? 0

    const handleRetry = async (exec: RuleExecution) => {
        const dlqId = exec.actionResults.find((r) => r.dlqId)?.dlqId
        if (!dlqId) return
        setRetryingId(exec.executionId)
        try {
            await apiRetryDlq(dlqId, { projectId })
            toast.push('Повтор поставлен в очередь')
            mutate()
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось повторить'))
        } finally {
            setRetryingId(null)
        }
    }

    const columns: ColumnDef<RuleExecution>[] = [
        {
            header: 'Время',
            cell: ({ row }) =>
                dayjs(row.original.createdAt).format('DD.MM.YYYY HH:mm'),
        },
        {
            header: 'Статус',
            cell: ({ row }) => (
                <Tag
                    className={
                        EXECUTION_STATUS_COLOR[row.original.status] ??
                        'bg-gray-100 text-gray-600'
                    }
                >
                    {EXECUTION_STATUS_LABEL[row.original.status] ??
                        row.original.status}
                </Tag>
            ),
        },
        {
            header: 'Причина',
            cell: ({ row }) =>
                row.original.skipReason ? (
                    <span
                        className="text-sm text-gray-500"
                        {...qa('automation.log.skipReason', {
                            execution: row.original.executionId,
                            skip: row.original.skipReason,
                        })}
                    >
                        {SKIP_REASON_LABEL[row.original.skipReason] ??
                            row.original.skipReason}
                    </span>
                ) : (
                    <span className="text-gray-300">—</span>
                ),
        },
        {
            header: 'Запись',
            cell: ({ row }) =>
                row.original.entityId ? (
                    <span className="text-sm">
                        {row.original.entityType}:{row.original.entityId}
                    </span>
                ) : (
                    <span className="text-gray-300">—</span>
                ),
        },
        {
            header: 'Действия',
            cell: ({ row }) => {
                const res = row.original.actionResults
                if (res.length === 0)
                    return <span className="text-gray-300">—</span>
                // C4-automation-be: при реальном dispatch в домен действие может
                // упасть — выносим сводку ошибки явно (DoD: ошибка отражена в логе).
                const dispatchError = dispatchErrorSummary(res)
                return (
                    <div className="text-xs space-y-0.5" {...qa('automation.log.actionResults', { execution: row.original.executionId })}>
                        {res.map((r) => (
                            <div key={r.index}>
                                {r.type}
                                {r.assignee ? ` → ${r.assignee}` : ''}{' '}
                                <span
                                    className={
                                        r.status === 'fail' ||
                                        r.status === 'error'
                                            ? 'text-red-500'
                                            : 'text-gray-400'
                                    }
                                >
                                    ({r.status})
                                </span>
                            </div>
                        ))}
                        {dispatchError && (
                            <div className="text-red-500 mt-0.5 break-words">
                                {dispatchError}
                            </div>
                        )}
                    </div>
                )
            },
        },
        {
            header: '',
            id: 'canvas',
            cell: ({ row }) => {
                const path = row.original.graphPath
                if (!path?.length) return null
                return (
                    <Button
                        size="xs"
                        variant="plain"
                        onClick={() =>
                            navigate(
                                `/automation/v2/${ruleId}?highlightPath=${encodeURIComponent(
                                    path.join(','),
                                )}`,
                            )
                        }
                        {...qa('automation.log.openCanvas', { execution: row.original.executionId })}
                    >
                        На канве
                    </Button>
                )
            },
        },
        {
            header: '',
            id: 'retry',
            cell: ({ row }) => {
                const dlqId = row.original.actionResults.find((r) => r.dlqId)?.dlqId
                // EL-LOG-4: «Повторить» только для fail/dlq строк, требует manage
                if (!dlqId || !canManage) return null
                return (
                    <Button
                        size="xs"
                        variant="plain"
                        icon={<PiArrowsClockwiseDuotone />}
                        loading={retryingId === row.original.executionId}
                        onClick={() => handleRetry(row.original)}
                        {...qa('automation.log.retry', { execution: row.original.executionId })}
                    >
                        Повторить
                    </Button>
                )
            },
        },
    ]

    return (
        <AdaptiveCard {...qa('automation.log.section')}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h5>Журнал выполнений</h5>
                <div className="flex items-center gap-3">
                    <FreshnessLabel at={data?.generatedAt} />
                    <div className="w-44" {...qa('automation.log.statusFilter')}>
                        <Select
                            options={statusOptions}
                            value={
                                statusOptions.find((o) => o.value === status) ||
                                statusOptions[0]
                            }
                            onChange={(opt) => {
                                setStatus(opt?.value || '')
                                setPageIndex(0)
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ST-1 */}
            {isLoading ? (
                <div className="flex flex-col gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} height={36} className="rounded" />
                    ))}
                </div>
            ) : error ? (
                // ST-6
                <ErrorState
                    message={errMessage(error, 'Не удалось загрузить журнал')}
                    onRetry={() => mutate()}
                />
            ) : rows.length === 0 && status ? (
                // ST-4
                <p className="text-center text-gray-500 py-8" {...qa('automation.log.emptyFilter')}>
                    Нет записей по фильтру.
                </p>
            ) : rows.length === 0 ? (
                // ST-3
                <p className="text-center text-gray-500 py-8" {...qa('automation.log.empty')}>
                    Правило ещё не выполнялось.
                </p>
            ) : (
                <div className="relative" {...qa('automation.log.table')}>
                    {isValidating && !isLoading && (
                        <div className="absolute right-2 top-0 text-xs text-gray-400">
                            Обновление…
                        </div>
                    )}
                    <DataTable
                        columns={columns}
                        data={rows}
                        pagingData={{
                            total,
                            pageIndex: pageIndex + 1,
                            pageSize: PAGE_SIZE,
                        }}
                        onPaginationChange={(p: number) => setPageIndex(p - 1)}
                        qaIdPrefix="automation.log"
                        rowQaKey="execution"
                    />
                </div>
            )}
        </AdaptiveCard>
    )
}

export default RuleLog
