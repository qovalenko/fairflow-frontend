import { useMemo } from 'react'
import { useSessionUser } from '@/store/authStore'
import { useProjectStore } from '@/store/projectStore'

/**
 * True, если у пользователя есть хотя бы один проект и выбран валидный текущий проект.
 * Когда false — показываем минимальный хром (только профиль в хедере, без сайдбара и действий).
 */
export default function useHasActiveProject(): boolean {
    const projects = useSessionUser((s) => s.user.projects) ?? []
    const currentProjectId = useProjectStore((s) => s.currentProjectId)

    return useMemo(() => {
        if (projects.length === 0) return false
        if (!currentProjectId) return false
        return projects.some((p) => p.id === currentProjectId)
    }, [projects, currentProjectId])
}
