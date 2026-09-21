import { describe, it, expect } from 'vitest'
import {
    KANBAN_BASE_SLICE_LIMIT,
    KANBAN_TAIL_PAGE_SIZE,
    kanbanTailFetchDone,
    kanbanTailPageIndex,
} from './dealKanbanPaging'

/**
 * FR-SEARCH-385 — tail page index must stay aligned with the kanban base slice (50)
 * while fetching 20-card pages from the list endpoint.
 */
describe('kanbanTailPageIndex', () => {
    it('returns 0 for an empty column', () => {
        expect(kanbanTailPageIndex(0)).toBe(0)
    })

    it('continues after the 50-card kanban base without skipping rows', () => {
        expect(kanbanTailPageIndex(KANBAN_BASE_SLICE_LIMIT)).toBe(2)
    })

    it('steps by 20-card windows', () => {
        expect(kanbanTailPageIndex(20)).toBe(1)
        expect(kanbanTailPageIndex(40)).toBe(2)
        expect(kanbanTailPageIndex(60)).toBe(3)
    })
})

describe('kanbanTailFetchDone', () => {
    it('stops when the server returns a short page', () => {
        expect(kanbanTailFetchDone(19, 50)).toBe(true)
    })

    it('stops when the known total is reached', () => {
        expect(kanbanTailFetchDone(20, 100, 100)).toBe(true)
    })

    it('continues when a full page remains below total', () => {
        expect(kanbanTailFetchDone(20, 60, 100)).toBe(false)
    })
})
