import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Регрессии клиента поиска (модуль «Поиск», волна fix/module-search).
 *
 *  - TODO-494: `entityTypes` реиндекса уходил в ТЕЛЕ POST, а BFF читает
 *    `@Query('entityTypes')` (common-bff.controller.ts `reindex`) → домен всегда
 *    получал пустой `entity_types` и делал полный реиндекс.
 *  - TODO-493: домен кладёт в индекс путь `/p/<pid>/<модуль>/<id>`, а в host-роутинге
 *    такой схемы нет (`/contacts/:id`, `/companies/:id`, …) → клик по результату
 *    давал 404.
 */

const fetchDataWithAxios = vi.fn()

vi.mock('./ApiService', () => ({
    default: {
        fetchDataWithAxios: (...args: unknown[]) => fetchDataWithAxios(...args),
    },
}))

import {
    apiSearchReindex,
    apiSearchQuery,
    apiGetSearchClientSettings,
    searchHitPath,
    stripProjectPathPrefix,
    probeSearchHitAvailability,
    isSearchHitAccessDenied,
    SEARCH_HIT_UNAVAILABLE_MSG,
} from './SearchService'

beforeEach(() => {
    fetchDataWithAxios.mockReset()
    fetchDataWithAxios.mockResolvedValue({})
})

describe('apiSearchReindex (TODO-494)', () => {
    it('шлёт entityTypes CSV-строкой в query, а не в теле запроса', async () => {
        await apiSearchReindex({
            projectId: 'p1',
            entityTypes: ['contact', 'deal'],
        })

        const cfg = fetchDataWithAxios.mock.calls[0][0]
        expect(cfg.url).toBe('/search/reindex')
        expect(cfg.method).toBe('post')
        expect(cfg.params).toEqual({
            projectId: 'p1',
            entityTypes: 'contact,deal',
        })
        // Регрессия: раньше типы уезжали телом, которое BFF не читает вовсе.
        expect(cfg.data).toBeUndefined()
    })

    it('без entityTypes шлёт только projectId (полный реиндекс)', async () => {
        await apiSearchReindex({ projectId: 'p1' })

        const cfg = fetchDataWithAxios.mock.calls[0][0]
        expect(cfg.params).toEqual({ projectId: 'p1' })
        expect(cfg.params).not.toHaveProperty('entityTypes')
    })

    it('пустой массив типов не превращается в пустой query-параметр', async () => {
        await apiSearchReindex({ projectId: 'p1', entityTypes: [] })

        const cfg = fetchDataWithAxios.mock.calls[0][0]
        expect(cfg.params).toEqual({ projectId: 'p1' })
    })

    it('несёт Idempotency-Key (небезопасная мутация)', async () => {
        await apiSearchReindex({ projectId: 'p1' })
        const cfg = fetchDataWithAxios.mock.calls[0][0]
        expect(cfg.headers['Idempotency-Key']).toBeTruthy()
    })
})

describe('apiSearchQuery', () => {
    it('projectId и entityTypes уходят query-параметрами (контракт BFF)', async () => {
        await apiSearchQuery({
            projectId: 'p1',
            query: 'ив',
            entityTypes: ['contact'],
            pageSize: 25,
        })

        const cfg = fetchDataWithAxios.mock.calls[0][0]
        expect(cfg.method).toBe('get')
        expect(cfg.params.projectId).toBe('p1')
        expect(cfg.params.query).toBe('ив')
        expect(cfg.params.entityTypes).toBe('contact')
        expect(cfg.params.pageSize).toBe(25)
    })
})

describe('searchHitPath (TODO-493)', () => {
    it('строит host-маршрут из entity_type + entity_id, снимая префикс /p/<pid>', () => {
        expect(
            searchHitPath({
                entity_type: 'contact',
                entity_id: 'c1',
                path: '/p/proj-1/contacts/c1',
            }),
        ).toBe('/contacts/c1')

        expect(
            searchHitPath({
                entity_type: 'company',
                entity_id: 'co1',
                // Индекс делты пишет наивный `${entityType}s` → «companys».
                path: '/p/proj-1/companys/co1',
            }),
        ).toBe('/companies/co1')

        expect(
            searchHitPath({
                entity_type: 'activity',
                entity_id: 'a1',
                path: '/p/proj-1/activitys/a1',
            }),
        ).toBe('/activities/a1')
    })

    it('покрывает все шесть индексируемых типов', () => {
        const cases: Array<[string, string]> = [
            ['contact', '/contacts/x'],
            ['company', '/companies/x'],
            ['deal', '/deals/x'],
            ['order', '/orders/x'],
            ['activity', '/activities/x'],
            ['product', '/products/x'],
        ]
        for (const [type, expected] of cases) {
            expect(searchHitPath({ entity_type: type, entity_id: 'x' })).toBe(
                expected,
            )
        }
    })

    it('незнакомый тип деградирует до пути индекса без префикса проекта', () => {
        expect(
            searchHitPath({
                entity_type: 'invoice',
                entity_id: 'i1',
                path: '/p/proj-1/invoices/i1',
            }),
        ).toBe('/invoices/i1')
    })

    it('никогда не отдаёт путь вида /p/<pid>/… (он даёт 404 в host)', () => {
        const out = searchHitPath({
            entity_type: 'deal',
            entity_id: 'd1',
            path: '/p/proj-1/deals/d1',
        })
        expect(out.startsWith('/p/')).toBe(false)
    })

    it('без path и без известного типа не падает', () => {
        expect(searchHitPath({ entity_type: 'unknown' })).toBe('/')
    })
})

