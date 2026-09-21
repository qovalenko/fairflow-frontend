import useSWR from 'swr'
import { useMemo } from 'react'
import { apiGetPlatformModules } from '@/services/CrmService'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import { ensureCrossCuttingNavCards } from '@/configs/module-nav.config'
import { platformModulesSwrKey } from '@/utils/hooks/useRefreshModules'
import { isCardEnabled } from '@/@types/module-card'
import type { ModuleCard } from '@/@types/module-card'

export type PlatformModulesResult = {
    /** Module cards from the platform manifest endpoint. */
    cards: ModuleCard[]
    /** Only enabled cards (system kind never gets dropped). */
    enabledCards: ModuleCard[]
    isLoading: boolean
    /** True once we have a usable card set from the platform endpoint. */
    ready: boolean
    /** API error (null when the manifest resolved). */
    error: unknown
    /** True when cards came from the legacy fallback, not the platform endpoint. */
    usedFallback: boolean
}

/**
 * Manifest-driven module source for the host (R3-E1-08-fe / FR-SHELL-1/2/3).
 *
 * Primary source: `GET /api/v1/platform/modules` → `ModuleCard[]` (be R3-E1-08-be).
 * On error or while loading, the menu stays empty (fail-closed, FR-SHELL-020).
 *
 * States surfaced to the menu (ux/screens/shell SCR-SHELL-CHROME-SIDENAV):
 *  - loading  → `isLoading && !ready`
 *  - error    → `error && !ready`
 *  - empty    → `ready && enabledCards.length === 0`
 *  - data     → `ready && enabledCards.length > 0`
 */
export default function usePlatformModules(): PlatformModulesResult {
    const resolvedProjectId = useResolvedProjectId()

    const { data, error, isLoading } = useSWR<ModuleCard[]>(
        resolvedProjectId ? platformModulesSwrKey(resolvedProjectId) : null,
        () => apiGetPlatformModules(resolvedProjectId!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    return useMemo<PlatformModulesResult>(() => {
        const apiCards = Array.isArray(data) ? data : null

        if (apiCards) {
            const enabledCards = ensureCrossCuttingNavCards(
                apiCards.filter((c) => c.kind === 'system' || isCardEnabled(c)),
            )
            return {
                cards: apiCards,
                enabledCards,
                isLoading: false,
                ready: true,
                error: null,
                usedFallback: false,
            }
        }

        // No data yet. While loading and no project context resolved → not ready.
        if (isLoading) {
            return {
                cards: [],
                enabledCards: [],
                isLoading: true,
                ready: false,
                error: null,
                usedFallback: false,
            }
        }

        // Fail-closed (FR-SHELL-020): no legacy module synthesis on API error.
        return {
            cards: [],
            enabledCards: [],
            isLoading: false,
            ready: true,
            error: error ?? null,
            usedFallback: false,
        }
    }, [data, error, isLoading])
}
