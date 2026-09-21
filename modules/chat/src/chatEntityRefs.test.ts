import { describe, it, expect } from 'vitest'
import {
    serializeEntityRef,
    parseMessageSegments,
    entityRoutePath,
    ENTITY_TYPE_LABELS,
} from './chatEntityRefs'

describe('chatEntityRefs', () => {
    it('serializeEntityRef: токен с label', () => {
        expect(
            serializeEntityRef({ type: 'deal', id: 'd1', label: 'Сделка №1' }),
        ).toBe('[[entity:deal:d1|Сделка №1]]')
    })

    it('serializeEntityRef: пустой label → дефолт по типу', () => {
        expect(serializeEntityRef({ type: 'contact', id: 'c1', label: '' })).toContain(
            ENTITY_TYPE_LABELS.contact,
        )
    })

    it('parseMessageSegments: текст + entity + хвост', () => {
        const token = serializeEntityRef({ type: 'company', id: 'co1', label: 'ООО Ромашка' })
        const segments = parseMessageSegments(`Смотри ${token} пожалуйста`)
        expect(segments).toHaveLength(3)
        expect(segments[0]).toEqual({ kind: 'text', text: 'Смотри ' })
        expect(segments[1].kind).toBe('entity')
        if (segments[1].kind === 'entity') {
            expect(segments[1].ref.id).toBe('co1')
        }
        expect(segments[2]).toEqual({ kind: 'text', text: ' пожалуйста' })
    })

    it('entityRoutePath: множественное число сегмента', () => {
        expect(entityRoutePath({ type: 'order', id: 'o9', label: 'x' })).toBe('/orders/o9')
    })
})
