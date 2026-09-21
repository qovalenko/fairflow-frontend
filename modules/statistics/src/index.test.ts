/**
 * Federation public API (index.ts) — контракт remote-экспортов.
 */
vi.mock('./StatisticsModule', () => ({ default: 'StatisticsModule' }))
vi.mock('./Dashboard', () => ({ default: 'Dashboard' }))
vi.mock('./Analytics', () => ({ default: 'Analytics' }))

describe('index.ts — публичные экспорты remote', () => {
    it('реэкспортирует StatisticsModule, Dashboard и Analytics', async () => {
        const barrel = await import('./index')

        expect(barrel.StatisticsModule).toBe('StatisticsModule')
        expect(barrel.Dashboard).toBe('Dashboard')
        expect(barrel.Analytics).toBe('Analytics')
    })
})
