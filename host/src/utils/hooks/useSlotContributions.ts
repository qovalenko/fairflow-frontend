import { useMemo } from 'react'
import usePlatformModules from '@/utils/hooks/usePlatformModules'
import {
    rejectSlotContribution,
    getSlotDescriptor,
    SLOT_CONTRIBUTOR_VISIBLE_LIMIT,
} from '@/configs/slot-catalog.config'
import { hasSlotComponent } from '@/utils/loadRemoteComponent'
import type { MountSlotId } from '@/configs/slot-catalog.config'
import type { ModuleCard, ModuleCardMountPoint } from '@/@types/module-card'

export interface SlotContribution {
    key: string
    moduleId: string
    title: string
    moduleKind: ModuleCard['kind']
    component: string
    requires?: string
    requiresContext?: string[]
    order: number
    wired: boolean
}

export type SlotContributionsResult = {
    contributions: SlotContribution[]
    overflowCount: number
    visibleLimit: number
}

const FALLBACK_ORDER = 1000

export function collectSlotContributions(
    slotId: MountSlotId,
    enabledCards: ModuleCard[],
): SlotContribution[] {
    const descriptor = getSlotDescriptor(slotId)
    if (!descriptor || descriptor.reserved) return []

    const out: SlotContribution[] = []

    for (const card of enabledCards) {
        const mountPoints = card.mountPoints ?? []
        for (let i = 0; i < mountPoints.length; i++) {
            const mp = mountPoints[i]
            if (mp.slot !== slotId) continue
            if (rejectSlotContribution(mp.slot, card.kind) !== null) continue
            out.push(toContribution(card, mp, i))
        }
    }

    out.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order
        const m = a.moduleId.localeCompare(b.moduleId)
        if (m !== 0) return m
        return a.component.localeCompare(b.component)
    })

    return out
}

/** FR-SHELL-090: apply visible limit; remainder reported as overflowCount. */
export function partitionSlotContributions(
    contributions: SlotContribution[],
    limit = SLOT_CONTRIBUTOR_VISIBLE_LIMIT,
): SlotContributionsResult {
    if (contributions.length <= limit) {
        return { contributions, overflowCount: 0, visibleLimit: limit }
    }
    return {
        contributions: contributions.slice(0, limit),
        overflowCount: contributions.length - limit,
        visibleLimit: limit,
    }
}

export default function useSlotContributions(
    slotId: MountSlotId,
): SlotContribution[] {
    const { enabledCards, ready } = usePlatformModules()

    return useMemo<SlotContribution[]>(() => {
        if (!ready) return []
        return collectSlotContributions(slotId, enabledCards)
    }, [enabledCards, ready, slotId])
}

export function useSlotContributionsPartitioned(
    slotId: MountSlotId,
): SlotContributionsResult {
    const contributions = useSlotContributions(slotId)
    return useMemo(
        () => partitionSlotContributions(contributions),
        [contributions],
    )
}

function toContribution(
    card: ModuleCard,
    mp: ModuleCardMountPoint,
    index: number,
): SlotContribution {
    return {
        key: `${card.id}::${mp.component}::${mp.slot}`,
        moduleId: card.id,
        title: card.displayName || card.id,
        moduleKind: card.kind,
        component: mp.component,
        requires: mp.requires,
        requiresContext: mp.requiresContext,
        order: mp.order ?? FALLBACK_ORDER + index,
        wired: hasSlotComponent(card.id, mp.component),
    }
}
