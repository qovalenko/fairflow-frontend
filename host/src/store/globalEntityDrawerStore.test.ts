import { describe, it, expect, beforeEach } from 'vitest'
import { useGlobalEntityDrawer } from './globalEntityDrawerStore'

describe('globalEntityDrawerStore (global.drawer.entity)', () => {
    beforeEach(() => {
        useGlobalEntityDrawer.getState().close()
    })

    it('open/close colleague drawer context', () => {
        useGlobalEntityDrawer.getState().open('user', 'u-42')

        expect(useGlobalEntityDrawer.getState()).toMatchObject({
            entityType: 'user',
            entityId: 'u-42',
        })

        useGlobalEntityDrawer.getState().close()

        expect(useGlobalEntityDrawer.getState()).toMatchObject({
            entityType: null,
            entityId: null,
        })
    })
})
