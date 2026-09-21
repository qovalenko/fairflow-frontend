/**
 * Standalone bootstrap gate (vite-entry.ts).
 */
describe('vite-entry — standalone gate', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
        vi.doUnmock('./vite-entry-app')
    })

    it('в standalone-режиме подгружает vite-entry-app', async () => {
        vi.stubEnv('VITE_STANDALONE_MODE', 'true')

        let appImported = false
        vi.doMock('./vite-entry-app', () => {
            appImported = true
            return { default: () => null }
        })

        await import('./vite-entry')
        await vi.waitFor(() => {
            expect(appImported).toBe(true)
        })
    })

    it('без standalone не подгружает vite-entry-app', async () => {
        vi.stubEnv('VITE_STANDALONE_MODE', 'false')

        let appImported = false
        vi.doMock('./vite-entry-app', () => {
            appImported = true
            return { default: () => null }
        })

        await import('./vite-entry')
        await Promise.resolve()
        expect(appImported).toBe(false)
    })
})
