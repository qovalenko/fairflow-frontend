import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import useSWR from 'swr'
import { PiHandshakeDuotone } from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Skeleton from '@/components/ui/Skeleton'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { apiGetDeals } from '@/services/CrmService'
import type { Deal } from '@/@types/crm'

export type DealsCardTabProps = {
    contactId?: string
    companyId?: string
}

/**
 * SCR-DEALS-CARD-TAB — mount-point «Сделки» на карточке контакта/компании
 * (FR-MDEAL-46 / FR-DEALS-460).
 */
const DealsCardTab = ({ contactId, companyId }: DealsCardTabProps) => {
    const navigate = useNavigate()
    const pid = useCurrentProjectId()
    const canRead = usePermission('deals', 'read')

    const filterKey = contactId ? 'contact' : companyId ? 'company' : null
    const entityId = contactId ?? companyId

    const { data, isLoading } = useSWR(
        pid && entityId && canRead ? ['/api/v1/deals', filterKey, entityId, pid] : null,
        () =>
            apiGetDeals<{ list: Deal[]; total: number }, Record<string, unknown>>({
                projectId: pid!,
                ...(contactId ? { contactId } : {}),
                ...(companyId ? { companyId } : {}),
                pageSize: 100,
            }),
        { revalidateOnFocus: false },
    )

    const deals = useMemo(() => (Array.isArray(data?.list) ? data.list : []), [data])

    if (!canRead) {
        return (
            <div className="py-6 text-center text-sm text-gray-500">Нет прав на сделки</div>
        )
    }

    return (
        <Card
            className="w-full flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
            bodyClass="flex-1 min-h-0 flex flex-col"
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiHandshakeDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">Сделки</h4>
                    </div>
                ),
                bordered: true,
            }}
        >
            {isLoading ? (
                <div className="flex flex-col gap-3 py-2">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} height={40} className="rounded-lg" />
                    ))}
                </div>
            ) : deals.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    Нет сделок
                </div>
            ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-600">
                    {deals.map((deal) => (
                        <div
                            key={deal.id}
                            className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 -mx-4 px-4 rounded-lg transition-colors"
                            onClick={() => navigate(`/deals/${deal.id}`)}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                    {deal.name}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {deal.stageName}
                                </div>
                            </div>
                            <div className="font-bold text-gray-900 dark:text-gray-100">
                                {new Intl.NumberFormat('ru-RU', {
                                    style: 'currency',
                                    currency: deal.currency || 'RUB',
                                    maximumFractionDigits: 0,
                                }).format(deal.amount)}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    )
}

export default DealsCardTab
