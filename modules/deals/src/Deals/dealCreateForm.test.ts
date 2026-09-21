import { describe, it, expect } from 'vitest'
import dayjs from 'dayjs'
import {
    EMPTY_DEAL_FORM,
    buildCreateDealPayload,
    hasLightLeadIdentity,
} from './dealUtils'
import type { DealCreateForm } from './dealUtils'

/**
 * TODO-179 / FR-DEALS-010 — «лид без контакта» из формы создания сделки.
 * Тело запроса должно совпадать с тем, что принимает BFF
 * `POST /v1/deals` (crm-bff.controller.ts createDeal → CreateDealRequest 15..18):
 * lightName / lightPhone / lightEmail / lightCompanyName.
 */
const form = (over: Partial<DealCreateForm> = {}): DealCreateForm => ({
    ...EMPTY_DEAL_FORM,
    name: 'Заявка с сайта',
    ...over,
})

describe('buildCreateDealPayload', () => {
    it('в режиме «лид» шлёт light*-поля и НЕ шлёт связи с контактом/компанией', () => {
        const payload = buildCreateDealPayload(
            form({
                contactId: 'c1',
                companyId: 'co1',
                lightName: 'Иван Петров',
                lightPhone: '+7 999 000-00-00',
                lightEmail: 'ivan@example.com',
                lightCompanyName: 'ООО Ромашка',
            }),
            'light',
        )

        expect(payload).toMatchObject({
            name: 'Заявка с сайта',
            lightName: 'Иван Петров',
            lightPhone: '+7 999 000-00-00',
            lightEmail: 'ivan@example.com',
            lightCompanyName: 'ООО Ромашка',
        })
        expect(payload.contactId).toBeUndefined()
        expect(payload.companyId).toBeUndefined()
    })

    it('обрезает пробелы и не шлёт пустые light*-поля', () => {
        const payload = buildCreateDealPayload(
            form({ lightName: '  Иван  ', lightPhone: '   ', lightEmail: '' }),
            'light',
        )

        expect(payload.lightName).toBe('Иван')
        expect('lightPhone' in payload).toBe(false)
        expect('lightEmail' in payload).toBe(false)
        expect('lightCompanyName' in payload).toBe(false)
    })

    it('в режиме «контакт» шлёт contactId/companyId и НЕ шлёт light*', () => {
        const payload = buildCreateDealPayload(
            form({ contactId: 'c1', companyId: 'co1', lightName: 'Иван' }),
            'contact',
        )

        expect(payload).toMatchObject({ contactId: 'c1', companyId: 'co1' })
        expect('lightName' in payload).toBe(false)
    })

    it('переносит остальные поля формы: сумму, воронку, стадию, продукт, дату', () => {
        const payload = buildCreateDealPayload(
            form({
                amount: '150000',
                pipelineId: 'pl1',
                stageId: 's1',
                productId: 'p1',
                source: 'Сайт',
                assigneeId: 'u1',
                expectedCloseDate: '2026-09-01',
            }),
            'contact',
        )

        expect(payload).toMatchObject({
            amount: 150000,
            pipelineId: 'pl1',
            stageId: 's1',
            productId: 'p1',
            source: 'Сайт',
            assigneeId: 'u1',
            expectedCloseDate: dayjs('2026-09-01').unix(),
        })
    })

    it('пустая сумма уходит нулём, пустые селекты не уходят вовсе', () => {
        const payload = buildCreateDealPayload(form(), 'contact')

        expect(payload.amount).toBe(0)
        expect(Object.keys(payload).sort()).toEqual(['amount', 'name'])
    })
})

describe('hasLightLeadIdentity', () => {
    it('лид опознаваем по имени, телефону или почте', () => {
        expect(hasLightLeadIdentity({ lightName: 'Иван', lightPhone: '', lightEmail: '' })).toBe(true)
        expect(hasLightLeadIdentity({ lightName: '', lightPhone: '+7999', lightEmail: '' })).toBe(true)
        expect(hasLightLeadIdentity({ lightName: '', lightPhone: '', lightEmail: 'a@b.c' })).toBe(true)
    })

    it('пробелы за заполнение не считаются — квалифицировать такой лид нечем', () => {
        expect(hasLightLeadIdentity({ lightName: '  ', lightPhone: '', lightEmail: '' })).toBe(false)
        expect(hasLightLeadIdentity({ lightName: '', lightPhone: '', lightEmail: '' })).toBe(false)
    })
})
