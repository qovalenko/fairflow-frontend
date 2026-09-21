import { useMemo } from 'react'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { PiCalendarCheckDuotone } from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import { apiGetActivities } from '@/services/CrmService'
import type { Activity } from '@/@types/crm'
import { normalizeList, normalizeActivity, isTerminal } from './activityShared'
import usePermission from '@/utils/hooks/usePermission'
import { qa } from '../qa'

export type ActivityNextStepSidebarProps = {
    contactId?: string
    companyId?: string
    dealId?: string
    orderId?: string
}

const resolveRef = (p: ActivityNextStepSidebarProps) => {
    if (p.contactId) return { entityType: 'contact' as const, entityId: p.contactId }
    if (p.companyId) return { entityType: 'company' as const, entityId: p.companyId }
    if (p.dealId) return { entityType: 'deal' as const, entityId: p.dealId }
    if (p.orderId) return { entityType: 'order' as const, entityId: p.orderId }
    return { entityType: undefined, entityId: undefined }
}

const nextOpen = (items: Activity[]) => {
    const open = items.filter((a) => !isTerminal(a.status))
    open.sort((a, b) => {
        const ad = a.dueAt ? dayjs(a.dueAt).valueOf() : Number.MAX_SAFE_INTEGER
        const bd = b.dueAt ? dayjs(b.dueAt).valueOf() : Number.MAX_SAFE_INTEGER
        return ad - bd
    })
    return open[0] ?? null
}

/** Compact «следующий шаг» widget for `*.card.sidebar` slots. */
export default function ActivityNextStepSidebar(props: ActivityNextStepSidebarProps) {
    const pid = useCurrentProjectId()
    const canRead = usePermission()('activities', 'read')
    const { entityType, entityId } = resolveRef(props)

    const swrKey =
        canRead && pid && entityType && entityId
            ? ['activities-next-step', pid, entityType, entityId]
            : null

    const { data, isLoading } = useSWR(swrKey, async () => {
        const res = await apiGetActivities<{ list: Activity[] }, Record<string, unknown>>({
            projectId: pid!,
            linkEntityType: entityType,
            linkEntityId: entityId,
            pageSize: 50,
        })
        return normalizeList<unknown>(res?.list)
            .map(normalizeActivity)
            .filter((a): a is Activity => Boolean(a))
    })

    const step = useMemo(() => nextOpen(data ?? []), [data])

    if (!entityType || !entityId) return null
    if (!canRead) return null

    return (
        <Card
            {...qa('activities.nextStepSidebar.root')}
            className="border border-gray-200 dark:border-gray-700"
            {...qa('activities.nextStepSidebar.root')}
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiCalendarCheckDuotone className="w-5 h-5 text-gray-500" />
                        <h4 className="text-base font-semibold">Следующий шаг</h4>
                    </div>
                ),
                bordered: true,
            }}
        >
            {isLoading ? (
                <div className="flex justify-center py-4">
                    <Spinner size={24} />
                </div>
            ) : step ? (
                <div
                    className="text-sm"
                    {...qa('activities.nextStepSidebar.step', { activity: step.id })}
                >
                    <div className="font-medium">{step.title || step.type}</div>
                    {step.dueAt ? (
                        <div className="text-gray-500 mt-1">
                            {dayjs(step.dueAt).format('D MMM YYYY, HH:mm')}
                        </div>
                    ) : null}
                </div>
            ) : (
                <p className="text-sm text-gray-500" {...qa('activities.nextStepSidebar.empty')}>
                    Нет запланированных активностей
                </p>
            )}
        </Card>
    )
}
