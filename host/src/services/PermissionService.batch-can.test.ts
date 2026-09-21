import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosRequestConfig } from 'axios'

const calls: AxiosRequestConfig[] = []

vi.mock('./ApiService', () => ({
    default: {
        fetchDataWithAxios: (cfg: AxiosRequestConfig) => {
            calls.push(cfg)
            return Promise.resolve({
                results: [
                    {
                        subject: 'contacts',
                        action: 'read',
                        recordRef: { resource: 'contacts', recordId: 'c-1' },
                        allow: true,
                        reason: 'OK',
                    },
                ],
            })
        },
    },
}))

describe('PermissionService — apiBatchRecordCan (API-3)', () => {
    beforeEach(() => {
        calls.length = 0
    })

    it('POST /v1/projects/:id/can с batch checks', async () => {
        const { apiBatchRecordCan } = await import('./PermissionService')
        const checks = [
            {
                subject: 'contacts',
                action: 'read',
                recordRef: { resource: 'contacts', recordId: 'c-1' },
            },
        ]

        const res = await apiBatchRecordCan('p-1', checks)

        expect(calls).toHaveLength(1)
        expect(calls[0].method).toBe('post')
        expect(calls[0].url).toBe('/v1/projects/p-1/can')
        expect(calls[0].data).toEqual({ checks })
        expect(res.results[0]).toMatchObject({
            subject: 'contacts',
            action: 'read',
            allow: true,
            reason: 'OK',
        })
    })
})
