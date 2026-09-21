/** Cards materialised per column by `GetDealsKanban` (backend KANBAN_COLUMN_LIMIT). */
export const KANBAN_BASE_SLICE_LIMIT = 50

/** FR-SEARCH-385 / FR-MSRCH-13: tail loads fetch this many cards per scroll. */
export const KANBAN_TAIL_PAGE_SIZE = 20

/**
 * Page index for the list endpoint that continues a kanban column slice.
 * The kanban base may be 50 cards while tails are 20 — skip is aligned via
 * floor(loaded/pageSize) and duplicate ids are dropped client-side.
 */
export function kanbanTailPageIndex(loadedCount: number): number {
    if (loadedCount <= 0) return 0
    return Math.floor(loadedCount / KANBAN_TAIL_PAGE_SIZE)
}

/** Whether another tail page is likely available after a fetch. */
export function kanbanTailFetchDone(
    incomingLength: number,
    loadedCount: number,
    total?: number,
): boolean {
    if (incomingLength < KANBAN_TAIL_PAGE_SIZE) return true
    if (typeof total === 'number' && loadedCount >= total) return true
    return false
}
