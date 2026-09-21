import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import {
    PiChartLineUpDuotone,
    PiTrophyDuotone,
    PiProhibitDuotone,
    PiClockCountdownDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Loading from '@/components/shared/Loading'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { apiGetDealDashboard, apiGetPipelines } from '@/services/CrmService'
import type { DealDashboard as DealDashboardData, Pipeline } from '@/@types/crm'
import { formatCurrency } from './dealUtils'
import { qa } from '../qa'
import { makeSelectOption } from '../selectQa'

const periodOptions = [
    { value: '7', label: 'Последние 7 дней' },
    { value: '30', label: 'Последние 30 дней' },
    { value: '90', label: 'Последние 90 дней' },
    { value: '365', label: 'Последний год' },
]

const KpiCell = ({
    label,
    value,
    icon,
    onClick,
    accent,
    ...rest
}: {
    label: string
    value: string
    icon: React.ReactNode
    onClick?: () => void
    accent?: string
} & Record<string, unknown>) => (
    <button
        type="button"
        disabled={!onClick}
        onClick={onClick}
        className={`text-left rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 transition-colors ${
            onClick ? 'hover:border-blue-300 dark:hover:border-blue-700 cursor-pointer' : 'cursor-default'
        }`}
        {...rest}
    >
        <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
            <span className={accent || 'text-gray-400'}>{icon}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
    </button>
)

/**
 * SCR-DEALS-DASHBOARD — manager summary over the pipeline (FR-MDEAL-40).
 * Real aggregates from `GET /api/deals/dashboard` (pipe contract §5). KPI cells
 * drill down into LIST/KANBAN with a filter applied.
 */
const DealDashboard = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canRead = can('deals', 'read')

    const [period, setPeriod] = useState('30')
    const [pipelineId, setPipelineId] = useState<string>('')

    const range = useMemo(() => {
        const to = dayjs().valueOf()
        const from = dayjs().subtract(Number(period), 'day').valueOf()
        return { from, to }
    }, [period])

    const { data: pipelinesData } = useSWR(
        canRead ? ['/api/v1/pipelines'] : null,
        () => apiGetPipelines<Pipeline[]>(),
        { revalidateOnFocus: false },
    )

    const { data, isLoading, error, mutate } = useSWR(
        canRead && pid ? ['/api/v1/deals/dashboard', pid, range.from, range.to, pipelineId] : null,
        () =>
            apiGetDealDashboard<DealDashboardData>({
                projectId: pid,
                from: range.from,
                to: range.to,
                pipelineId: pipelineId || undefined,
            }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const pipelineOptions = useMemo(
        () => [{ value: '', label: 'Все воронки' }, ...(pipelinesData ?? []).map((p) => ({ value: p.id, label: p.name }))],
        [pipelinesData],
    )

    // ST-10: route-level no-permission graceful stub.
    if (!canRead) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-10 text-gray-500" {...qa('deals.dashboard.noPermission')}>
                        Недостаточно прав для просмотра дашборда сделок.
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    const byStage = data?.dealsByStage ?? []
    const wonStat = data?.statistics?.find((s) => s.key === 'won')
    const lostStat = data?.statistics?.find((s) => s.key === 'lost')
    const openTotal = byStage.reduce((sum, s) => sum + (s.count || 0), 0)
    const openAmount = byStage.reduce((sum, s) => sum + (s.amount || 0), 0)
    const maxStageCount = Math.max(1, ...byStage.map((s) => s.count || 0))

    return (
        <Container>
            <div className="flex flex-col gap-4" {...qa('deals.dashboard.root')}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <PiChartLineUpDuotone className="w-6 h-6 text-blue-500" />
                        <h3 className="text-2xl font-bold">Дашборд сделок</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-48">
                            <Select
                                options={pipelineOptions}
                                value={pipelineOptions.find((o) => o.value === pipelineId) || pipelineOptions[0]}
                                onChange={(opt) => setPipelineId(opt?.value || '')}
                                components={{ Option: makeSelectOption('deals.dashboard.filter.pipeline') }}
                                {...qa('deals.dashboard.filter.pipeline')}
                            />
                        </div>
                        <div className="w-48">
                            <Select
                                options={periodOptions}
                                value={periodOptions.find((o) => o.value === period) || periodOptions[1]}
                                onChange={(opt) => setPeriod(opt?.value || '30')}
                                components={{ Option: makeSelectOption('deals.dashboard.filter.period') }}
                                {...qa('deals.dashboard.filter.period')}
                            />
                        </div>
                    </div>
                </div>

                {isLoading && <Loading loading={true} />}

                {!isLoading && error && (
                    <AdaptiveCard>
                        <div className="text-center py-10" {...qa('deals.dashboard.error')}>
                            <p className="text-gray-500 mb-3">Не удалось загрузить дашборд</p>
                            <Button
                                variant="solid"
                                color="primary"
                                onClick={() => mutate()}
                                {...qa('deals.dashboard.errorRetry')}
                            >
                                Повторить
                            </Button>
                        </div>
                    </AdaptiveCard>
                )}

                {!isLoading && !error && data && (
                    <>
                        {/* ST-3: empty pipeline. */}
                        {openTotal === 0 && !wonStat?.value && !lostStat?.value ? (
                            <AdaptiveCard>
                                <div className="text-center py-10" {...qa('deals.dashboard.empty')}>
                                    <p className="text-gray-500 mb-3">За выбранный период данных нет.</p>
                                    <Button variant="solid" color="primary" onClick={() => navigate('/deals')}>
                                        Перейти к сделкам
                                    </Button>
                                </div>
                            </AdaptiveCard>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                    <KpiCell
                                        label="Открытые сделки"
                                        value={String(openTotal)}
                                        icon={<PiChartLineUpDuotone className="w-5 h-5" />}
                                        accent="text-blue-500"
                                        onClick={() => navigate('/deals')}
                                        {...qa('deals.dashboard.kpiOpen')}
                                    />
                                    <KpiCell
                                        label="Сумма открытых"
                                        value={formatCurrency(openAmount)}
                                        icon={<PiChartLineUpDuotone className="w-5 h-5" />}
                                        accent="text-indigo-500"
                                    />
                                    <KpiCell
                                        label="Выиграно за период"
                                        value={String(wonStat?.value ?? 0)}
                                        icon={<PiTrophyDuotone className="w-5 h-5" />}
                                        accent="text-emerald-500"
                                    />
                                    <KpiCell
                                        label="Проиграно за период"
                                        value={String(lostStat?.value ?? 0)}
                                        icon={<PiProhibitDuotone className="w-5 h-5" />}
                                        accent="text-red-500"
                                    />
                                </div>

                                {(data.avgCycleDays != null || data.stalledCount != null || data.forecastAmount != null) && (
                                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                                        {data.avgCycleDays != null && (
                                            <KpiCell
                                                label="Средний цикл"
                                                value={`${Math.round(data.avgCycleDays)} дн.`}
                                                icon={<PiClockCountdownDuotone className="w-5 h-5" />}
                                            />
                                        )}
                                        {data.stalledCount != null && (
                                            <KpiCell
                                                label="Зависшие"
                                                value={String(data.stalledCount)}
                                                icon={<PiClockCountdownDuotone className="w-5 h-5" />}
                                                accent="text-amber-500"
                                                onClick={() => navigate('/deals')}
                                                {...qa('deals.dashboard.kpiStalled')}
                                            />
                                        )}
                                        {data.forecastAmount != null && (
                                            <KpiCell
                                                label="Прогноз"
                                                value={formatCurrency(data.forecastAmount)}
                                                icon={<PiChartLineUpDuotone className="w-5 h-5" />}
                                                {...qa('deals.dashboard.kpiForecast')}
                                            />
                                        )}
                                    </div>
                                )}

                                {/* EL-DEALS-DASH-1: open deals by stage. */}
                                <AdaptiveCard>
                                    <h5 className="mb-4">Открытые сделки по стадиям</h5>
                                    {byStage.length === 0 ? (
                                        <div className="text-sm text-gray-500 py-4">Нет открытых сделок.</div>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            {byStage.map((s) => (
                                                <button
                                                    key={s.stageId || s.stageName}
                                                    type="button"
                                                    onClick={() =>
                                                        navigate(`/deals${s.stageId ? `?stageId=${s.stageId}` : ''}`)
                                                    }
                                                    className="text-left"
                                                    {...qa('deals.dashboard.stageRow', { stage: s.stageId || s.stageName })}
                                                >
                                                    <div className="flex items-center justify-between text-sm mb-1">
                                                        <span className="font-medium">{s.stageName}</span>
                                                        <span className="text-gray-500">
                                                            {s.count} · {formatCurrency(s.amount)}
                                                        </span>
                                                    </div>
                                                    <div className="h-2 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                                        <div
                                                            className="h-full rounded bg-blue-500"
                                                            style={{ width: `${Math.round((s.count / maxStageCount) * 100)}%` }}
                                                        />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </AdaptiveCard>

                                {data.byDepartment && data.byDepartment.length > 0 && (
                                    <AdaptiveCard {...qa('deals.dashboard.byDepartment')}>
                                        <h5 className="mb-4">Срез по отделам</h5>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                                        <th className="py-2 pr-4">Отдел</th>
                                                        <th className="py-2 pr-4">Сделок</th>
                                                        <th className="py-2">Сумма</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {data.byDepartment.map((d, i) => (
                                                        <tr
                                                            key={d.departmentId || `dept-${i}`}
                                                            className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                                                        >
                                                            <td className="py-2 pr-4 font-medium">
                                                                {d.departmentId || '—'}
                                                            </td>
                                                            <td className="py-2 pr-4">{d.count}</td>
                                                            <td className="py-2">{formatCurrency(d.amount)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </AdaptiveCard>
                                )}

                                {/* EL-DEALS-DASH-6: cut by manager. */}
                                {data.topManagers && data.topManagers.length > 0 && (
                                    <AdaptiveCard>
                                        <h5 className="mb-4">Срез по менеджерам</h5>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-700">
                                                        <th className="py-2 pr-4">Менеджер</th>
                                                        <th className="py-2 pr-4">Сделок</th>
                                                        <th className="py-2 pr-4">Сумма</th>
                                                        <th className="py-2">Конверсия</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {data.topManagers.map((m, i) => (
                                                        <tr
                                                            key={m.assigneeId || `${m.name}-${i}`}
                                                            className="border-b border-gray-100 dark:border-gray-800 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                                                            onClick={() =>
                                                                m.assigneeId && navigate(`/deals?assigneeId=${m.assigneeId}`)
                                                            }
                                                            {...qa('deals.dashboard.managerRow', {
                                                                assignee: m.assigneeId || `${m.name}-${i}`,
                                                            })}
                                                        >
                                                            <td className="py-2 pr-4 font-medium">{m.name}</td>
                                                            <td className="py-2 pr-4">{m.deals}</td>
                                                            <td className="py-2 pr-4">{formatCurrency(m.amount)}</td>
                                                            <td className="py-2">
                                                                {m.conversion != null ? `${Math.round(m.conversion * 100)}%` : '—'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </AdaptiveCard>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </Container>
    )
}

export default DealDashboard
