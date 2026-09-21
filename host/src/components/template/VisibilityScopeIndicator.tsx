import usePermissionProjection from '@/utils/hooks/usePermissionProjection'
import { qa } from '@/shared/qa'
import type { VisibilityLevel, VisibilityScope } from '@/@types/permission'

const SCOPE_LABELS: Record<VisibilityLevel, string> = {
    only_own: 'Видимость: только мои записи',
    own_and_shared: 'Видимость: мои и общие записи',
    own_and_subordinates: 'Видимость: моя команда',
    own_and_department: 'Видимость: мой отдел',
    all: 'Видимость: все записи проекта',
}

export function visibilityScopeLabel(scope?: VisibilityScope): string | null {
    if (!scope?.level) return null
    return SCOPE_LABELS[scope.level] ?? null
}

/**
 * FR-SHELL-110 — global chrome indicator of the user's visibility scope.
 * Read-only hint from API-2 projection; host never computes scope.
 */
export default function VisibilityScopeIndicator() {
    const { projection, source } = usePermissionProjection()
    if (source !== 'projection' || !projection?.visibilityScope) return null
    const label = visibilityScopeLabel(projection.visibilityScope)
    if (!label) return null

    return (
        <span
            className="hidden lg:inline text-xs text-gray-500 dark:text-gray-400 truncate max-w-[220px]"
            title={label}
            data-testid="visibility-scope-indicator"
            {...qa('host.header.visibilityScope')}
        >
            {label}
        </span>
    )
}
