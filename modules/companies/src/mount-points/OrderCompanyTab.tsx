import { useNavigate } from 'react-router'
import useSWR from 'swr'
import { PiBuildingsDuotone } from 'react-icons/pi'
import Card from '@/components/ui/Card'
import Spinner from '@/components/ui/Spinner'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { apiGetOrder } from '@/services/CrmService'
import type { Order } from '@/@types/crm'
import { qa, qaWithAlias } from '../qa'

export type OrderCompanyTabProps = {
    orderId?: string
}

/**
 * SCR-COMPANIES-ORDER-TAB — mount-point `order.card.tab` (FR-COMPANIES-450).
 */
const OrderCompanyTab = ({ orderId }: OrderCompanyTabProps) => {
    const navigate = useNavigate()
    const pid = useCurrentProjectId()
    const canRead = usePermission('companies', 'read')
    const { data: order, isLoading } = useSWR<Order | null>(
        orderId && pid && canRead ? [`/v1/orders/${orderId}`, pid, 'company-tab'] : null,
        () => apiGetOrder<Order>(orderId!),
        { revalidateOnFocus: false },
    )

    if (!canRead) {
        return (
            <Card className="w-full">
                <div
                    className="py-6 text-center text-sm text-gray-500"
                    {...qaWithAlias(
                        'companies.orderTab.noAccess',
                        'companies.mp.order.noAccess',
                    )}
                >
                    Нет доступа к компаниям
                </div>
            </Card>
        )
    }

    return (
        <Card
            className="w-full flex-1 flex flex-col min-h-0 border border-gray-200 dark:border-gray-700"
            {...qa('companies.orderTab.panel')}
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
                <div className="py-8 flex justify-center" {...qa('companies.orderTab.loading')}>
                    <Spinner />
                </div>
            ) : order?.companyId && order.companyName ? (
                <button
                    type="button"
                    className="text-sm font-medium text-primary hover:underline"
                    onClick={() => navigate(`/companies/${order.companyId}`)}
                    {...qaWithAlias(
                        'companies.orderTab.openCompany',
                        'companies.mp.order.link',
                        { company: order.companyId },
                    )}
                >
                    {order.companyName}
                </button>
            ) : (
                <div
                    className="py-6 text-center text-sm text-gray-500 dark:text-gray-400"
                    {...qaWithAlias('companies.orderTab.empty', 'companies.mp.order.empty')}
                >
                    Компания не указана
                </div>
            )}
        </Card>
    )
}

export default OrderCompanyTab
