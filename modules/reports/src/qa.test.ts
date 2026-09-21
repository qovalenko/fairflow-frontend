import { describe, it, expect, afterEach } from 'vitest'
import { qa } from './qa'

describe('qa() — data-qa-id helper', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('при включённых QA-id возвращает data-qa-id и data-qa-* атрибуты', () => {
        const attrs = qa('reports.main.tab', { tab: 'sales' })

        expect(attrs['data-qa-id']).toBe('reports.main.tab')
        expect(attrs['data-qa-tab']).toBe('sales')
    })

    it('при выключенных QA-id не добавляет атрибуты в DOM', () => {
        vi.stubGlobal('__QA_IDS_ENABLED__', false)

        expect(qa('reports.main.tab', { tab: 'sales' })).toEqual({})
    })

    it('пропускает null/undefined в data-параметрах', () => {
        const attrs = qa('reports.list.row', { report: 'r1', tab: null, idx: undefined })

        expect(attrs['data-qa-id']).toBe('reports.list.row')
        expect(attrs['data-qa-report']).toBe('r1')
        expect(attrs['data-qa-tab']).toBeUndefined()
        expect(attrs['data-qa-idx']).toBeUndefined()
    })
})
