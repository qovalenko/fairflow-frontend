import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import {
    apiCancelOrder,
    apiCloseDeal,
    apiGetDealOrdersSummary,
    apiGetLostReasons,
    type DealOrdersSummary,
} from '@/services/CrmService'
import type { Deal, LostReason } from '@/@types/crm'
import { extractError, notifyError, notifySuccess } from './dealUtils'
import { qa } from '../qa'
import { makeSelectOption } from '../selectQa'

type Props = {
    /** Which terminal state to drive towards. */
    result: 'won' | 'lost'
    deal: Deal
    isOpen: boolean
    onClose: () => void
    /** Called with the updated deal after a successful close. */
    onClosed: (deal: Deal) => void
}

const normalizeList = <T,>(value: unknown): T[] => {
    if (Array.isArray(value)) return value as T[]
    if (value && typeof value === 'object' && 'list' in value && Array.isArray((value as { list?: unknown }).list)) {
        return (value as { list: T[] }).list
    }
    return []
}

const TERMINAL_ORDER_STATUSES = new Set(['DONE', 'CANCELLED'])

const incompleteOrders = (summary?: DealOrdersSummary) =>
    (summary?.items ?? []).filter((item) => !TERMINAL_ORDER_STATUSES.has(String(item.status ?? '').toUpperCase()))

/**
 * SCR-DEALS-CLOSE-DIALOG — overlay to close a deal as won or lost.
 * lost requires a reason from the per-project dictionary when it is non-empty
 * (FR-MDEAL-11; pipe contract §9 → 422 INVALID_ARGUMENT without reason).
 * FR-DEALS-120: when unfinished orders exist, user must choose keep vs cancel.
 */
const CloseDealDialog = ({ result, deal, isOpen, onClose, onClosed }: Props) => {
    const isLost = result === 'lost'
    const [lostReasonId, setLostReasonId] = useState('')
    const [comment, setComment] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [ordersResolution, setOrdersResolution] = useState<'keep' | 'cancel' | null>(null)

    const { data: reasonsData, isLoading: reasonsLoading } = useSWR(
        isOpen && isLost ? ['/api/v1/lost-reasons'] : null,
        () => apiGetLostReasons<LostReason[] | { list: LostReason[] }>(true),
        { revalidateOnFocus: false },
    )

    const { data: ordersSummary, isLoading: ordersLoading } = useSWR(
        isOpen && isLost ? ['/api/v1/deals/orders-summary', deal.id] : null,
        () => apiGetDealOrdersSummary(deal.id),
        { revalidateOnFocus: false },
    )

    const reasons = normalizeList<LostReason>(reasonsData)
    const reasonOptions = useMemo(
        () => reasons.map((r) => ({ value: r.id, label: r.name })),
        [reasons],
    )

    const pendingOrders = useMemo(() => incompleteOrders(ordersSummary), [ordersSummary])
    const ordersForkRequired = isLost && pendingOrders.length > 0

    // A reason is mandatory only when the dictionary is non-empty.
    const reasonRequired = isLost && reasons.length > 0
    const canSubmit =
        !submitting &&
        (!reasonRequired || !!lostReasonId) &&
        (!ordersForkRequired || ordersResolution != null) &&
        !(isLost && ordersLoading)

    const handleConfirm = async () => {
        setSubmitting(true)
        try {
            if (ordersForkRequired && ordersResolution === 'cancel') {
                for (const order of pendingOrders) {
                    try {
                        await apiCancelOrder(order.id, 'Сделка закрыта как проигранная')
                    } catch (err) {
                        notifyError(
                            extractError(
                                err,
                                `Не удалось отменить продажу ${order.number || order.id}`,
                            ),
                        )
                        return
                    }
                }
            }
            const updated = await apiCloseDeal<Deal>(deal.id, {
                result,
                ...(isLost && lostReasonId ? { lostReasonId } : {}),
                ...(isLost && comment ? { lostReasonComment: comment } : {}),
            })
            notifySuccess(isLost ? 'Сделка помечена как проигранная' : 'Сделка выиграна')
            onClosed(updated ?? { ...deal, status: result })
            onClose()
        } catch (err) {
            notifyError(extractError(err, 'Не удалось закрыть сделку'))
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog isOpen={isOpen} onClose={onClose} onRequestClose={onClose} {...qa('deals.close.dialog')}>
            <h5 className="mb-4">{isLost ? 'Закрыть как проигранную' : 'Закрыть как выигранную'}</h5>
            <p className="mb-4 text-gray-600 dark:text-gray-400">
                {isLost
                    ? 'Сделка будет перемещена в проигранные. Укажите причину.'
                    : `Сделка «${deal.name}» будет помечена как выигранная и перемещена на финальную стадию.`}
            </p>

            {isLost && ordersForkRequired && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
                    <p className="font-medium text-amber-900 dark:text-amber-100">
                        Незавершённые продажи: {pendingOrders.length}
                    </p>
                    <p className="mt-1 text-amber-800 dark:text-amber-200">
                        Выберите, что сделать с продажами по сделке, прежде чем закрывать её.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                            size="sm"
                            variant={ordersResolution === 'cancel' ? 'solid' : 'plain'}
                            onClick={() => setOrdersResolution('cancel')}
                            {...qa('deals.close.ordersCancel')}
                        >
                            Отменить продажи
                        </Button>
                        <Button
                            size="sm"
                            variant={ordersResolution === 'keep' ? 'solid' : 'plain'}
                            onClick={() => setOrdersResolution('keep')}
                            {...qa('deals.close.ordersKeep')}
                        >
                            Оставить как есть
                        </Button>
                    </div>
                </div>
            )}

            {isLost && (
                <div className="flex flex-col gap-3 mb-2">
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Причина проигрыша
                            {reasonRequired && <span className="text-red-500"> *</span>}
                        </label>
                        <Select
                            placeholder={reasonsLoading ? 'Загрузка…' : 'Выберите причину'}
                            isClearable
                            isLoading={reasonsLoading}
                            options={reasonOptions}
                            value={reasonOptions.find((o) => o.value === lostReasonId) || null}
                            onChange={(opt) => setLostReasonId(opt?.value || '')}
                            components={{ Option: makeSelectOption('deals.close.reason') }}
                            {...qa('deals.close.reason')}
                        />
                        {reasonRequired && !lostReasonId && (
                            <p className="text-xs text-red-500 mt-1">Причина обязательна</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Комментарий</label>
                        <Input
                            textArea
                            rows={3}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Дополнительные детали (необязательно)"
                        />
                    </div>
                </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
                <Button variant="plain" onClick={onClose} disabled={submitting} {...qa('deals.close.cancel')}>
                    Не закрывать
                </Button>
                <Button
                    variant="solid"
                    className={
                        isLost
                            ? 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white'
                    }
                    loading={submitting}
                    disabled={!canSubmit}
                    onClick={handleConfirm}
                    {...qa('deals.close.confirm')}
                >
                    {isLost ? 'Закрыть' : 'Подтвердить'}
                </Button>
            </div>
        </Dialog>
    )
}

export default CloseDealDialog
