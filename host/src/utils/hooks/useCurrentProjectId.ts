import { useParams } from 'react-router'
import { useProjectStore } from '@/store/projectStore'

/**
 * Текущий проект: из URL (/p/:pid) или из store (localStorage).
 * Для страниц портфеля без /p в URL контекст берётся из store.
 */
export default function useCurrentProjectId(): string | undefined {
    const paramsPid = useParams<{ pid: string }>().pid
    const storeProjectId = useProjectStore((s) => s.currentProjectId)
    return paramsPid ?? storeProjectId ?? undefined
}
