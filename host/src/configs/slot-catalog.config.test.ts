import { describe, it, expect } from 'vitest'
import {
    SLOT_CATALOG,
    getSlotDescriptor,
    isKnownSlot,
    rejectSlotContribution,
} from './slot-catalog.config'

/**
 * TODO-103 / OQ-MODULE-130 (дефект SLOT-2).
 *
 * `project.settings.tab` стоял с `accessKind:'system'`, а канон-карта вкладчиков
 * (`archive/notes/ux/00-foundation/06-slot-map.md:101-108`) назначает вкладчиками
 * этого слота business-модули (deals, orders, contacts, products, documents,
 * search). Пока слот был системным, механика «модуль приносит свою вкладку
 * настроек» была невыразима: любой вклад отбраковывался `SYSTEM_SLOT_FORBIDDEN`,
 * и `SearchSettingsTab` оставался недостижим при полностью готовых host-рендере,
 * экспозе и федерации.
 *
 * Решение: `accessKind:'open'`, гейт — право `project:manage` (оно же гейт
 * серверных эндпоинтов настроек модуля). Тест фиксирует и решение, и то, что
 * изоляция партнёра в `host-only`-слотах от него НЕ пострадала.
 */
describe('SLOT_CATALOG — project.settings.tab (OQ-MODULE-130)', () => {
    const descriptor = () => getSlotDescriptor('project.settings.tab')

    it('слот есть в каталоге и не зарезервирован', () => {
        expect(isKnownSlot('project.settings.tab')).toBe(true)
        expect(descriptor()?.reserved).toBeUndefined()
    })

    it('открыт для вкладов и гейтится правом project:manage', () => {
        expect(descriptor()).toMatchObject({
            accessKind: 'open',
            requires: 'project:manage',
            contextProps: ['projectId'],
        })
    })

    it.each(['business', 'system', 'partner'] as const)(
        'вклад модуля kind=%s принимается (гейт — право, не вид модуля)',
        (kind) => {
            expect(rejectSlotContribution('project.settings.tab', kind)).toBeNull()
        },
    )
})

describe('SLOT_CATALOG — отбраковка вкладов не ослаблена', () => {
    it('host-only слоты по-прежнему закрыты для business/partner', () => {
        for (const slot of ['shell.header.action', 'account.menu.item']) {
            expect(rejectSlotContribution(slot, 'business')).toBe(
                'HOST_ONLY_SLOT_FORBIDDEN',
            )
            expect(rejectSlotContribution(slot, 'partner')).toBe(
                'HOST_ONLY_SLOT_FORBIDDEN',
            )
            expect(rejectSlotContribution(slot, 'system')).toBeNull()
        }
    })

    it('зарезервированные слоты отбраковываются любому виду модуля', () => {
        for (const d of SLOT_CATALOG.filter((s) => s.reserved)) {
            expect(rejectSlotContribution(d.slot, 'system')).toBe('SLOT_RESERVED')
        }
    })

    it('неизвестный слот отбраковывается', () => {
        expect(rejectSlotContribution('project.settings.tabs', 'system')).toBe(
            'UNKNOWN_SLOT',
        )
    })

    it('ни один активный слот не требует kind:"system" без host-only-обоснования', () => {
        // После OQ-MODULE-130 `accessKind:'system'` не используется ни одним
        // слотом каталога; тип и код `SYSTEM_SLOT_FORBIDDEN` сохранены как часть
        // контракта под будущие слоты. Тест ловит молчаливый возврат старого
        // значения — он сразу снова сделал бы вкладки настроек недостижимыми.
        expect(SLOT_CATALOG.filter((s) => s.accessKind === 'system')).toEqual([])
    })
})
