import { useMemo } from 'react'
import useSWR from 'swr'
import { useLiveProjects } from '@/utils/hooks/useLiveProjects'
import useResolvedProjectId from '@/utils/hooks/useResolvedProjectId'
import { apiGetPermissionProjection } from '@/services/PermissionService'
import type { ProjectInfo } from '@/@types/auth'
import type { PermissionProjectionState } from '@/@types/permission'

/**
 * Resolves the permission projection for the current (user, project) — the SINGLE
 * source seam for `usePermission` / `useModulePolicy` (E2-13 / FR-SHELL-8/9).
 *
 * Stage 2 (this task): fetches API-2
 * (`GET /api/v1/projects/:id/permissions`) — the real PDP projection (RBAC +
 * module policies + visibility). The host NEVER computes RBAC/ABAC (FR-SHELL-11);
 * it only reads what the access engine returns.
 *
 * States (fail-closed, BR-SHELL-4):
 *  - no project        → `absent`  (nothing to gate; lookups deny).
 *  - fetching API-2    → `loading` (lookups deny — no flash of unowned actions).
 *  - API-2 ok          → `projection` (preferred).
 *  - API-2 error       → `unavailable` (fail-closed; no local RBAC synthesis).
 *
 * NO call-site of `usePermission` / `useModulePolicy` changes — they only read
 * this state.
 */
export default function usePermissionProjection(): PermissionProjectionState {
    const resolvedProjectId = useResolvedProjectId()
    const { projects } = useLiveProjects()

    // T-001-FE: поллим проекцию прав ТОЛЬКО когда проект сверён с membership
    // текущего юзера. resolvedProjectId уже валидирует id по user.projects, но
    // держим явный гейт здесь — чтобы stale/чужой проект гарантированно не
    // порождал `GET /projects/:id/permissions` с чужим X-Project-Id → 403.
    const isMemberOfResolved =
        !!resolvedProjectId &&
        (projects ?? []).some((p: ProjectInfo) => p.id === resolvedProjectId)

    const swrKey = isMemberOfResolved
        ? ['permission/projection', resolvedProjectId]
        : null

    const {
        data: projection,
        error,
        isLoading,
    } = useSWR(
        swrKey,
        () => apiGetPermissionProjection(resolvedProjectId!),
        {
            revalidateOnFocus: false,
            shouldRetryOnError: true,
            errorRetryCount: 2,
            // Projection is per-session-per-project; refresh on navigation/TTL.
            dedupingInterval: 30_000,
        },
    )

    return useMemo<PermissionProjectionState>(() => {
        if (!resolvedProjectId) {
            return { source: 'absent', projection: null }
        }

        // Real PDP projection — preferred, fail-closed source of truth.
        if (projection) {
            return { source: 'projection', projection }
        }

        // API-2 failed → fail-closed; host must not synthesize RBAC (FR-SHELL-140).
        if (error) {
            return { source: 'unavailable', projection: null }
        }

        // Still resolving API-2 → fail-closed loading.
        if (isLoading) {
            return { source: 'loading', projection: null }
        }

        return { source: 'loading', projection: null }
    }, [resolvedProjectId, projection, error, isLoading])
}

