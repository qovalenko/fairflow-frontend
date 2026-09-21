import { useNavigate } from 'react-router'
import Button from '@/components/ui/Button'
import { PiReceiptDuotone } from 'react-icons/pi'
import usePermission from '@/utils/hooks/usePermission'
import { qa } from './qa'

type DealCreateOrderActionProps = {
    dealId?: string
    /** Lifecycle status from the deal card (`open`/`won`/`lost`). */
    status?: string
}

/** `deal.card.action`: manual «Создать продажу» from a won deal. */
export default function DealCreateOrderAction({ dealId, status }: DealCreateOrderActionProps) {
    const navigate = useNavigate()
    const can = usePermission()

    if (!dealId || !can('orders', 'write')) return null
    // BX-FLOW-6: продажа — следствие won. Без статуса (старый host) не прячем.
    if (status && status !== 'won') return null

    return (
        <Button
            size="sm"
            variant="solid"
            color="primary"
            icon={<PiReceiptDuotone />}
            {...qa('orders.dealCreateAction.button')}
            onClick={() => navigate(`/orders?dealId=${encodeURIComponent(dealId)}`)}
        >
            Создать продажу
        </Button>
    )
}
