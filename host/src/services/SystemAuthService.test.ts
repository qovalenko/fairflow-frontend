import { serviceKeyExpiryBadge } from '@/services/SystemAuthService'

describe('serviceKeyExpiryBadge (FR-AUTH-370)', () => {
    it('flags keys expiring within 14 days', () => {
        const soon = new Date(Date.now() + 3 * 24 * 60 * 60_000).toISOString()
        expect(serviceKeyExpiryBadge(soon)).toBe('soon')
    })

    it('flags past expiry', () => {
        const past = new Date(Date.now() - 60_000).toISOString()
        expect(serviceKeyExpiryBadge(past)).toBe('expired')
    })

    it('returns none without expiresAt', () => {
        expect(serviceKeyExpiryBadge(null)).toBe('none')
    })
})
