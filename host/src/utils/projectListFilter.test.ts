import { describe, it, expect } from 'vitest'
import {
    filterProjectsByQuery,
    shouldShowProjectSearch,
    PROJECT_LIST_SEARCH_THRESHOLD,
} from './projectListFilter'

describe('projectListFilter (FR-PROJ-390)', () => {
    const projects = [
        { name: 'Alpha Sales' },
        { name: 'Beta Support' },
        { name: 'Gamma Delivery' },
    ]

    it('shows search when project count exceeds threshold', () => {
        expect(shouldShowProjectSearch(PROJECT_LIST_SEARCH_THRESHOLD)).toBe(false)
        expect(shouldShowProjectSearch(PROJECT_LIST_SEARCH_THRESHOLD + 1)).toBe(true)
    })

    it('filters projects by name case-insensitively', () => {
        expect(filterProjectsByQuery(projects, 'beta')).toEqual([
            { name: 'Beta Support' },
        ])
        expect(filterProjectsByQuery(projects, '')).toEqual(projects)
    })
})
