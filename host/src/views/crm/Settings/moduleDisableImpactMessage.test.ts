import { describe, expect, it } from 'vitest'
import { moduleDisableImpactMessage } from './moduleDisableImpactMessage'

describe('moduleDisableImpactMessage', () => {
    it('describes dependents, unfinished count and automations', () => {
        const msg = moduleDisableImpactMessage(
            'Сделки',
            [{ id: 'orders', name: 'Продажи' }],
            3,
            [{ id: 'r1', name: 'Напоминание' }],
        )
        expect(msg).toContain('Продажи')
        expect(msg).toContain('3 незавершённых')
        expect(msg).toContain('Напоминание')
    })

    it('handles unknown unfinished count', () => {
        const msg = moduleDisableImpactMessage('Контакты', [], -1, [])
        expect(msg).toContain('неизвестно')
    })

    it('mentions webhook/DLQ pause for automation (FR-SHELL-160)', () => {
        const msg = moduleDisableImpactMessage('Автоматизация', [], 0, [], true)
        expect(msg).toContain('webhook')
        expect(msg).toContain('не возобновятся автоматически')
    })
})
