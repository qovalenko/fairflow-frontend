import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AxiosRequestConfig } from 'axios'

/**
 * TODO-176 / EXTRA-CONTACTS-1 / TODO-177 — контракт мутаций и экспорта контактов
 * на уровне HTTP-вызова: какие заголовки и параметры реально уходят на gateway.
 *
 * Домен contact ведёт ledger идемпотентности (`contact.grpc.controller.ts` —
 * `withIdempotency(readIdempotencyKey(metadata))` на create/import/merge), а
 * gateway перекладывает HTTP-заголовок `Idempotency-Key` в gRPC-метадату
 * (`bff/downstream-metadata.ts`). До этой правки фронт заголовок не слал вовсе,
 * поэтому ledger был мёртв: повторный клик создавал дубль, а повтор merge
 * повторно выполнял разрушающую операцию.
 */
const calls: AxiosRequestConfig[] = []
/** Ошибка, которой ответит следующий вызов ApiService (одноразовая). */
let nextRejection: unknown
/** Тело, которым ответит следующий вызов ApiService (одноразовое). */
let nextResponse: unknown

vi.mock('./ApiService', () => ({
    default: {
        fetchDataWithAxios: (cfg: AxiosRequestConfig) => {
            calls.push(cfg)
            if (nextRejection !== undefined) {
                const err = nextRejection
                nextRejection = undefined
                return Promise.reject(err)
            }
            if (nextResponse !== undefined) {
                const body = nextResponse
                nextResponse = undefined
                return Promise.resolve(body)
            }
            return Promise.resolve({})
        },
    },
}))

const header = (cfg: AxiosRequestConfig, name: string) =>
    (cfg.headers as Record<string, string> | undefined)?.[name]

