import { useState } from 'react'
import { PiPlusDuotone } from 'react-icons/pi'
import Dropdown from '@/components/ui/Dropdown'
import EntityCreateDrawer from '@/components/template/EntityCreateDrawer'
import type { TaskInitialData } from '@/components/template/EntityCreateDrawer'

const SUPPORTED = new Set(['contact', 'company', 'deal', 'order'])

type EntityListActionMenuProps = {
    entityType?: string
    recordId?: string
}

const initialFor = (entityType: string, recordId: string): TaskInitialData => {
    switch (entityType) {
        case 'contact':
            return { contactId: recordId }
        case 'company':
            return { companyId: recordId }
        case 'deal':
            return { dealId: recordId }
        case 'order':
            return { orderId: recordId }
        default:
            return {}
    }
}

/** Row action: quick-create task from CRM list (`list.action.menu`). */
export default function EntityListActionMenu({ entityType, recordId }: EntityListActionMenuProps) {
    const [open, setOpen] = useState(false)

    if (!entityType || !recordId || !SUPPORTED.has(entityType)) return null

    return (
        <>
            <Dropdown.Item
                eventKey={`activity-task-${recordId}`}
                className="flex items-center gap-2"
                onClick={() => setOpen(true)}
            >
                <PiPlusDuotone className="text-lg" />
                <span>Задача</span>
            </Dropdown.Item>
            {open && (
                <EntityCreateDrawer
                    entityType="task"
                    isOpen={open}
                    onClose={() => setOpen(false)}
                    onSuccess={() => setOpen(false)}
                    taskInitialData={initialFor(entityType, recordId)}
                />
            )}
        </>
    )
}
