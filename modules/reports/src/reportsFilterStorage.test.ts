import { describe, it, expect, beforeEach } from 'vitest'
import {
    DEFAULT_REPORTS_PERIOD,
    REPORTS_FILTER_STORAGE_PREFIX,
    loadReportsFilters,
    mergeReportsFilters,
    reportsFilterStorageKey,
    reportsFiltersForTab,
    saveReportsFilters,
} from './reportsFilterStorage'

describe('reportsFilterStorage (FR-REPORTS-180)', () => {
    const projectId = 'proj-1'

    beforeEach(() => {
        localStorage.clear()
    })

    it('возвращает пустые prefs без projectId', () => {
        expect(loadReportsFilters(undefined)).toEqual({})
        expect(loadReportsFilters(null)).toEqual({})
    })

    it('сохраняет и восстанавливает период', () => {
        saveReportsFilters(projectId, { period: 'quarter' })
        expect(loadReportsFilters(projectId)).toEqual({ period: 'quarter' })
        expect(localStorage.getItem(reportsFilterStorageKey(projectId))).toContain(
            '"quarter"',
        )
    })

    it('сохраняет воронку per-tab и merge не затирает другие вкладки', () => {
        mergeReportsFilters(projectId, {
            pipelines: { sales: 'pipe-a' },
        })
        mergeReportsFilters(projectId, {
            pipelines: { funnel: 'pipe-b' },
        })
        expect(loadReportsFilters(projectId)).toEqual({
            pipelines: { sales: 'pipe-a', funnel: 'pipe-b' },
        })
    })

    it('игнорирует битый JSON и невалидный период', () => {
        localStorage.setItem(
            reportsFilterStorageKey(projectId),
            '{"period":"bogus","pipelines":{"sales":42}}',
        )
        expect(loadReportsFilters(projectId)).toEqual({})
    })

    it('ключ изолирован по проекту', () => {
        saveReportsFilters('p1', { period: 'week' })
        saveReportsFilters('p2', { period: 'year' })
        expect(loadReportsFilters('p1').period).toBe('week')
        expect(loadReportsFilters('p2').period).toBe('year')
        expect(REPORTS_FILTER_STORAGE_PREFIX).toBe('ff.reports.filters.')
    })

    it('reportsFiltersForTab читает период и воронку вкладки синхронно', () => {
        saveReportsFilters(projectId, {
            period: 'quarter',
            pipelines: { sales: 'pipe-a', funnel: 'pipe-b' },
        })
        expect(reportsFiltersForTab(projectId, 'sales')).toEqual({
            period: 'quarter',
            pipelineId: 'pipe-a',
        })
        expect(reportsFiltersForTab(projectId, 'clients')).toEqual({
            period: 'quarter',
            pipelineId: '',
        })
        expect(reportsFiltersForTab(undefined, 'sales')).toEqual({
            period: DEFAULT_REPORTS_PERIOD,
            pipelineId: '',
        })
    })

    it('не поднимает period=custom без дат', () => {
        localStorage.setItem(
            reportsFilterStorageKey(projectId),
            '{"period":"custom","pipelines":{"sales":"pipe-a"}}',
        )
        expect(loadReportsFilters(projectId)).toEqual({
            pipelines: { sales: 'pipe-a' },
        })
        expect(reportsFiltersForTab(projectId, 'sales').period).toBe(
            DEFAULT_REPORTS_PERIOD,
        )
    })

    it('возвращает пустые prefs при синтаксической ошибке JSON', () => {
        localStorage.setItem(reportsFilterStorageKey(projectId), '{broken')
        expect(loadReportsFilters(projectId)).toEqual({})
    })

    it('saveReportsFilters не падает при ошибке localStorage', () => {
        const setItem = vi
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(() => {
                throw new Error('QuotaExceededError')
            })
        expect(() => saveReportsFilters(projectId, { period: 'week' })).not.toThrow()
        setItem.mockRestore()
    })

    it('saveReportsFilters и mergeReportsFilters — no-op без projectId', () => {
        saveReportsFilters(null, { period: 'week' })
        mergeReportsFilters(undefined, { period: 'year' })
        expect(localStorage.length).toBe(0)
    })
})
