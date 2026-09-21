import { dlqNavBadgeCount } from '@/services/AutomationService'
import { contributionForNavItem } from '@/utils/navItemBadge'

describe('dlqNavBadgeCount (FR-AUTOM-430)', () => {
    it('sums failed and retrying rows only', () => {
        expect(
            dlqNavBadgeCount({
                failed: 2,
                retrying: 1,
                resolved: 5,
                dismissed: 3,
            }),
        ).toBe(3)
    })

    it('returns 0 when counts are absent or empty', () => {
        expect(dlqNavBadgeCount()).toBe(0)
        expect(dlqNavBadgeCount({})).toBe(0)
    })
})

describe('contributionForNavItem (FR-AUTOM-430)', () => {
    const rows = [
        { key: 'automation::NavDlqBadge::nav.item.badge', moduleId: 'automation', wired: true },
        { key: 'deals::Orphan::nav.item.badge', moduleId: 'deals', wired: false },
    ]

    it('returns only the wired contribution for this nav row', () => {
        expect(contributionForNavItem(rows, 'automation')?.key).toBe(
            'automation::NavDlqBadge::nav.item.badge',
        )
        expect(contributionForNavItem(rows, 'deals')).toBeUndefined()
        expect(contributionForNavItem(rows, 'contacts')).toBeUndefined()
        expect(contributionForNavItem(rows)).toBeUndefined()
    })
})
