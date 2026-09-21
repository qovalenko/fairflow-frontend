import { describe, it, expect } from 'vitest'
import dayjs from 'dayjs'
import { buildUpdateDealPayload } from './dealUtils'
import type { DealEditForm, DealLinkSnapshot } from './dealUtils'

/**
 * TODO-385 — «снять связь со сделки» из формы редактирования.
 * Тело `PUT /v1/deals/:id` должно совпадать с тем, что домен считает очисткой:
 * UpdateDealRequest 7/8/14/15 объявлены `optional`, и pipe.service.updateDeal
 * пишет пустую строку в contactId/companyId/productId/source, а name/currency/
 * assigneeId по '' игнорирует. Ключ, которого нет в JSON, до домена не доходит
 * вовсе — поэтому «очистил» обязано отличаться от «не менял».
 */
const form = (over: Partial<DealEditForm> = {}): DealEditForm => ({
    name: 'Сделка',
    amount: '1000',
    currency: 'RUB',
    pipelineId: 'pl-1',
    stageId: 'st-1',
    contactId: 'c-1',
    companyId: 'co-1',
    productId: 'p-1',
    source: 'site',
    assigneeId: 'u-1',
    expectedCloseDate: '2026-09-01',
    notes: 'заметка',
    ...over,
})

const snapshot = (over: Partial<DealLinkSnapshot> = {}): DealLinkSnapshot => ({
    contactId: 'c-1',
    companyId: 'co-1',
    productId: 'p-1',
    source: 'site',
    expectedCloseDate: dayjs('2026-09-01').unix(),
    ...over,
})

describe('buildUpdateDealPayload', () => {
    it('шлёт заполненные поля как есть', () => {
        const payload = buildUpdateDealPayload(form(), snapshot(), false)
        expect(payload).toMatchObject({
            name: 'Сделка',
            amount: 1000,
            currency: 'RUB',
            pipelineId: 'pl-1',
            stageId: 'st-1',
            contactId: 'c-1',
            companyId: 'co-1',
            productId: 'p-1',
            source: 'site',
            assigneeId: 'u-1',
            notes: 'заметка',
            expectedCloseDate: dayjs('2026-09-01').unix(),
        })
    })

    it('очищенная связь уходит явной пустой строкой, а не выпадает из тела', () => {
        const payload = buildUpdateDealPayload(
            form({ contactId: '', companyId: '', productId: '', source: '' }),
            snapshot(),
            false,
        )
        expect(payload.contactId).toBe('')
        expect(payload.companyId).toBe('')
        expect(payload.productId).toBe('')
        expect(payload.source).toBe('')
        // Именно наличие ключа отличает очистку от «не трогал».
        expect(Object.keys(payload)).toEqual(
            expect.arrayContaining(['contactId', 'companyId', 'productId', 'source']),
        )
    })

    it('пустое поле, которое и в сделке было пустым, не шлётся вовсе', () => {
        const payload = buildUpdateDealPayload(
            form({ contactId: '', companyId: '', productId: '', source: '' }),
            snapshot({ contactId: '', companyId: undefined, productId: '', source: undefined }),
            false,
        )
        expect('contactId' in payload).toBe(false)
        expect('companyId' in payload).toBe(false)
        expect('productId' in payload).toBe(false)
        expect('source' in payload).toBe(false)
    })

    it('пустые ответственный/воронка/стадия не шлются: домен их по \'\' не снимает', () => {
        const payload = buildUpdateDealPayload(
            form({ assigneeId: '', pipelineId: '', stageId: '', expectedCloseDate: '' }),
            snapshot(),
            false,
        )
        expect('assigneeId' in payload).toBe(false)
        expect('pipelineId' in payload).toBe(false)
        expect('stageId' in payload).toBe(false)
        // Дата была — снятие уходит как 0 (int64 «нет даты»), а не выпадает из тела.
        expect(payload.expectedCloseDate).toBe(0)
    })

    it('пустая дата, которой в сделке не было, не шлётся вовсе', () => {
        const payload = buildUpdateDealPayload(
            form({ expectedCloseDate: '' }),
            snapshot({ expectedCloseDate: 0 }),
            false,
        )
        expect('expectedCloseDate' in payload).toBe(false)
    })

    it('у закрытой сделки уходят только название и заметки (FR-MDEAL-14)', () => {
        const payload = buildUpdateDealPayload(
            form({ contactId: '', source: '' }),
            snapshot(),
            true,
        )
        expect(payload).toEqual({ name: 'Сделка', notes: 'заметка' })
    })

    it('пустая сумма нормализуется в 0, а не в NaN', () => {
        const payload = buildUpdateDealPayload(form({ amount: '' }), snapshot(), false)
        expect(payload.amount).toBe(0)
    })
})
