import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * FR-ORDERS-440 — виджет «Продажи» в карточке сделки.
 *
 * Карточка сделки должна тянуть агрегат `GET /v1/deals/:id/orders-summary`,
 * а не полный список `GET /v1/orders?pageSize=1000&dealId=…`.
 */
const fetchDataWithAxios = vi.fn().mockResolvedValue({ total: 0, byStatus: {}, items: [] })

vi.mock('@/services/ApiService', () => ({
    default: { fetchDataWithAxios: (...args: unknown[]) => fetchDataWithAxios(...args) },
}))

import { apiGetDealOrdersSummary } from '@/services/CrmService'
import { useProjectStore } from '@/store/projectStore'
import { statusKeyOf } from './CompanyOrdersWidget'

const lastCall = () => fetchDataWithAxios.mock.calls.at(-1)?.[0] as {
    url: string
    params: Record<string, unknown>
}

beforeEach(() => {
    useProjectStore.getState().setCurrentProject({
        id: 'proj-1',
        name: 'Проект',
        enabledModules: ['deals', 'orders'],
    })
})

describe('apiGetDealOrdersSummary', () => {
    it('запрашивает orders-summary с projectId текущего проекта', async () => {
        await apiGetDealOrdersSummary('deal-1')

        expect(lastCall().url).toBe('/v1/deals/deal-1/orders-summary')
        expect(lastCall().params).toMatchObject({ projectId: 'proj-1' })
    })
})

describe('statusKeyOf (бейдж статуса в виджете продаж)', () => {
    it('маппит статусы машины состояний домена на ключи конфига', () => {
        expect(statusKeyOf('ACTIVE')).toBe('active')
        expect(statusKeyOf('SENDING')).toBe('active')
        expect(statusKeyOf('DONE')).toBe('completed')
        expect(statusKeyOf('SEND_ERROR')).toBe('error')
        expect(statusKeyOf('CANCELLED')).toBe('cancelled')
    })

    it('принимает legacy-строчные статусы как есть', () => {
        expect(statusKeyOf('active')).toBe('active')
        expect(statusKeyOf('completed')).toBe('completed')
        expect(statusKeyOf('error')).toBe('error')
    })
})
