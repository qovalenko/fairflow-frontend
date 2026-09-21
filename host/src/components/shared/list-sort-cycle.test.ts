import { describe, expect, it } from 'vitest'
import { nextColumnSortState } from './list-sort-cycle'

describe('nextColumnSortState (FR-SEARCH-375 / EL-LISTF-3)', () => {
    it('цикл: нет → asc → desc → сброс', () => {
        expect(nextColumnSortState(false)).toBe('asc')
        expect(nextColumnSortState('asc')).toBe('desc')
        expect(nextColumnSortState('desc')).toBe(false)
    })
})
