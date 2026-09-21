import { useCallback } from 'react'
import { useSWRConfig } from 'swr'
import type { ModuleCard } from '@/@types/module-card'

/**
 * SWR cache key for the manifest-driven module source
 * (`GET /api/v1/platform/modules` → ModuleCard[], R3-E1-08-be).
 *
 * Centralized here so the producer (`usePlatformModules`) and any code that
 * needs to invalidate the cache (the module enable/disable toggle in project
 * settings) agree on the exact key shape — a mismatch would silently break the
 * live recompute (FR-SHELL-12 / E1-12 demo).
 */
export const PLATFORM_MODULES_KEY = '/api/v1/platform/modules'

export function platformModulesSwrKey(projectId: string): [string, string] {
    return [PLATFORM_MODULES_KEY, projectId]
}

/**
 * Optimistic patch for the cached `ModuleCard[]` — the exact set of module ids
 * that should be enabled after a toggle. Lets the sidebar rebuild INSTANTLY from
 * the same source it already reads (`usePlatformModules`), instead of waiting for
 * the background revalidation of `/api/v1/platform/modules` to come back (which
 * depends on the be endpoint reflecting the just-persisted change synchronously).
 */
export type ModulesCachePatch = {
    /** Module ids enabled in the project after the change. */
    enabledModuleIds: string[]
}

/**
 * Flip each card's `enabled`/`enabledInProject` flag to match the new project
 * enablement, without touching `system` modules (never gated by enablement,
 * FR-SHELL-20a). Returns the same reference when there's no cached data so the
 * fallback (currentProject-derived) nav path is left untouched.
 */
function applyModulesPatch(
    current: ModuleCard[] | undefined,
    patch: ModulesCachePatch,
): ModuleCard[] | undefined {
    if (!Array.isArray(current)) return current
    const enabled = new Set(patch.enabledModuleIds)
    return current.map((card) => {
        if (card.kind === 'system') return card
        const on = enabled.has(card.id)
        if (card.enabled === on && card.enabledInProject === on) return card
        return { ...card, enabled: on, enabledInProject: on }
    })
}

/**
 * `useRefreshModules()` — revalidate the manifest-driven module source so the
 * host rebuilds navigation / routes / mount-point slots / Contextual UI **live**,
 * with no page reload (FR-SHELL-6/12/13, E1-12 demo DoD).
 *
 * The module enable/disable toggle (project settings) calls this after the
 * `effectiveModules` change is persisted. Because navigation (`useNavigationConfig`)
 * and slots (`useSlotContributions`) are both derived from `usePlatformModules`,
 * a single revalidation of this key makes the whole UI recompute reactively —
 * the demonstration that adding/removing a module needs ZERO kernel changes.
 *
 * Falls back to revalidating ANY platform-modules key (regardless of projectId)
 * so the active project's menu refreshes even if the caller can't resolve the
 * exact id.
 */
export default function useRefreshModules() {
    const { mutate } = useSWRConfig()

    return useCallback(
        async (projectId?: string, patch?: ModulesCachePatch) => {
            // With a patch: write the new enablement into the cache FIRST
            // (optimistic) so the sidebar/routes/slots recompute in the same
            // render pass, THEN revalidate against the endpoint to reconcile.
            // This is what makes the toggle land live with no page reload even
            // when the be endpoint lags behind the persisted change.
            const updater = patch
                ? (current: ModuleCard[] | undefined) =>
                      applyModulesPatch(current, patch)
                : undefined

            if (projectId) {
                await mutate(platformModulesSwrKey(projectId), updater, {
                    revalidate: true,
                    populateCache: Boolean(patch),
                })
                return
            }
            // No id at hand: invalidate (and optimistically patch) every
            // platform-modules cache entry.
            await mutate(
                (key) =>
                    Array.isArray(key) && key[0] === PLATFORM_MODULES_KEY,
                updater,
                { revalidate: true, populateCache: Boolean(patch) },
            )
        },
        [mutate],
    )
}
