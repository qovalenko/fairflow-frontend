/**
 * `nav.item.badge` is mounted once per menu row. Only the contribution whose
 * module owns that row should load — otherwise every item flashes the slot
 * Suspense fallback and keeps an empty `ml-auto` wrapper.
 */
export function contributionForNavItem<
    T extends { key: string; moduleId: string; wired: boolean },
>(contributions: readonly T[], moduleKey?: string): T | undefined {
    if (!moduleKey) return undefined
    return contributions.find((c) => c.wired && c.moduleId === moduleKey)
}
