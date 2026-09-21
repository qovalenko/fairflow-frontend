import { useNavigate } from 'react-router'
import Dropdown from '@/components/ui/Dropdown'
import { PiPencilDuotone } from 'react-icons/pi'
import { qa } from './qa'

type OrderListActionMenuProps = {
    entityType?: string
    recordId?: string
}

export default function OrderListActionMenu({ entityType, recordId }: OrderListActionMenuProps) {
    const navigate = useNavigate()

    if (entityType !== 'order' || !recordId) return null

    return (
        <Dropdown.Item
            eventKey={`order-edit-${recordId}`}
            className="flex items-center gap-2"
            {...qa('orders.list.action.edit', { order: recordId })}
            onClick={() => navigate(`/orders/${recordId}/edit`)}
        >
            <PiPencilDuotone className="text-lg" />
            <span>Редактировать</span>
        </Dropdown.Item>
    )
}
