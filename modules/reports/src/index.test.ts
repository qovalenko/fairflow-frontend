/**
 * Federation public API (index.ts) — контракт remote-экспортов.
 */
vi.mock('./ReportsModule', () => ({ default: 'ReportsModule' }))

describe('index.ts — публичный экспорт remote', () => {
    it('реэкспортирует ReportsModule по умолчанию', async () => {
        const barrel = await import('./index')

        expect(barrel.default).toBe('ReportsModule')
    })
})