describe('stripProjectPathPrefix', () => {
    it('снимает только префикс проекта', () => {
        expect(stripProjectPathPrefix('/p/abc/contacts/1')).toBe('/contacts/1')
        expect(stripProjectPathPrefix('/contacts/1')).toBe('/contacts/1')
        // Голый /p/<pid> без хвоста трогать нечего.
        expect(stripProjectPathPrefix('/p/abc')).toBe('/p/abc')
    })
})

/**
 * TODO-492 (хвост): сохранённые настройки модуля читались только админской
 * ручкой control под `project:manage` — рядовой участник получал 403 и клиент
 * навсегда оставался на дефолтах. gateway отдаёт ту же конфигурацию под гейтом
 * `search:read` (`GET /api/search/settings`, `searchClientSettings`).
 */
describe('apiGetSearchClientSettings (TODO-492)', () => {
    it('идёт на member-readable ручку gateway, а не на control-настройки', async () => {
        await apiGetSearchClientSettings('p1')

        const cfg = fetchDataWithAxios.mock.calls[0][0]
        expect(cfg.url).toBe('/search/settings')
        expect(cfg.method).toBe('get')
        // Не `/projects/p1/modules/search/settings` — та ручка project:manage.
        expect(cfg.url).not.toContain('/projects/')
    })

    it('projectId уходит query-параметром (тот же контракт, что у /search/query)', async () => {
        await apiGetSearchClientSettings('p1')

        expect(fetchDataWithAxios.mock.calls[0][0].params).toEqual({
            projectId: 'p1',
        })
    })

    it('пробрасывает AbortSignal вызывающего', async () => {
        const ctrl = new AbortController()
        await apiGetSearchClientSettings('p1', ctrl.signal)

        expect(fetchDataWithAxios.mock.calls[0][0].signal).toBe(ctrl.signal)
    })
})

describe('probeSearchHitAvailability (FR-SEARCH-110)', () => {
    it('возвращает true, когда домен отдаёт карточку', async () => {
        fetchDataWithAxios.mockResolvedValue({ id: 'c1' })

        await expect(
            probeSearchHitAvailability('p1', {
                entity_type: 'contact',
                entity_id: 'c1',
            }),
        ).resolves.toBe(true)

        expect(fetchDataWithAxios.mock.calls[0][0]).toMatchObject({
            url: '/v1/contacts/c1',
            method: 'get',
            params: { projectId: 'p1' },
        })
    })

    it('возвращает false на 403/404 без выброса', async () => {
        fetchDataWithAxios.mockRejectedValue({ response: { status: 404 } })
        await expect(
            probeSearchHitAvailability('p1', {
                entity_type: 'deal',
                entity_id: 'd1',
            }),
        ).resolves.toBe(false)

        fetchDataWithAxios.mockRejectedValue({ response: { status: 403 } })
        await expect(
            probeSearchHitAvailability('p1', {
                entity_type: 'deal',
                entity_id: 'd2',
            }),
        ).resolves.toBe(false)
    })

    it('пробрасывает сетевые ошибки (не маскирует как stale)', async () => {
        fetchDataWithAxios.mockRejectedValue(new Error('network'))
        await expect(
            probeSearchHitAvailability('p1', {
                entity_type: 'contact',
                entity_id: 'c1',
            }),
        ).rejects.toThrow('network')
    })

    it('isSearchHitAccessDenied распознаёт только 403/404', () => {
        expect(isSearchHitAccessDenied({ response: { status: 404 } })).toBe(
            true,
        )
        expect(isSearchHitAccessDenied({ response: { status: 403 } })).toBe(
            true,
        )
        expect(isSearchHitAccessDenied({ response: { status: 500 } })).toBe(
            false,
        )
    })

    it('константа сообщения для stale-хита', () => {
        expect(SEARCH_HIT_UNAVAILABLE_MSG).toBe(
            'Запись недоступна или удалена',
        )
    })
})
