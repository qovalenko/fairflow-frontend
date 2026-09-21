import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import useSWR from 'swr'
import { PiChartBarDuotone, PiWarningOctagonDuotone } from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import {
    apiListReports,
    apiRunReport,
    formatRub,
} from '@/services/ReportsService'
import { qa } from './qa'

type MiniReportWidgetProps = {
    dealId?: string
    companyId?: string
}

/**
 * FR-REPORTS-380 — мини-отчёт в карточке deal/company (`*.card.tab`).
 */
const MiniReportWidget = ({ dealId, companyId }: MiniReportWidgetProps) => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canRead = can('reports', 'read')

    const entityType = dealId ? 'deal' : companyId ? 'company' : ''
    const entityId = dealId ?? companyId ?? ''

    const { data: reports } = useSWR(
        canRead && pid ? ['/reports/mini/list', pid] : null,
        () => apiListReports({ projectId: pid!, pageSize: 50 }),
        { revalidateOnFocus: false },
    )

    const salesReport = useMemo(
        () => reports?.list.find((r) => r.presetKey === 'sales'),
        [reports],
    )

    const swrKey =
        canRead && pid && salesReport && entityType && entityId
            ? ['/reports/mini/run', pid, salesReport.id, entityType, entityId]
            : null

    const { data, error, isLoading, mutate } = useSWR(
        swrKey,
        () =>
            apiRunReport(
                salesReport!.id,
                {
                    params: {
                        period: 'month',
                        entityType,
                        entityId,
                    },
                },
                { projectId: pid! },
                'sales',
            ),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    if (!canRead || !entityType || !entityId) return null

    if (!salesReport) {
        return (
            <Card className="text-sm text-gray-500">
                Мини-отчёт недоступен: пресет sales не засеян.
            </Card>
        )
    }

    if (error) {
        return (
            <Card>
                <p className="text-sm text-gray-500">Не удалось загрузить мини-отчёт.</p>
                <Button size="xs" variant="plain" className="mt-2" onClick={() => mutate()}>
                    Повторить
                </Button>
            </Card>
        )
    }

    if (isLoading || !data) {
        return (
            <Card>
                <div className="h-16 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
            </Card>
        )
    }

    const mini = data.entityMini
    if (!mini?.found) {
        return (
            <Card className="text-sm text-gray-500">
                Запись недоступна в вашей видимости.
            </Card>
        )
    }

    return (
        <Card {...qa('reports.mini.root', { entity: entityType, id: entityId })}>
            <div className="mb-3 flex items-center gap-2">
                <PiChartBarDuotone className="h-5 w-5 text-blue-500" />
                <h5 className="font-semibold">Мини-отчёт</h5>
            </div>
            <p className="mb-2 truncate text-sm font-medium">{mini.name}</p>
            <div className="flex flex-wrap gap-2" {...qa('reports.mini.kpi')}>
                {mini.amount != null && <Tag>{formatRub(mini.amount)}</Tag>}
                {mini.activitiesOverdue != null && mini.activitiesOverdue > 0 && (
                    <Tag className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                        <PiWarningOctagonDuotone className="mr-1 inline" />
                        Просрочено: {mini.activitiesOverdue}
                    </Tag>
                )}
                {mini.dealsCount != null && <Tag>Сделок: {mini.dealsCount}</Tag>}
                {mini.dealsAmount != null && <Tag>{formatRub(mini.dealsAmount)}</Tag>}
            </div>
            <div className="mt-3">
                <Button
                    size="xs"
                    variant="plain"
                    onClick={() => navigate('/reports')}
                    {...qa('reports.mini.allReports')}
                >
                    Все отчёты
                </Button>
            </div>
        </Card>
    )
}

export default MiniReportWidget
