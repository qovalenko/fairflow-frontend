import { describe, it, expect } from 'vitest'
import { dealsDisableCascadeMessage } from './dealsDisableCascadeMessage'

describe('dealsDisableCascadeMessage', () => {
    it('lists cascade modules and open deal count', () => {
        const msg = dealsDisableCascadeMessage(
            [
                { id: 'orders', name: 'Продажи' },
                { id: 'activities', name: 'Активности' },
            ],
            5,
        )
        expect(msg).toContain('Продажи')
        expect(msg).toContain('Активности')
        expect(msg).toContain('5 незавершённых')
    })

    it('degrades when count is unavailable', () => {
        const msg = dealsDisableCascadeMessage([{ id: 'orders', name: 'Продажи' }], null)
        expect(msg).toContain('число не загрузилось')
    })
})
