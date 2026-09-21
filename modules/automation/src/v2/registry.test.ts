import { describe, expect, it } from 'vitest'
import {
    actionIsExternal,
    findNodeDef,
    FALLBACK_REGISTRY,
    registryFromLegacy,
    triggerLabel,
} from './registry'

describe('registry helpers', () => {
    it('registryFromLegacy маппит triggers и actions', () => {
        const reg = registryFromLegacy({
            triggers: [
                {
                    id: 'crm.deal.created',
                    eventName: 'Сделка создана',
                    requiredModule: '',
                    entityType: 'deal',
                },
            ],
            actions: [{ id: 'create_task', externalEffect: false, requiredModule: '' }],
        })
        expect(reg.triggers[0].label).toBe('Сделка создана')
        expect(reg.actions[0].id).toBe('create_task')
        expect(reg.conditions.length).toBeGreaterThan(0)
    })

    it('findNodeDef находит тип по kind и id', () => {
        const def = findNodeDef(FALLBACK_REGISTRY, 'trigger', 'crm.deal.created')
        expect(def?.label).toBe('Сделка создана')
    })

    it('actionIsExternal определяет внешний эффект', () => {
        expect(actionIsExternal(FALLBACK_REGISTRY, 'send_email')).toBe(true)
        expect(actionIsExternal(FALLBACK_REGISTRY, 'create_task')).toBe(false)
    })

    it('triggerLabel возвращает label или id', () => {
        expect(triggerLabel(FALLBACK_REGISTRY, 'crm.deal.created')).toBe('Сделка создана')
        expect(triggerLabel(FALLBACK_REGISTRY, 'unknown.event')).toBe('unknown.event')
    })
})
