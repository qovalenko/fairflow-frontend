import { beforeEach, describe, expect, it } from 'vitest'
import { useUnsavedChangesStore } from './unsavedChangesStore'
import { hasUnsavedChanges } from '@/utils/hooks/useUnsavedChangesGuard'

describe('unsavedChangesStore (FR-PROJ-380)', () => {
    beforeEach(() => {
        useUnsavedChangesStore.setState({ scopes: new Set() })
    })

    it('is clean until a scope is marked dirty', () => {
        expect(hasUnsavedChanges()).toBe(false)
        useUnsavedChangesStore.getState().markDirty('profile')
        expect(hasUnsavedChanges()).toBe(true)
    })

    it('clears a scope without dropping other dirty scopes', () => {
        const { markDirty, clearDirty } = useUnsavedChangesStore.getState()
        markDirty('profile')
        markDirty('abac:p1')
        clearDirty('profile')
        expect(hasUnsavedChanges()).toBe(true)
        clearDirty('abac:p1')
        expect(hasUnsavedChanges()).toBe(false)
    })
})
