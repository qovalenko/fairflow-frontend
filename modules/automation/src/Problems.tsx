import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import useSWR from 'swr'
import dayjs from 'dayjs'
import {
    PiArrowLeftDuotone,
    PiArrowsClockwiseDuotone,
    PiCheckCircleDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable from '@/components/shared/DataTable'
import type { ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Skeleton from '@/components/ui/Skeleton'
import toast from '@/components/ui/toast'
import {
    apiListProjectExecutions,
    apiRetryDlq,
    EXECUTION_STATUS_LABEL,
    EXECUTION_STATUS_COLOR,
    type RuleExecution,
} from '@/services/AutomationService'
import {
    NoPermissionState,
    NoProjectState,
    ErrorState,
    FreshnessLabel,
    errMessage,
} from './shared'
import { qa } from './qa'

const PAGE_SIZE = 25

const periodOptions = [
    { value: '7', label: 'Неделя' },
    { value: '30', label: 'Месяц' },
    { value: '90', label: 'Квартал' },
]

const statusOptions = [
    { value: 'fail,dlq', label: 'Проблемы (fail + DLQ)' },
    { value: 'fail', label: 'Только ошибки' },
    { value: 'dlq', label: 'Только DLQ' },
]

/** SCR-AUTOMATION-PROBLEMS — сквозной журнал/дашборд fail+dlq по проекту. */
const Problems = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canRead = can('automation', 'read')
    const canManage = can('automation', 'manage')

    const [period, setPeriod] = useState('30')
    const [status, setStatus] = useState('fail,dlq')
    const [pageIndex, setPageIndex] = useState(0)
    const [busyId, setBusyId] = useState<string | null>(null)

    const from = useMemo(
        () => dayjs().subtract(Number(period), 'day').valueOf(),
        [period],
    )

    const swrKey =
        pid && canRead
            ? ['/automation/problems', pid, period, status, pageIndex]
            : null
    const { data, isLoading, error, mutate, isValidating } = useSWR(
        swrKey,
        () =>
            apiListProjectExecutions({
                projectId: pid!,
                status,
                from,
                pageIndex,
                pageSize: PAGE_SIZE,
            }),
        { revalidateOnFocus: false, keepPreviousData: true },
    )

    const rows = data?.list ?? []
    const total = data?.total ?? 0

    const kpiFail = rows.filter((r) => r.status === 'fail').length
    const kpiDlq = rows.filter((r) => r.status === 'dlq').length

    const retry = async (exec: RuleExecution) => {
        if (!pid) return
        const dlqId = exec.actionResults.find((r) => r.dlqId)?.dlqId
        if (!dlqId) return
        setBusyId(exec.executionId)
        try {
            await apiRetryDlq(dlqId, { projectId: pid })
            toast.push('Повтор поставлен в очередь')
            mutate()
        } catch (e) {
            toast.push(errMessage(e, 'Не удалось повторить'))
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
    if (!canRead) {
        return (
            <Container>
                <NoPermissionState message="Нет права automation:read." />
            </Container>
        )
    }

    const columns: ColumnDef<RuleExecution>[] = [
        {
            header: 'Время',
            cell: ({ row }) =>
                dayjs(row.original.createdAt).format('DD.MM HH:mm'),
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
            header: 'Правило',
            cell: ({ row }) => (
                <span
                    className="text-sm text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                    onClick={() =>
                        navigate(`/automation/${row.original.ruleId}/edit`)
                    }
                    {...qa('automation.problems.ruleLink', { rule: row.original.ruleId })}
                >
                    {row.original.ruleId}
                </span>
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
            cell: ({ row }) => {
                const err = row.original.actionResults.find((r) => r.error)?.error
                return (
                    <span className="text-xs text-red-500">{err ?? '—'}</span>
                )
            },
        },
        {
            header: '',
            id: 'retry',
            cell: ({ row }) => {
                const dlqId = row.original.actionResults.find((r) => r.dlqId)?.dlqId
                // EL-PRB-5: «Повторить» только для dlq, требует manage
                if (!dlqId || !canManage) return null
                return (
                    <Button
                        size="xs"
                        variant="plain"
                        icon={<PiArrowsClockwiseDuotone />}
                        loading={busyId === row.original.executionId}
                        onClick={() => retry(row.original)}
                        {...qa('automation.problems.retry', { execution: row.original.executionId })}
                    >
                        Повторить
                    </Button>
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
                    message={errMessage(error, 'Не удалось загрузить проблемы')}
                    onRetry={() => mutate()}
                />
            )
        }
        if (rows.length === 0) {
            const filtered = status !== 'fail,dlq'
            if (filtered) {
                return (
                    <AdaptiveCard>
                        <div className="text-center py-12" {...qa('automation.problems.emptyFilter')}>
                            <p className="text-gray-500 mb-4">Нет записей по фильтру.</p>
                            <Button
                                variant="plain"
                                onClick={() => {
                                    setStatus('fail,dlq')
                                    setPageIndex(0)
                                }}
                                {...qa('automation.problems.resetFilter')}
                            >
                                Сбросить фильтр
                            </Button>
                        </div>
                    </AdaptiveCard>
                )
            }
            return (
                <AdaptiveCard>
                    <div className="text-center py-12">
                        <PiCheckCircleDuotone className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
                        <p className="text-gray-500" {...qa('automation.problems.empty')}>
                            Проблем за выбранный период нет.
                        </p>
                    </div>
                </AdaptiveCard>
            )
        }
        return (
            <div className="relative" {...qa('automation.problems.table')}>
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
                    qaIdPrefix="automation.problems"
                    rowQaKey="execution"
                />
            </div>
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
                        <h3 className="text-2xl font-bold" {...qa('automation.problems.title')}>
                            Проблемы автоматизации
                        </h3>
                    </div>
                    <div className="flex items-center gap-3">
                        <FreshnessLabel at={data?.generatedAt} />
                        <div className="w-36" {...qa('automation.problems.period')}>
                            <Select
                                options={periodOptions}
                                value={periodOptions.find(
                                    (o) => o.value === period,
                                )}
                                onChange={(opt) => {
                                    setPeriod(opt?.value || '30')
                                    setPageIndex(0)
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* EL-PRB-1: KPI-плитки */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <AdaptiveCard>
                        <p className="text-xs text-gray-500">Ошибок (fail)</p>
                        <p className="text-2xl font-bold text-red-500">
                            {kpiFail}
                        </p>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <p className="text-xs text-gray-500">В DLQ</p>
                        <p className="text-2xl font-bold text-amber-500">
                            {kpiDlq}
                        </p>
                    </AdaptiveCard>
                    <AdaptiveCard>
                        <p className="text-xs text-gray-500">Всего записей</p>
                        <p className="text-2xl font-bold">{total}</p>
                    </AdaptiveCard>
                </div>

                {/* EL-PRB-3: фильтр статуса */}
                <div className="w-64" {...qa('automation.problems.statusFilter')}>
                    <Select
                        options={statusOptions}
                        value={statusOptions.find((o) => o.value === status)}
                        onChange={(opt) => {
                            setStatus(opt?.value || 'fail,dlq')
                            setPageIndex(0)
                        }}
                    />
                </div>

                {renderBody()}
            </div>
        </Container>
    )
}

export default Problems
