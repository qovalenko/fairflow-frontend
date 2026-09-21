import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { apiGetProjectMembers, type ProjectMember } from '@/services/CrmService'
import { personDisplayName } from '@/utils/displayName'

/**
 * T-010 — резолв userId → имя участника проекта (переиспользуемый).
 *
 * `GET /v1/projects/:id/members` уже возвращает `{ id, name, email, role }` с
 * именем, разрешённым control-сервисом. Используем его как справочник, чтобы
 * показывать ФИО там, где ответ отдаёт только UUID пользователя (напр.
 * «Владелец проекта» в Настройки→Основное — `owner_id` без имени).
 */
export default function useProjectMemberNames(projectId?: string) {
    const { data, isLoading } = useSWR(
        projectId ? ['project-member-names', projectId] : null,
        () => apiGetProjectMembers<ProjectMember[]>(projectId!),
        { revalidateOnFocus: false, shouldRetryOnError: false },
    )

    const byId = useMemo(() => {
        const map = new Map<string, ProjectMember>()
        for (const m of Array.isArray(data) ? data : []) {
            if (m?.id) map.set(m.id, m)
        }
        return map
    }, [data])

    const userName = useCallback(
        (userId?: string | null): string | undefined => {
            if (!userId) return undefined
            const m = byId.get(userId)
            if (!m) return undefined
            return personDisplayName({ name: m.name, email: m.email, id: m.id })
        },
        [byId],
    )

    const member = useCallback(
        (userId?: string | null): ProjectMember | undefined =>
            userId ? byId.get(userId) : undefined,
        [byId],
    )

    return { isLoading, userName, member }
}
