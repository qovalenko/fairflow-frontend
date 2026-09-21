import { describe, it, expect, beforeEach } from 'vitest'
import {
    hasProjectSwitchDirtyState,
    useProjectSwitchDirtyStore,
} from './projectSwitchDirtyStore'

describe('projectSwitchDirtyStore (FR-SHELL-190)', () => {
    beforeEach(() => {
        useProjectSwitchDirtyStore.getState().clearAll()
    })

    it('tracks dirty registrations', () => {
        expect(hasProjectSwitchDirtyState()).toBe(false)
        useProjectSwitchDirtyStore.getState().registerDirty('form-a', true)
        expect(hasProjectSwitchDirtyState()).toBe(true)
        useProjectSwitchDirtyStore.getState().registerDirty('form-a', false)
        expect(hasProjectSwitchDirtyState()).toBe(false)
    })
})
