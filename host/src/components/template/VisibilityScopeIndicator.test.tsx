import { describe, it, expect } from 'vitest'
import { visibilityScopeLabel } from './VisibilityScopeIndicator'

describe('VisibilityScopeIndicator (FR-SHELL-110)', () => {
    it('maps projection scope levels to user-facing labels', () => {
        expect(
            visibilityScopeLabel({ mode: 'hierarchy', level: 'only_own', selfId: 'u1' }),
        ).toContain('только мои');
    })
})
