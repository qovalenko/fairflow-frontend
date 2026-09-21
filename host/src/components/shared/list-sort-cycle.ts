/** EL-LISTF-3 / FR-SEARCH-375: asc → desc → сброс на дефолт. */
export type ColumnSortState = false | 'asc' | 'desc'

export function nextColumnSortState(current: ColumnSortState): ColumnSortState {
    if (current === false) return 'asc'
    if (current === 'asc') return 'desc'
    return false
}
