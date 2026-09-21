import { describe, expect, it } from 'vitest'
import { overdueBadgeCount } from './useNavigationConfig'

describe('overdueBadgeCount (FR-ACTIVITIES-090)', () => {
    it('returns count from activities overdue-count payload', () => {
        expect(overdueBadgeCount({ count: 17 })).toBe(17)
    })

    it('returns 0 when count missing', () => {
        expect(overdueBadgeCount(undefined)).toBe(0)
        expect(overdueBadgeCount({})).toBe(0)
    })
})
