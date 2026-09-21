import { useState } from 'react'
import Button from '@/components/ui/Button'
import { PiPlusDuotone } from 'react-icons/pi'
import EntityCreateDrawer from '@/components/template/EntityCreateDrawer'
import type { TaskInitialData } from '@/components/template/EntityCreateDrawer'

const SUPPORTED = new Set(['contact', 'company', 'deal', 'order'])

type EntityListBulkActionMenuProps = {
    entityType?: string
    selectedIds?: string[]
}

/** Bulk toolbar: create one task linked to all selected records (`list.bulk.action`). */
export default function EntityListBulkActionMenu({
    entityType,
    selectedIds,
}: EntityListBulkActionMenuProps) {
    const [open, setOpen] = useState(false)
    const ids = selectedIds ?? []

    if (!entityType || !SUPPORTED.has(entityType) || ids.length === 0) return null

    const initial: TaskInitialData =
        entityType === 'contact'
            ? { contactIds: ids }
            : entityType === 'company'
              ? { companyId: ids[0] }
              : entityType === 'deal'
                ? { dealId: ids[0] }
                : { orderId: ids[0] }

    return (
        <>
            <Button
                size="sm"
                variant="default"
                icon={<PiPlusDuotone />}
                onClick={() => setOpen(true)}
            >
                Задача ({ids.length})
            </Button>
            {open && (
                <EntityCreateDrawer
                    entityType="task"
                    isOpen={open}
                    onClose={() => setOpen(false)}
                    onSuccess={() => setOpen(false)}
                    taskInitialData={initial}
                />
            )}
        </>
    )
}
