import { describe, expect, it, vi, beforeEach } from 'vitest'

const loadApp = vi.fn()

vi.mock('./vite-entry-app', () => {
    loadApp()
    return { default: {} }
})

describe('vite-entry — условный standalone bootstrap', () => {
    beforeEach(() => {
        loadApp.mockClear()
        vi.resetModules()
        vi.unstubAllEnvs()
    })

    it('не загружает vite-entry-app без VITE_STANDALONE_MODE', async () => {
        vi.stubEnv('VITE_STANDALONE_MODE', 'false')
        await import('./vite-entry')
        await vi.waitFor(() => {
            expect(loadApp).not.toHaveBeenCalled()
        })
    })

    it('динамически загружает vite-entry-app при VITE_STANDALONE_MODE=true', async () => {
        vi.stubEnv('VITE_STANDALONE_MODE', 'true')
        await import('./vite-entry')
        await vi.waitFor(() => {
            expect(loadApp).toHaveBeenCalledOnce()
        })
    })
})
