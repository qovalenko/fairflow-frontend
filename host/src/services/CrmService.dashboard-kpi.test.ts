/**
 * TODO-504 (host-половина): маппер дашборда не выдумывает сравнение с прошлым
 * периодом.
 *
 * Gateway уже закреплён тестом `statistics-bff.kpi-growth.spec.ts` — он
 * переносит `previous_value`/`growth_rate` как есть и НЕ подставляет числа,
 * когда домен полей не прислал. Но между BFF и экраном есть ещё одна проекция,
 * `mapBffDashboardToFrontend`, и именно она делала `Number(k.growthRate ?? 0)`:
 * отсутствие поля превращалось в честный ноль, и под KPI появлялось «▲ +0%».
 *
 * Здесь закреплён контракт этой проекции: число доезжает (включая ноль и
 * отрицательное), отсутствие остаётся `undefined` — по нему `KpiCell`
 * (`modules/statistics/src/DashboardWidgets.tsx`) решает, рисовать ли индикатор.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiGetDashboard } from './CrmService'
import type { DashboardData } from '@/@types/crm'

/** Граница мокается: сеть не трогаем, проверяем ровно проекцию ответа BFF. */
const fetchDataWithAxios = vi.hoisted(() => vi.fn())

vi.mock('./ApiService', () => ({
    default: { fetchDataWithAxios },
}))

const dashboardWith = async (kpi: Record<string, unknown>[]) => {
    fetchDataWithAxios.mockResolvedValueOnce({ kpi })
    return apiGetDashboard<DashboardData>({ projectId: 'p1' })
}

describe('mapBffDashboardToFrontend: KPI и база сравнения (TODO-504)', () => {
    beforeEach(() => fetchDataWithAxios.mockReset())

    it('переносит previousValue/growthRate как числа', async () => {
        const data = await dashboardWith([
            {
                key: 'deals_amount',
                label: 'Сумма сделок',
                value: 150,
                previousValue: 100,
                growthRate: 0.5,
            },
        ])

        expect(data.statistics[0]).toEqual({
            key: 'deals_amount',
            label: 'Сумма сделок',
            value: 150,
            previousValue: 100,
            growthRate: 0.5,
        })
    })

    it('честный ноль базы остаётся нулём (это «сравнивать не с чем», а не «нет поля»)', async () => {
        const data = await dashboardWith([
            { key: 'orders_in_progress', label: 'Продажи', value: 42, previousValue: 0, growthRate: 0 },
        ])

        expect(data.statistics[0].previousValue).toBe(0)
        expect(data.statistics[0].growthRate).toBe(0)
    })

    it('старая сборка без полей → undefined, а не выдуманный нулевой рост', async () => {
        const data = await dashboardWith([
            { key: 'deals_in_progress', label: 'Сделки в работе', value: 42 },
        ])

        expect(data.statistics[0].value).toBe(42)
        expect(data.statistics[0].previousValue).toBeUndefined()
        expect(data.statistics[0].growthRate).toBeUndefined()
    })

    it('падение не теряет знак', async () => {
        const data = await dashboardWith([
            { key: 'won', label: 'Выиграно', value: 4, previousValue: 8, growthRate: -0.5 },
        ])

        expect(data.statistics[0].growthRate).toBe(-0.5)
    })
})
