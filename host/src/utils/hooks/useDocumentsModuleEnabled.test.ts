import { describe, it, expect } from 'vitest'
import { getEnabledModules } from '@/store/projectStore'

describe('useDocumentsModuleEnabled premise (FR-DOCS-290)', () => {
    it('documents tab visible only when module enabled in project', () => {
        expect(
            getEnabledModules({
                id: 'p1',
                name: 'P',
                enabledModules: ['deals', 'documents'],
            }).includes('documents'),
        ).toBe(true)
        expect(
            getEnabledModules({
                id: 'p1',
                name: 'P',
                enabledModules: ['deals'],
            }).includes('documents'),
        ).toBe(false)
    })
})
