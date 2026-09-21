import { describe, it, expect } from 'vitest'
import { partitionSlotContributions } from './useSlotContributions'
import type { SlotContribution } from './useSlotContributions'

function contrib(id: string): SlotContribution {
    return {
        key: id,
        moduleId: id,
        title: id,
        moduleKind: 'business',
        component: 'C',
        order: 1,
        wired: true,
    }
}

describe('useSlotContributions partition (FR-SHELL-090)', () => {
    it('limits visible contributors and reports overflow', () => {
        const all = Array.from({ length: 7 }, (_, i) => contrib(`m${i}`))
        const { contributions, overflowCount } = partitionSlotContributions(all, 5)
        expect(contributions).toHaveLength(5)
        expect(overflowCount).toBe(2)
    })
})
