import type { Key, useSWRConfig } from 'swr'

type GlobalMutate = ReturnType<typeof useSWRConfig>['mutate']

/**
 * FR-PROJ-380: drop SWR entries keyed with the previous project id so a switch
 * does not briefly surface stale module/permission/dashboard data.
 */
export async function invalidateProjectSwitchCaches(
    mutate: GlobalMutate,
    previousProjectId?: string | null,
): Promise<void> {
    if (!previousProjectId) return

    const matchesPrevious = (key: Key): boolean => {
        if (Array.isArray(key)) {
            return key.some((part) => part === previousProjectId)
        }
        if (typeof key === 'string') {
            return key.includes(previousProjectId)
        }
        return false
    }

    await mutate(matchesPrevious, undefined, { revalidate: false })
}
