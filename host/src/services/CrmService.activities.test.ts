import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosRequestConfig } from 'axios'

/**
 * NFR-ACT-100 — create activity must carry `Idempotency-Key` so the domain
 * ledger (`activity.grpc.controller.ts` → `withIdempotency`) can collapse a
 * client retry after a timeout into one row.
 */
const calls: AxiosRequestConfig[] = []

vi.mock('./ApiService', () => ({
    default: {
        fetchDataWithAxios: (cfg: AxiosRequestConfig) => {
            calls.push(cfg)
            return Promise.resolve({ id: 'a1' })
        },
    },
}))

const header = (cfg: AxiosRequestConfig, name: string) =>
    (cfg.headers as Record<string, string> | undefined)?.[name]

describe('CrmService — создание активности (NFR-ACT-100)', () => {
    beforeEach(() => {
        calls.length = 0
    })

    it('apiCreateActivity шлёт Idempotency-Key и projectId в query', async () => {
        const { apiCreateActivity } = await import('./CrmService')
        await apiCreateActivity({ title: 'Позвонить', projectId: 'p1' })

        expect(calls).toHaveLength(1)
        expect(calls[0].url).toBe('/v1/activities')
        expect(calls[0].method).toBe('post')
        expect(header(calls[0], 'Idempotency-Key')).toBeTruthy()
        expect((calls[0].params as { projectId?: string }).projectId).toBe('p1')
    })

    it('явный ключ переиспользуется при ретрае', async () => {
        const { apiCreateActivity, newIdempotencyKey } = await import('./CrmService')
        const key = newIdempotencyKey()
        await apiCreateActivity({ title: 'A', projectId: 'p1' }, key)
        await apiCreateActivity({ title: 'A', projectId: 'p1' }, key)
        expect(header(calls[0], 'Idempotency-Key')).toBe(key)
        expect(header(calls[1], 'Idempotency-Key')).toBe(key)
    })

    it('complete/delete/restore/bulk шлют Idempotency-Key (NFR-ACT-100)', async () => {
        const {
            apiCompleteActivity,
            apiDeleteActivity,
            apiRestoreActivity,
            apiBulkActivities,
        } = await import('./CrmService')
        await apiCompleteActivity('a1', {}, 'p1')
        await apiDeleteActivity('a1', 'p1')
        await apiRestoreActivity('a1', 'p1')
        await apiBulkActivities({ action: 'complete', ids: ['a1'], projectId: 'p1' })
        expect(header(calls[0], 'Idempotency-Key')).toBeTruthy()
        expect(header(calls[1], 'Idempotency-Key')).toBeTruthy()
        expect(header(calls[2], 'Idempotency-Key')).toBeTruthy()
        expect(header(calls[3], 'Idempotency-Key')).toBeTruthy()
    })
})
