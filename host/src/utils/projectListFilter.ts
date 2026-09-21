/** FR-PROJ-390: search/filter appears when the user has more than this many projects. */
export const PROJECT_LIST_SEARCH_THRESHOLD = 5

export type ProjectSearchable = { name: string }

/** Case-insensitive filter by project name; empty query returns all items. */
export function filterProjectsByQuery<T extends ProjectSearchable>(
    projects: T[],
    query: string,
): T[] {
    const needle = query.trim().toLowerCase()
    if (!needle) return projects
    return projects.filter((p) => p.name.toLowerCase().includes(needle))
}

export function shouldShowProjectSearch(projectCount: number): boolean {
    return projectCount > PROJECT_LIST_SEARCH_THRESHOLD
}