describe('CrmService — мутации контактов', () => {
    beforeEach(() => {
        calls.length = 0
        nextRejection = undefined
        nextResponse = undefined
    })

    it('apiCreateContact шлёт Idempotency-Key', async () => {
        const { apiCreateContact } = await import('./CrmService')
        await apiCreateContact({ firstName: 'Иван' }, { projectId: 'p1' })

        expect(calls).toHaveLength(1)
        expect(calls[0].url).toBe('/v1/contacts')
        expect(header(calls[0], 'Idempotency-Key')).toBeTruthy()
    }, 15000)

    it(
        'apiMergeContacts шлёт Idempotency-Key (merge разрушающий — повтор не должен сливать снова)',
        async () => {
        const { apiMergeContacts } = await import('./CrmService')
        await apiMergeContacts({ sourceId: 'a', targetId: 'b' }, { projectId: 'p1' })

        expect(calls[0].url).toBe('/v1/contacts/merge')
        expect(header(calls[0], 'Idempotency-Key')).toBeTruthy()
    },
    15000,
    )

    it('apiImportContacts шлёт Idempotency-Key и сохраняет multipart Content-Type', async () => {
        const { apiImportContacts } = await import('./CrmService')
        await apiImportContacts(new FormData(), { projectId: 'p1' })

        expect(calls[0].url).toBe('/v1/contacts/import')
        expect(header(calls[0], 'Content-Type')).toBe('multipart/form-data')
        expect(header(calls[0], 'Idempotency-Key')).toBeTruthy()
    })

    it('явный ключ переиспользуется, а без него каждая попытка получает свой', async () => {
        const { apiCreateContact, newIdempotencyKey } = await import('./CrmService')

        const key = newIdempotencyKey()
        await apiCreateContact({ firstName: 'Иван' }, { projectId: 'p1' }, key)
        await apiCreateContact({ firstName: 'Иван' }, { projectId: 'p1' }, key)
        expect(header(calls[0], 'Idempotency-Key')).toBe(key)
        expect(header(calls[1], 'Idempotency-Key')).toBe(key)

        await apiCreateContact({ firstName: 'Пётр' }, { projectId: 'p1' })
        await apiCreateContact({ firstName: 'Пётр' }, { projectId: 'p1' })
        expect(header(calls[2], 'Idempotency-Key')).not.toBe(header(calls[3], 'Idempotency-Key'))
    })

    /**
     * Ревью круга 2: apiGetMembers ходил на `/v1/members` вообще без params, а BFF
     * читает `@Query('projectId')` (`crm-bff.controller.ts` → `project.listMembers`)
     * и при пустом значении отдаёт `{ list: [] }`. Итог — пустые селекты
     * «Ответственный» и мёртвый путь смены владельца (TODO-177).
     */
    it('apiGetMembers шлёт projectId: из стора по умолчанию и явный — в приоритете', async () => {
        const { apiGetMembers } = await import('./CrmService')
        const { useProjectStore } = await import('@/store/projectStore')
        useProjectStore.setState({ currentProjectId: 'p-store' })

        await apiGetMembers()
        expect(calls[0].url).toBe('/v1/members')
        expect(calls[0].params).toMatchObject({ projectId: 'p-store' })

        await apiGetMembers({ projectId: 'p-explicit' })
        expect(calls[1].params).toMatchObject({ projectId: 'p-explicit' })
    })

    it('apiExportContacts зовёт серверную ручку экспорта blob-ом и не выдумывает фильтры', async () => {
        const { apiExportContacts } = await import('./CrmService')
        await apiExportContacts({ projectId: 'p1', format: 'csv', query: 'ив' })

        expect(calls[0].url).toBe('/v1/contacts/export')
        expect(calls[0].method).toBe('get')
        expect(calls[0].responseType).toBe('blob')
        // Ручка gateway принимает ровно projectId/format/query.
        expect(calls[0].params).toEqual({ projectId: 'p1', format: 'csv', query: 'ив' })
    })

    it('apiExportContacts не шлёт пустой query', async () => {
        const { apiExportContacts } = await import('./CrmService')
        await apiExportContacts({ projectId: 'p1' })

        expect(calls[0].params).toEqual({ projectId: 'p1', format: 'csv' })
    })

    /**
     * responseType:'blob' распространяется и на тело ОШИБКИ: конверт
     * `{ error: { message } }` приезжал Blob-ом, extractApiError его не видел, и
     * отказ сервера («выборка больше потолка выгрузки», 403) показывался
     * пользователю как безликое «Произошла ошибка».
     */
    it('apiExportContacts разворачивает blob-тело ошибки в читаемый конверт', async () => {
        const { apiExportContacts } = await import('./CrmService')
        const response = {
            status: 400,
            data: new Blob([
                JSON.stringify({
                    error: { code: 'BAD_REQUEST', message: 'под выгрузку попало 50001 контактов' },
                }),
            ]),
        }
        nextRejection = { response }

        await expect(apiExportContacts({ projectId: 'p1' })).rejects.toMatchObject({
            response: {
                status: 400,
                data: { error: { message: 'под выгрузку попало 50001 контактов' } },
            },
        })
    })

    it('apiExportContacts не падает, если тело ошибки — не JSON', async () => {
        const { apiExportContacts } = await import('./CrmService')
        nextRejection = { message: 'Network Error', response: { data: new Blob(['<html>']) } }

        await expect(apiExportContacts({ projectId: 'p1' })).rejects.toMatchObject({
            message: 'Network Error',
        })
    })

    /**
     * TODO-161 — откат слияния. Маршрут `POST /v1/contacts/:id/unmerge` был на
     * шлюзе, но клиента у него не было вовсе: домен умел откатывать, а до
     * пользователя это не доходило.
     */
    it('apiUnmergeContact бьёт в POST /v1/contacts/:id/unmerge по id ДОНОРА', async () => {
        const { apiUnmergeContact } = await import('./CrmService')
        await apiUnmergeContact('src-1', { projectId: 'p1' })

        expect(calls[0].url).toBe('/v1/contacts/src-1/unmerge')
        expect(calls[0].method).toBe('post')
        expect(calls[0].params).toEqual({ projectId: 'p1' })
    })

    it('apiGetContact разворачивает merged_sources: snake_case и epoch ms → камель и unix seconds', async () => {
        const { apiGetContact } = await import('./CrmService')
        const mergedAtMs = 1_755_000_000_000
        nextResponse = {
            id: 'c1',
            first_name: 'Мастер',
            merged_sources: [
                {
                    id: 'src-1',
                    first_name: 'Иван',
                    last_name: 'Донор',
                    middle_name: 'П',
                    email: 'src@x.ru',
                    phone: '+79001112233',
                    merged_at: mergedAtMs,
                    unmerge_until: mergedAtMs + 30 * 24 * 60 * 60 * 1000,
                },
            ],
        }

        const contact = await apiGetContact<{
            mergedSources: {
                id: string
                lastName: string
                mergedAt: number
                unmergeUntil: number
            }[]
        }>('c1', { projectId: 'p1' })

        expect(contact.mergedSources).toHaveLength(1)
        expect(contact.mergedSources[0]).toMatchObject({ id: 'src-1', lastName: 'Донор' })
        // dayjs.unix() в карточке ждёт СЕКУНДЫ — иначе «слит 09.02.57612».
        expect(contact.mergedSources[0].mergedAt).toBe(Math.floor(mergedAtMs / 1000))
        expect(
            contact.mergedSources[0].unmergeUntil - contact.mergedSources[0].mergedAt,
        ).toBe(30 * 24 * 60 * 60)
    })

    /**
     * Корзина: домен пишет `deletedAt`/`purgeAt` как `Date.getTime()` в `int64`,
     * gateway-loader с `longs: Number` отдаёт их числом МИЛЛИСЕКУНД, а
     * `ContactTrash` рендерит через `dayjs.unix()`. Без деления на 1000 колонка
     * «Удалён» показывала 57-е тысячелетие, а «до автоочистки» — миллионы дней.
     */
    it('apiGetTrashedContacts переводит deletedAt/purgeAt из epoch ms в unix seconds', async () => {
        const { apiGetTrashedContacts } = await import('./CrmService')
        const deletedAtMs = 1_755_000_000_000
        const purgeAtMs = deletedAtMs + 7 * 24 * 60 * 60 * 1000
        nextResponse = {
            list: [{ id: 'c1', first_name: 'Иван', deletedAt: deletedAtMs, purgeAt: purgeAtMs }],
            total: 1,
        }

        const data = await apiGetTrashedContacts({ projectId: 'p1' })

        expect(calls[0].params).toMatchObject({ projectId: 'p1', state: 'trashed' })
        expect(data.list[0].deletedAt).toBe(Math.floor(deletedAtMs / 1000))
        expect(data.list[0].purgeAt).toBe(Math.floor(purgeAtMs / 1000))
        // Остаток до автоочистки — ровно 7 суток, а не миллионы дней.
        expect((data.list[0].purgeAt as number) - (data.list[0].deletedAt as number)).toBe(
            7 * 24 * 60 * 60,
        )
    })

    it('apiGetTrashedContacts терпит ISO-строку и не выдаёт 0/null за дату', async () => {
        const { apiGetTrashedContacts } = await import('./CrmService')
        nextResponse = {
            list: [
                { id: 'c1', deletedAt: '2025-08-12T12:00:00.000Z', purgeAt: null },
                { id: 'c2', deletedAt: 0, purgeAt: 0 },
            ],
            total: 2,
        }

        const data = await apiGetTrashedContacts({ projectId: 'p1' })

        expect(data.list[0].deletedAt).toBe(Math.floor(Date.parse('2025-08-12T12:00:00.000Z') / 1000))
        expect(data.list[0].purgeAt).toBeUndefined()
        expect(data.list[1].deletedAt).toBeUndefined()
        expect(data.list[1].purgeAt).toBeUndefined()
    })

    it('apiReassignContacts бьёт в POST /v1/contacts/reassign (единственный путь смены владельца)', async () => {
        const { apiReassignContacts } = await import('./CrmService')
        await apiReassignContacts({ contactIds: ['c1'], newOwnerId: 'u2' }, { projectId: 'p1' })

        expect(calls[0].url).toBe('/v1/contacts/reassign')
        expect(calls[0].method).toBe('post')
        expect(calls[0].data).toEqual({ contactIds: ['c1'], newOwnerId: 'u2' })
    })
})
