import { useCallback, useMemo } from 'react'
import usePermissionProjection from '@/utils/hooks/usePermissionProjection'

export type ModulePolicyResult = {
    /** Raw module-policy flags for the module (flagKey → bool). */
    flags: Record<string, boolean>
    /**
     * Returns a flag value with a default.
     * Skeleton: absent flags resolve to `defaultValue` (no policies wired yet).
     */
    flag: (key: string, defaultValue?: boolean) => boolean
}

/**
 * `useModulePolicy(moduleId)` — module-policy / ABAC flag projection
 * (R3-E1-10 skeleton / FR-SHELL-9).
 *
 * Stage 1: `modulePolicyFlags` are empty (no PDP projection yet), so `flag()`
 * returns its `defaultValue`. The API is stable — stage 2 (E2-13) fills
 * `modulePolicyFlags` from API-2 and these call-sites start reflecting real
 * project policies WITHOUT changes.
 *
 * Like `usePermission`, this is UX gating, not security (BR-SHELL-4 / FR-SHELL-11).
 */
export default function useModulePolicy(moduleId: string): ModulePolicyResult {
    const state = usePermissionProjection()

    const flags = useMemo<Record<string, boolean>>(() => {
        if (!state.projection) return {}
        return state.projection.modulePolicyFlags[moduleId] ?? {}
    }, [state, moduleId])

    const flag = useCallback(
        (key: string, defaultValue = true): boolean => {
            if (key in flags) return flags[key]
            return defaultValue
        },
        [flags],
    )

    return { flags, flag }
}
