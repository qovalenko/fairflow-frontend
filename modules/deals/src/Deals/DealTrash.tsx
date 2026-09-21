import { useState } from 'react'
import { useNavigate } from 'react-router'
import useSWR from 'swr'
import dayjs from 'dayjs'
import { PiTrashDuotone, PiArrowCounterClockwiseDuotone, PiArrowLeftDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Loading from '@/components/shared/Loading'
import useCurrentProjectId from '@/utils/hooks/useCurrentProjectId'
import usePermission from '@/utils/hooks/usePermission'
import { apiGetTrashedDeals, apiRestoreDeal } from '@/services/CrmService'
import type { Deal } from '@/@types/crm'
import { formatCurrency, extractError, notifyError, notifySuccess } from './dealUtils'
import { qa } from '../qa'

/**
 * SCR-DEALS-LIST (ST-23) корзина — lists soft-deleted deals and restores them
 * (pipe contract §15/§16, FR-MDEAL-51). Restore is gated by `deals:delete`.
 */
const DealTrash = () => {
    const pid = useCurrentProjectId()
    const navigate = useNavigate()
    const can = usePermission()
    const canDelete = can('deals', 'delete')

    const [restoringId, setRestoringId] = useState<string | null>(null)

    const { data, isLoading, error, mutate } = useSWR(
        canDelete && pid ? ['/api/v1/deals?deleted=true', pid] : null,
        () => apiGetTrashedDeals<{ list: Deal[]; total: number }>({ projectId: pid!, pageSize: 200 }),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const deals = data?.list ?? []

    const handleRestore = async (deal: Deal) => {
        setRestoringId(deal.id)
        try {
            await apiRestoreDeal<Deal>(deal.id)
            notifySuccess('Сделка восстановлена')
            mutate()
        } catch (err) {
            notifyError(extractError(err, 'Не удалось восстановить сделку'))
        } finally {
            setRestoringId(null)
        }
    }

    // ST-10/ST-12: no-permission graceful stub (restore requires deals:delete).
    if (!canDelete) {
        return (
            <Container>
                <AdaptiveCard>
                    <div className="text-center py-10 text-gray-500" {...qa('deals.trash.noPermission')}>
                        Доступ к корзине сделок есть только у пользователей с правом удаления.
                    </div>
                </AdaptiveCard>
            </Container>
        )
    }

    return (
        <Container {...qa('deals.trash.root')}>
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                    <button
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        onClick={() => navigate('/deals')}
                        title="К списку"
                    >
                        <PiArrowLeftDuotone className="w-5 h-5" />
                    </button>
                    <PiTrashDuotone className="w-6 h-6 text-gray-500" />
                    <h3 className="text-2xl font-bold">Корзина сделок</h3>
                </div>

                {isLoading && <Loading loading={true} />}

                {!isLoading && error && (
                    <AdaptiveCard>
                        <div className="text-center py-10" {...qa('deals.trash.error')}>
                            <p className="text-gray-500 mb-3">Не удалось загрузить корзину</p>
                            <Button
                                variant="solid"
                                color="primary"
                                onClick={() => mutate()}
                                {...qa('deals.trash.errorRetry')}
                            >
                                Повторить
                            </Button>
                        </div>
                    </AdaptiveCard>
                )}

                {!isLoading && !error && deals.length === 0 && (
                    <AdaptiveCard>
                        <div className="text-center py-10 text-gray-500" {...qa('deals.trash.empty')}>
                            Корзина пуста.
                        </div>
                    </AdaptiveCard>
                )}

                {!isLoading && !error && deals.length > 0 && (
                    <AdaptiveCard>
                        <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
                            {deals.map((deal) => (
                                <div key={deal.id} className="flex items-center justify-between gap-3 py-3" {...qa('deals.trash.row', { deal: deal.id })}>
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{deal.name}</div>
                                        <div className="text-xs text-gray-500 truncate">
                                            {formatCurrency(deal.amount, deal.currency)}
                                            {deal.companyName && <> · {deal.companyName}</>}
                                            {deal.deletedAt && (
                                                <> · удалена {dayjs.unix(deal.deletedAt).format('DD.MM.YYYY HH:mm')}</>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="default"
                                        icon={<PiArrowCounterClockwiseDuotone />}
                                        loading={restoringId === deal.id}
                                        onClick={() => handleRestore(deal)}
                                        {...qa('deals.trash.restore', { deal: deal.id })}
                                    >
                                        Восстановить
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </AdaptiveCard>
                )}
            </div>
        </Container>
    )
}

export default DealTrash
