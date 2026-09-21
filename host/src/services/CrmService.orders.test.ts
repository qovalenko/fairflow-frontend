import { describe, it, expect, beforeEach, vi } from 'vitest'
import ApiService from './ApiService'
import AxiosBase from './axios/AxiosBase'
import { apiGetOrders, apiExportOrders, apiGetStatistics } from './CrmService'
import type { DashboardData } from '@/@types/crm'
import { useProjectStore } from '@/store/projectStore'

/**
 * Регрессии по модулю «Продажи» (волна orders):
 *  - TODO-184: `apiGetOrders` обязан класть projectId в query. Без него gateway
 *    передаёт в домен пустой `project_id`, и виджет «Продажи» в карточке сделки/
 *    компании молча пуст.
 *  - TODO-409: серверный экспорт `GET /v1/orders/export` (а не сборка CSV из
 *    текущей страницы таблицы) с фильтрами и `responseType: 'blob'`.
 */
vi.mock('./ApiService', () => ({
    default: { fetchDataWithAxios: vi.fn(() => Promise.resolve({ list: [], total: 0 })) },
}))
// Выгрузка ходит мимо ApiService: ей нужны заголовки ответа (X-Export-*), а тот
// отдаёт только `response.data`.
vi.mock('./axios/AxiosBase', () => ({
    default: vi.fn(() =>
        Promise.resolve({
            data: new Blob(['number\n'], { type: 'text/csv' }),
            headers: {},
        }),
    ),
}))

const fetchMock = ApiService.fetchDataWithAxios as unknown as ReturnType<typeof vi.fn>
const axiosMock = AxiosBase as unknown as ReturnType<typeof vi.fn>

describe('CrmService — orders', () => {
    beforeEach(() => {
        useProjectStore.setState({ currentProject: null, currentProjectId: 'p1' })
        fetchMock.mockClear()
        axiosMock.mockClear()
    })

    it('apiGetOrders подставляет projectId текущего проекта (TODO-184)', async () => {
        await apiGetOrders({ pageSize: 1000, dealId: 'd1' })

        const call = fetchMock.mock.calls[0][0]
        expect(call.url).toBe('/v1/orders')
        expect(call.method).toBe('get')
        expect(call.params).toMatchObject({ pageSize: 1000, dealId: 'd1', projectId: 'p1' })
    })

    it('apiGetOrders не перетирает явно переданный projectId (идемпотентность)', async () => {
        await apiGetOrders({ pageSize: 10, projectId: 'explicit' })

        expect(fetchMock.mock.calls[0][0].params).toMatchObject({ projectId: 'explicit' })
    })

    it('apiGetOrders без выбранного проекта не выдумывает projectId', async () => {
        useProjectStore.setState({ currentProject: null, currentProjectId: null })

        await apiGetOrders({ pageSize: 10 })

        expect(fetchMock.mock.calls[0][0].params).not.toHaveProperty('projectId')
    })

    it('apiExportOrders зовёт серверную ручку экспорта с фильтрами и blob (TODO-409)', async () => {
        const r = await apiExportOrders({
            format: 'csv',
            query: 'акт',
            typeId: 't1',
            status: 'ACTIVE',
        })

        const call = axiosMock.mock.calls[0][0]
        expect(call.url).toBe('/v1/orders/export')
        expect(call.method).toBe('get')
        expect(call.responseType).toBe('blob')
        expect(call.params).toMatchObject({
            format: 'csv',
            query: 'акт',
            typeId: 't1',
            status: 'ACTIVE',
            projectId: 'p1',
        })
        // Заголовков усечения нет — полноту не выдумываем и усечение тоже.
        expect(r.truncated).toBe(false)
    })

    /**
     * Ревью волны: BFF режет выгрузку по потолку и объявляет это заголовками
     * `X-Export-*` (CORS exposedHeaders). Если сервис их не читает, UI молча
     * скачивает обрезанный файл как полный.
     */
    it('apiExportOrders поднимает признак усечения из заголовков X-Export-*', async () => {
        axiosMock.mockResolvedValueOnce({
            data: new Blob(['number\n'], { type: 'text/csv' }),
            headers: {
                'x-export-truncated': 'true',
                'x-export-row-count': '10000',
                'x-export-total': '25000',
            },
        })

        const r = await apiExportOrders({ format: 'csv' })

        expect(r.truncated).toBe(true)
        expect(r.rowCount).toBe(10000)
        expect(r.total).toBe(25000)
        expect(r.blob).toBeInstanceOf(Blob)
    })

    /**
     * TODO-272: срез «Типы продаж» доходит от BFF до экрана. Мапперы
     * `/v1/statistics` — единственное место трансляции ответа в DashboardData,
     * и раньше `orderTypes` там просто терялся: домен считал, gateway резолвил
     * имена, а виджет всегда рисовал «данных нет».
     */
    it('apiGetStatistics переносит срез orderTypes с id типа (TODO-272)', async () => {
        fetchMock.mockResolvedValueOnce({
            orderTypes: [
                { orderTypeId: 't1', orderTypeName: 'Поставка', count: 4 },
                { orderTypeId: 't2', orderTypeName: '', count: 1 },
            ],
        })

        const res = await apiGetStatistics<DashboardData>({ slices: ['order_types'] })

        // id сохранён — по нему drill в список продаж (`/orders?typeId=`).
        expect(res.orderTypes?.[0]).toEqual({
            orderTypeId: 't1',
            orderTypeName: 'Поставка',
            count: 4,
        })
        // Имя не пришло (тип удалён) → плейсхолдер, а не сырой UUID в подписи.
        expect(res.orderTypes?.[1]).toEqual({
            orderTypeId: 't2',
            orderTypeName: 'Тип без названия',
            count: 1,
        })
    })

    it('apiGetStatistics без среза order_types отдаёт пустой orderTypes, а не undefined', async () => {
        fetchMock.mockResolvedValueOnce({ sales: [] })

        const res = await apiGetStatistics<DashboardData>({ slices: ['sales'] })

        expect(res.orderTypes).toEqual([])
    })
})
