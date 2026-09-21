import { useMemo } from 'react'
import usePlatformModules from '@/utils/hooks/usePlatformModules'
import type { EntityCreateType } from '@/components/template/EntityCreateDrawer'
import {
    PiUserDuotone,
    PiBuildingsDuotone,
    PiCheckSquareDuotone,
    PiPhoneDuotone,
    PiCalendarBlankDuotone,
    PiHandTapDuotone,
    PiReceiptDuotone,
    PiNoteDuotone,
} from 'react-icons/pi'

export type DrawerEntityItem = {
    key: string
    label: string
    path: string
    moduleKey: string
    entityType: EntityCreateType | null
    icon: React.ReactNode
    requires?: string
}

const ENTITY_META: Record<
    string,
    {
        label: string
        path: string
        moduleKey: string
        entityType: EntityCreateType | null
        icon: React.ReactNode
        requires?: string
    }
> = {
    contact: {
        label: 'Контакт',
        path: 'contacts',
        moduleKey: 'contacts',
        entityType: 'contact',
        icon: <PiUserDuotone className="text-lg" />,
        requires: 'contacts:write',
    },
    company: {
        label: 'Компанию',
        path: 'companies',
        moduleKey: 'companies',
        entityType: 'company',
        icon: <PiBuildingsDuotone className="text-lg" />,
        requires: 'companies:write',
    },
    deal: {
        label: 'Сделку',
        path: 'deals',
        moduleKey: 'deals',
        entityType: 'deal',
        icon: <PiHandTapDuotone className="text-lg" />,
        requires: 'deals:write',
    },
    order: {
        label: 'Продажа',
        path: 'orders',
        moduleKey: 'orders',
        entityType: 'order',
        icon: <PiReceiptDuotone className="text-lg" />,
        requires: 'orders:write',
    },
    task: {
        label: 'Задачу',
        path: 'activities',
        moduleKey: 'activities',
        entityType: 'task',
        icon: <PiCheckSquareDuotone className="text-lg" />,
        requires: 'activities:write',
    },
    call: {
        label: 'Звонок',
        path: 'activities',
        moduleKey: 'activities',
        entityType: 'call',
        icon: <PiPhoneDuotone className="text-lg" />,
        requires: 'activities:write',
    },
    meeting: {
        label: 'Встречу',
        path: 'activities',
        moduleKey: 'activities',
        entityType: 'meeting',
        icon: <PiCalendarBlankDuotone className="text-lg" />,
        requires: 'activities:write',
    },
    note: {
        label: 'Заметку',
        path: 'activities',
        moduleKey: 'activities',
        entityType: 'note',
        icon: <PiNoteDuotone className="text-lg" />,
        requires: 'activities:write',
    },
}

/**
 * FR-SHELL-270: quick-create menu from manifest `drawerEntities[]` of enabled
 * module cards (`GET /api/v1/platform/modules`), not a hardcoded host list.
 */
export default function useDrawerEntities(): DrawerEntityItem[] {
    const { enabledCards, ready } = usePlatformModules()

    return useMemo(() => {
        if (!ready) return []
        const seen = new Set<string>()
        const out: DrawerEntityItem[] = []

        for (const card of enabledCards) {
            for (const entityKey of card.drawerEntities ?? []) {
                if (seen.has(entityKey)) continue
                const meta = ENTITY_META[entityKey]
                if (!meta) continue
                if (meta.moduleKey !== card.id) continue
                seen.add(entityKey)
                out.push({ key: entityKey, ...meta })
            }
        }

        return out
    }, [enabledCards, ready])
}
