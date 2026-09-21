import { useState } from 'react'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR from 'swr'
import dayjs from 'dayjs'
import {
    PiArrowLeftDuotone,
    PiQueueDuotone,
    PiArrowsClockwiseDuotone,
    PiXBold,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import type { ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Tooltip from '@/components/ui/Tooltip'
import Skeleton from '@/components/ui/Skeleton'
import toast from '@/components/ui/toast'
import {
    apiListDlq,
    apiRetryDlq,
    apiDismissDlq,
    DLQ_STATUS_LABEL,
    DLQ_STATUS_COLOR,
    type DlqEntry,
    type DlqStatus,
} from '@/services/AutomationService'
import {
    NoPermissionState,
    NoProjectState,
    ErrorState,
    FreshnessLabel,
    errMessage,
} from './shared'
import { qa } from './qa'
import { QaSelectOption } from './selectQa'

const PAGE_SIZE = 25

const statusOptions = [
    { value: '', label: 'Все статусы' },
    { value: 'failed', label: 'Ошибка' },
    { value: 'exhausted', label: 'Исчерпано' },
    { value: 'retrying', label: 'Повтор' },
    { value: 'paused_module_disabled', label: 'Приостановлено (модуль)' },
    { value: 'paused_project_archived', label: 'Приостановлено (архив)' },
    { value: 'dismissed', label: 'Отклонено' },
]

/** SCR-AUTOMATION-DLQ — приостановленные действия (DLQ-manager). */
const Dlq = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canManage = can('automation', 'manage')

    const [status, setStatus] = useState('')
    const [pageIndex, setPageIndex] = useState(0)
    const [busyId, setBusyId] = useState<string | null>(null)

    const swrKey =
        pid && canManage
            ? ['/automation/dlq', pid, status, pageIndex]
            : null
    const { data, isLoading, error, mutate, isValidating } = useSWR(
        swrKey,
        () =>
            apiListDlq({
                projectId: pid!,
                status: (status || undefined) as never,
                pageIndex,
                pageSize: PAGE_SIZE,
            }),
        { revalidateOnFocus: false, keepPreviousData: true },
    )

    const rows = data?.list ?? []
    const total = data?.total ?? 0
    const counts = data?.counts ?? {}

    const pausedRows = rows.filter(
        (r) =>
            r.status === 'paused_module_disabled' ||
            r.status === 'paused_project_archived',
    )
    const hasPaused = pausedRows.length > 0

    const retry = async (entry: DlqEntry) => {
        if (!pid) return
        setBusyId(entry.id)
        try {
            await apiRetryDlq(entry.id, { projectId: pid })
            toast.push('Повтор поставлен в очередь')
            mutate()
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось повторить'))
        } finally {
            setBusyId(null)
        }
    }

    const dismiss = async (entry: DlqEntry) => {
        if (!pid) return
        setBusyId(entry.id)
        try {
            await apiDismissDlq(entry.id, { projectId: pid })
            toast.push('Действие отклонено')
            mutate()
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось отклонить'))
        } finally {
            setBusyId(null)
        }
    }

    if (!pid) {
        return (
            <Container>
                <NoProjectState />
            </Container>
        )
    }
    // ST-10/11: DLQ — только manage
    if (!canManage) {
        return (
            <Container>
                <NoPermissionState message="Раздел доступен только с правом automation:manage." />
            </Container>
        )
    }

    const columns: ColumnDef<DlqEntry>[] = [
        {
            header: 'Действие',
            cell: ({ row }) => (
                <div>
                    <span className="font-medium text-sm">
                        {row.original.actionType}
                    </span>
                    {row.original.ruleName && (
                        <span className="text-xs text-gray-400 block">
                            {row.original.ruleName}
                        </span>
                    )}
                </div>
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
            header: 'Ошибка',
            cell: ({ row }) => (
                <span className="text-xs text-red-500">
                    {row.original.lastError ?? '—'}
                    {row.original.lastHttpCode
                        ? ` (${row.original.lastHttpCode})`
                        : ''}
                </span>
            ),
        },
        {
            header: 'Попыток',
            cell: ({ row }) => row.original.attempts,
        },
        {
            header: 'Статус',
            cell: ({ row }) => (
                <div>
                    <Tag className={DLQ_STATUS_COLOR[row.original.status]}>
                        {DLQ_STATUS_LABEL[row.original.status]}
                    </Tag>
                    {row.original.status === 'retrying' &&
                        row.original.nextRetryAt && (
                            <span
                                className="text-xs text-gray-400 block mt-0.5"
                                {...qa('automation.dlq.nextRetryAt', { dlq: row.original.id })}
                            >
                                следующая попытка в{' '}
                                {dayjs(row.original.nextRetryAt).format('HH:mm')}
                            </span>
                        )}
                </div>
            ),
        },
        {
            header: '',
            id: 'actions',
            cell: ({ row }) => {
                if (row.original.status === 'dismissed') return null
                return (
                    <div className="flex items-center gap-1">
                        <Tooltip title="Повторить">
                            <button
                                type="button"
                                aria-label="Повторить"
                                title="Повторить"
                                disabled={busyId === row.original.id}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded disabled:opacity-50"
                                onClick={() => retry(row.original)}
                                {...qa('automation.dlq.retry', { dlq: row.original.id })}
                            >
                                <PiArrowsClockwiseDuotone className="w-4 h-4" />
                            </button>
                        </Tooltip>
                        <Tooltip title="Отклонить">
                            <button
                                type="button"
                                aria-label="Отклонить"
                                title="Отклонить"
                                disabled={busyId === row.original.id}
                                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-red-500 disabled:opacity-50"
                                onClick={() => dismiss(row.original)}
                                {...qa('automation.dlq.dismiss', { dlq: row.original.id })}
                            >
                                <PiXBold className="w-4 h-4" />
                            </button>
                        </Tooltip>
                    </div>
                )
            },
        },
    ]

    const renderBody = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} height={44} className="rounded" />
                    ))}
                </div>
            )
        }
        if (error) {
            return (
                <ErrorState
                    message={errMessage(error, 'Не удалось загрузить очередь')}
                    onRetry={() => mutate()}
                />
            )
        }
        if (rows.length === 0 && status) {
            return (
                <div className="text-center py-12" {...qa('automation.dlq.emptyFilter')}>
                    <p className="text-gray-500 mb-4">Нет записей по фильтру.</p>
                    <Button variant="plain" onClick={() => setStatus('')} {...qa('automation.dlq.resetFilter')}>
                        Сбросить фильтр
                    </Button>
                </div>
            )
        }
        if (rows.length === 0) {
            return (
                <AdaptiveCard>
                    <div className="text-center py-12">
                        <PiQueueDuotone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500" {...qa('automation.dlq.empty')}>
                            Нет приостановленных действий.
                        </p>
                    </div>
                </AdaptiveCard>
            )
        }
        return (
            <>
                {/* EL-DLQ-7: раздел «Приостановлено при выключении» */}
                {hasPaused && (
                    <div
                        className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-3"
                        {...qa('automation.dlq.pausedBanner')}
                    >
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                            Часть действий приостановлена при выключении модуля
                            или архивации проекта. После повторного включения они{' '}
                            <b>не возобновятся автоматически</b> — повторите
                            вручную.
                        </p>
                    </div>
                )}
                <div className="relative" {...qa('automation.dlq.table')}>
                    {isValidating && !isLoading && (
                        <div className="absolute right-2 -top-5 text-xs text-gray-400">
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
                        qaIdPrefix="automation.dlq"
                        rowQaKey="dlq"
                    />
                </div>
            </>
        )
    }

    return (
        <Container>
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            aria-label="Назад"
                            title="Назад"
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            onClick={() => navigate('/automation')}
                        >
                            <PiArrowLeftDuotone className="w-5 h-5" />
                        </button>
                        <h3 className="text-2xl font-bold" {...qa('automation.dlq.title')}>
                            Приостановленные действия
                        </h3>
                    </div>
                    <FreshnessLabel at={data?.generatedAt} />
                </div>

                {/* EL-DLQ-1: счётчики по статусам */}
                <div className="flex items-center gap-2 flex-wrap" {...qa('automation.dlq.countTags')}>
                    {(Object.keys(DLQ_STATUS_LABEL) as DlqStatus[])
                        .filter((s) => counts[s])
                        .map((s) => (
                            <Tag key={s} className={DLQ_STATUS_COLOR[s]} {...qa('automation.dlq.countTag', { status: s })}>
                                {DLQ_STATUS_LABEL[s]}: {counts[s]}
                            </Tag>
                        ))}
                </div>

                {/* EL-DLQ-2: фильтр */}
                <div className="w-56" {...qa('automation.dlq.statusFilter')}>
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
                        components={{ Option: QaSelectOption }}
                    />
                </div>

                {renderBody()}
            </div>
        </Container>
    )
}

export default Dlq
