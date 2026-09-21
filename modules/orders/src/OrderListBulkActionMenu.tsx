import { useNavigate } from 'react-router'
import Button from '@/components/ui/Button'
import { PiArrowRightDuotone } from 'react-icons/pi'
import { qa } from './qa'

type OrderListBulkActionMenuProps = {
    entityType?: string
    selectedIds?: string[]
}

export default function OrderListBulkActionMenu({
    entityType,
    selectedIds,
}: OrderListBulkActionMenuProps) {
    const navigate = useNavigate()
    const ids = selectedIds ?? []

    if (entityType !== 'order' || ids.length !== 1) return null

    return (
        <Button
            size="sm"
            variant="default"
            icon={<PiArrowRightDuotone />}
            {...qa('orders.list.bulk.open', { order: ids[0] })}
            onClick={() => navigate(`/orders/${ids[0]}`)}
        >
            Открыть продажу
        </Button>
    )
}
