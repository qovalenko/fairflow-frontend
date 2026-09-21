import usePermissionProjection from '@/utils/hooks/usePermissionProjection'
import type { VisibilityScope } from '@/@types/permission'

/**
 * Lightweight read-only view over the permission-projection resolution state
 * (E2-13), so gated screens can render the right caталог state without
 * re-deriving from `usePermission`:
 *
 *  - `isLoading` — project context exists, PDP projection (API-2) in flight.
 *                  Use to show an ST-1 skeleton instead of a fail-closed empty.
 *  - `isReady`   — a real projection is available.
 *  - `isFallback`— API-2 failed; gating runs on a coarse role fallback.
 *  - `hasProject`— there is a project context to gate against.
 */
export function usePermissionStatus() {
    const state = usePermissionProjection()
    return {
        source: state.source,
        isLoading: state.source === 'loading',
        isReady: state.source === 'projection',
        isFallback: state.source === 'derived' || state.source === 'unavailable',
        hasProject: state.source !== 'absent',
    }
}

/**
 * Visibility-by-hierarchy scope (FR-SHELL-8a) for the current (user, project),
 * consumed for UI hints only (e.g. "you see only your records"). `undefined`
 * when no projection / not provided by the engine.
 */
export function useVisibilityScope(): VisibilityScope | undefined {
    const state = usePermissionProjection()
    return state.projection?.visibilityScope
}

export default usePermissionStatus
