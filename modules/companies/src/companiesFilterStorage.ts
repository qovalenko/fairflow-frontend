/** FR-COMPANIES-280: persist «Только мои» per-project (паттерн reportsFilterStorage). */
export const COMPANIES_FILTER_STORAGE_PREFIX = 'ff.companies.filters.'

export interface CompaniesFilterPrefs {
    onlyMine?: boolean
}

export function companiesFilterStorageKey(projectId: string): string {
    return COMPANIES_FILTER_STORAGE_PREFIX + projectId
}

export function loadCompaniesFilters(
    projectId: string | null | undefined,
): CompaniesFilterPrefs {
    if (!projectId || typeof localStorage === 'undefined') return {}
    try {
        const raw = localStorage.getItem(companiesFilterStorageKey(projectId))
        if (!raw) return {}
        const parsed = JSON.parse(raw) as CompaniesFilterPrefs
        return typeof parsed.onlyMine === 'boolean' ? { onlyMine: parsed.onlyMine } : {}
    } catch {
        return {}
    }
}

export function saveCompaniesFilters(
    projectId: string | null | undefined,
    prefs: CompaniesFilterPrefs,
): void {
    if (!projectId || typeof localStorage === 'undefined') return
    try {
        localStorage.setItem(companiesFilterStorageKey(projectId), JSON.stringify(prefs))
    } catch {
        // quota / private mode
    }
}

export function mergeCompaniesOnlyMine(
    projectId: string | null | undefined,
    onlyMine: boolean,
): void {
    if (!projectId) return
    const existing = loadCompaniesFilters(projectId)
    saveCompaniesFilters(projectId, { ...existing, onlyMine })
}

export function companiesOnlyMineForProject(projectId: string | null | undefined): boolean {
    return loadCompaniesFilters(projectId).onlyMine ?? false
}
