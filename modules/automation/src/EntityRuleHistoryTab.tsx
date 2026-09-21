import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { PiLightningDuotone } from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import Spinner from '@/components/ui/Spinner'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import {
    apiListProjectExecutions,
    EXECUTION_STATUS_COLOR,
    EXECUTION_STATUS_LABEL,
    SKIP_REASON_LABEL,
    type RuleExecution,
} from '@/services/AutomationService'
import { qa } from './qa'

export type EntityRuleHistoryTabProps = {
    entityType?: 'deal' | 'contact' | 'company' | 'order'
    entityId?: string
    dealId?: string
    contactId?: string
    companyId?: string
    orderId?: string
}

const resolveRef = (
    p: EntityRuleHistoryTabProps,
): { entityType: string; entityId?: string } => {
    if (p.entityType && p.entityId) return { entityType: p.entityType, entityId: p.entityId }
    if (p.dealId) return { entityType: 'deal', entityId: p.dealId }
    if (p.contactId) return { entityType: 'contact', entityId: p.contactId }
    if (p.companyId) return { entityType: 'company', entityId: p.companyId }
    if (p.orderId) return { entityType: 'order', entityId: p.orderId }
    return { entityType: '', entityId: undefined }
}

/**
 * SCR-AUTOMATION-ENTITY-HISTORY — вкладка «История правил» на карточке сущности
 * (FR-AUTOM-420). Mount-point `*.card.tab`, требует `automation:read`.
 */
const EntityRuleHistoryTab = (props: EntityRuleHistoryTabProps) => {
    const navigate = useNavigate()
    const projectId = useCurrentProjectId()
    const canRead = usePermission()('automation', 'read')
    const { entityType, entityId } = useMemo(() => resolveRef(props), [props])

    const { data, isLoading, error } = useSWR(
        canRead && projectId && entityId
            ? ['/automation/entity-history', projectId, entityType, entityId]
            : null,
        () =>
            apiListProjectExecutions({
                projectId: projectId!,
                entityType,
                entityId: entityId!,
                pageSize: 30,
            }),
        { revalidateOnFocus: false },
    )

    if (!canRead) {
        return (
            <Card className="border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500">Нет права automation:read</p>
            </Card>
        )
    }

    const rows = data?.list ?? []

    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0 max-h-[60vh] border border-gray-200 dark:border-gray-700"
            bodyClass="flex-1 min-h-0 flex flex-col overflow-hidden p-0"
            {...qa('automation.entityHistory.tab')}
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiLightningDuotone className="w-5 h-5 text-gray-500" />
                        <h4 className="text-base font-semibold">История правил</h4>
                    </div>
                ),
                bordered: true,
            }}
        >
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Spinner />
                    </div>
                ) : error ? (
                    <p className="text-sm text-red-500">Не удалось загрузить историю правил</p>
                ) : rows.length === 0 ? (
                    <p className="text-sm text-gray-500" {...qa('automation.entityHistory.empty')}>
                        Правила по этой записи ещё не срабатывали
                    </p>
                ) : (
                    <ul className="space-y-3" {...qa('automation.entityHistory.list')}>
                        {rows.map((row: RuleExecution) => (
                            <li
                                key={row.executionId}
                                className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm"
                                {...qa('automation.entityHistory.row', { execution: row.executionId })}
                            >
                                <div className="flex flex-wrap items-center gap-2 justify-between">
                                    <button
                                        type="button"
                                        className="font-medium text-primary hover:underline"
                                        onClick={() => navigate(`/automation/${row.ruleId}`)}
                                        {...qa('automation.entityHistory.ruleLink', { rule: row.ruleId })}
                                    >
                                        Правило {row.ruleId.slice(0, 8)}…
                                    </button>
                                    <Tag
                                        className={
                                            EXECUTION_STATUS_COLOR[row.status] ??
                                            'bg-gray-100 text-gray-600'
                                        }
                                    >
                                        {EXECUTION_STATUS_LABEL[row.status] ?? row.status}
                                    </Tag>
                                </div>
                                <div className="mt-1 text-gray-500">
                                    {dayjs(row.createdAt).format('DD.MM.YYYY HH:mm')}
                                    {row.skipReason ? (
                                        <span className="ml-2">
                                            · {SKIP_REASON_LABEL[row.skipReason] ?? row.skipReason}
                                        </span>
                                    ) : null}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Card>
    )
}

export default EntityRuleHistoryTab
