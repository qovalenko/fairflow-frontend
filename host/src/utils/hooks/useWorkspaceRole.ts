import { useMemo } from 'react'
import { useSessionUser } from '@/store/authStore'
import type { OrgRole } from '@/@types/auth'

/**
 * `useWorkspaceRole()` — роль текущего пользователя в Системе (box single-tenant).
 *
 * box = одна Система: нет массива организаций, выбора активной орг и личного
 * вектора. Хук отдаёт единственную Систему из сессии (`user.system`) + роль
 * пользователя в ней (`systemRole`), плюс производные булевы флаги.
 */
export default function useWorkspaceRole() {
    const user = useSessionUser((state) => state.user)
    const projects = user.projects ?? []
    const system = user.system ?? undefined
    const systemId = system?.id

    const systemRole: OrgRole | undefined = user.systemRole ?? system?.role
    const isSystemOwner = systemRole === 'platform_owner'
    const isSystemAdmin = systemRole === 'platform_admin'
    const isSystemOwnerOrAdmin = isSystemOwner || isSystemAdmin
    const isEmployee = systemRole === 'employee'

    return useMemo(
        () => ({
            system,
            systemId,
            systemRole,
            isSystemOwner,
            isSystemAdmin,
            isSystemOwnerOrAdmin,
            isEmployee,
            projects,
        }),
        [
            system,
            systemId,
            systemRole,
            isSystemOwner,
            isSystemAdmin,
            isSystemOwnerOrAdmin,
            isEmployee,
            projects,
        ],
    )
}
