import { describe, it, expect, beforeEach } from 'vitest'
import {
    companiesFilterStorageKey,
    companiesOnlyMineForProject,
    mergeCompaniesOnlyMine,
} from './companiesFilterStorage'

describe('companiesFilterStorage (FR-COMPANIES-280)', () => {
    const projectId = 'proj-companies-1'

    beforeEach(() => {
        localStorage.clear()
    })

    it('persists onlyMine per project', () => {
        expect(companiesOnlyMineForProject(projectId)).toBe(false)
        mergeCompaniesOnlyMine(projectId, true)
        expect(localStorage.getItem(companiesFilterStorageKey(projectId))).toContain('"onlyMine":true')
        expect(companiesOnlyMineForProject(projectId)).toBe(true)
        mergeCompaniesOnlyMine(projectId, false)
        expect(companiesOnlyMineForProject(projectId)).toBe(false)
    })
})
