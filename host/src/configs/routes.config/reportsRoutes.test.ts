import { describe, it, expect, vi } from 'vitest'

vi.mock('@/utils/loadRemoteModule', () => ({
    lazyRemote: () => () => Promise.resolve({ default: () => null }),
}))

import { protectedRoutes } from './routes.config'

/**
 * TODO-294: маршруты отчётов гейтятся PDP-правами на уровне route meta,
 * а не только внутри remote-модуля.
 */
describe('reports routes permission gate (TODO-294)', () => {
    const reports = protectedRoutes.find((r) => r.path === '/reports')
    const builder = protectedRoutes.find((r) => r.path === '/reports/builder')

    it('/reports требует reports:read', () => {
        expect(reports?.meta?.requires).toBe('reports:read')
    })

    it('/reports/builder требует reports:manage', () => {
        expect(builder?.meta?.requires).toBe('reports:manage')
    })
})
