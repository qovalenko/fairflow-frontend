import { useNavigate } from 'react-router'
import useSWR from 'swr'
import { PiBuildingsDuotone } from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { apiGetDeal } from '@/services/CrmService'
import type { Deal } from '@/@types/crm'
import { qa, qaWithAlias } from '../qa'

export type DealCompanySidebarProps = {
    dealId?: string
}

/**
 * SCR-COMPANIES-DEAL-SIDEBAR — mount-point `deal.card.sidebar` (FR-COMPANIES-450).
 */
const DealCompanySidebar = ({ dealId }: DealCompanySidebarProps) => {
    const navigate = useNavigate()
    const pid = useCurrentProjectId()
    const canRead = usePermission('companies', 'read')
    const { data: deal, isLoading } = useSWR<Deal | null>(
        dealId && pid && canRead ? [`/v1/deals/${dealId}`, pid, 'company-sidebar'] : null,
        () => apiGetDeal<Deal>(dealId!, pid ?? undefined),
        { revalidateOnFocus: false },
    )

    if (!canRead) return null

    return (
        <Card
            className="w-full border border-gray-200 dark:border-gray-700"
            {...qaWithAlias('companies.dealSidebar.panel', 'companies.mp.deal.sidebar')}
            header={{
                content: (
                    <div className="flex items-center gap-2">
                        <PiBuildingsDuotone className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <h4 className="text-base font-semibold">Компания</h4>
                    </div>
                ),
                bordered: true,
            }}
        >
            {isLoading ? (
                <div className="py-4 flex justify-center" {...qa('companies.dealSidebar.loading')}>
                    <Spinner />
                </div>
            ) : deal?.companyId && deal.companyName ? (
                <button
                    type="button"
                    className="text-sm font-medium text-primary hover:underline text-left"
                    onClick={() => navigate(`/companies/${deal.companyId}`)}
                    {...qaWithAlias(
                        'companies.dealSidebar.openCompany',
                        'companies.mp.deal.link',
                        { company: deal.companyId },
                    )}
                >
                    {deal.companyName}
                </button>
            ) : (
                <div
                    className="text-sm text-gray-500 dark:text-gray-400"
                    {...qaWithAlias('companies.dealSidebar.empty', 'companies.mp.deal.empty')}
                >
                    Компания не указана
                </div>
            )}
        </Card>
    )
}

export default DealCompanySidebar
