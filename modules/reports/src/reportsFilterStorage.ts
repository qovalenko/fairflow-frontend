/** Дублируем union из ReportsService, чтобы модуль не тянул host-алиас в unit-тестах. */
export type ReportsRunPeriod =
    | 'today'
    | 'week'
    | 'month'
    | 'quarter'
    | 'year'
    | 'custom'

/** FR-REPORTS-180: последний период и воронка per-project в localStorage. */
export const REPORTS_FILTER_STORAGE_PREFIX = 'ff.reports.filters.'

/** `custom` без from/to ломает прогон — в селекторе его нет, из persist не поднимаем. */
const VALID_PERIODS = new Set<ReportsRunPeriod>([
    'today',
    'week',
    'month',
    'quarter',
    'year',
])

export const DEFAULT_REPORTS_PERIOD: ReportsRunPeriod = 'month'

export interface ReportsFilterPrefs {
    period?: ReportsRunPeriod
    /** pipelineId по ключу вкладки-пресета (sales, funnel, …). */
    pipelines?: Record<string, string>
}

export function reportsFilterStorageKey(projectId: string): string {
    return REPORTS_FILTER_STORAGE_PREFIX + projectId
}

export function loadReportsFilters(
    projectId: string | null | undefined,
): ReportsFilterPrefs {
    if (!projectId || typeof localStorage === 'undefined') return {}
    try {
        const raw = localStorage.getItem(reportsFilterStorageKey(projectId))
        if (!raw) return {}
        const parsed = JSON.parse(raw) as ReportsFilterPrefs
        const result: ReportsFilterPrefs = {}
        if (parsed.period && VALID_PERIODS.has(parsed.period)) {
            result.period = parsed.period
        }
        if (parsed.pipelines && typeof parsed.pipelines === 'object') {
            const pipelines: Record<string, string> = {}
            for (const [tab, pipeline] of Object.entries(parsed.pipelines)) {
                if (typeof pipeline === 'string') {
                    pipelines[tab] = pipeline
                }
            }
            if (Object.keys(pipelines).length > 0) {
                result.pipelines = pipelines
            }
        }
        return result
    } catch {
        return {}
    }
}

export function saveReportsFilters(
    projectId: string | null | undefined,
    prefs: ReportsFilterPrefs,
): void {
    if (!projectId || typeof localStorage === 'undefined') return
    try {
        localStorage.setItem(
            reportsFilterStorageKey(projectId),
            JSON.stringify(prefs),
        )
    } catch {
        // quota / private mode — не ломаем экран
    }
}

export function mergeReportsFilters(
    projectId: string | null | undefined,
    patch: ReportsFilterPrefs,
): void {
    if (!projectId) return
    const existing = loadReportsFilters(projectId)
    saveReportsFilters(projectId, {
        period: patch.period ?? existing.period,
        pipelines: { ...existing.pipelines, ...patch.pipelines },
    })
}

/** Синхронное чтение для гидратации UI до первого RunReport. */
export function reportsFiltersForTab(
    projectId: string | null | undefined,
    tab: string,
): { period: ReportsRunPeriod; pipelineId: string } {
    const prefs = loadReportsFilters(projectId)
    return {
        period: prefs.period ?? DEFAULT_REPORTS_PERIOD,
        pipelineId: prefs.pipelines?.[tab] ?? '',
    }
}
