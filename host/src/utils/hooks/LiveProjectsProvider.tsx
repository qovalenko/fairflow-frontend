import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react'
import type { ProjectInfo } from '@/@types/auth'
import { useSessionUser } from '@/store/authStore'
import { apiGetMyProjects } from '@/services/CrmService'
import { mapControlProjectsToUser } from '@/utils/mapControlProjects'

export type LiveProjectsValue = {
    projects: ProjectInfo[]
    loading: boolean
    error: string | null
    refresh: () => Promise<void>
}

const LiveProjectsContext = createContext<LiveProjectsValue | null>(null)

// Stable fallback: an inline `?? []` changes identity every render, and the
// snapshot-sync below would then fire endlessly (legacy persisted sessions may
// lack `user.projects`).
const EMPTY_PROJECTS: ProjectInfo[] = []

/**
 * FR-PROJ-405: single live source for membership-scoped project list
 * (`GET /v1/projects`). Session snapshot seeds the initial state; guards and
 * selectors reconcile against the refreshed list.
 */
export function LiveProjectsProvider({ children }: { children: ReactNode }) {
    const userId = useSessionUser((s) => s.user.userId)
    const sessionProjects =
        useSessionUser((s) => s.user.projects) ?? EMPTY_PROJECTS
    const [projects, setProjects] = useState<ProjectInfo[]>(sessionProjects)
    const [prevSessionProjects, setPrevSessionProjects] =
        useState<ProjectInfo[]>(sessionProjects)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Snapshot sync MUST happen during render, not in an effect: consumers
    // (usePortfolioProjectGuard / useResolvedProjectId) read this list inside
    // useLayoutEffect on the SAME commit as the navigate() that follows a
    // setUser() (create-project does `setUser({projects: [...,new]})` +
    // `navigate('/p/<newId>')` in one batch). An effect-based sync lags one
    // commit behind, so the guard would see the stale list and bounce the user
    // off the freshly created project to /account/projects.
    if (prevSessionProjects !== sessionProjects) {
        setPrevSessionProjects(sessionProjects)
        setProjects(sessionProjects)
    }

    const refresh = useCallback(async () => {
        if (!userId) {
            setProjects([])
            return
        }
        setLoading(true)
        setError(null)
        try {
            const list = await apiGetMyProjects<
                Parameters<typeof mapControlProjectsToUser>[0]
            >({ userId })
            if (Array.isArray(list)) {
                setProjects(mapControlProjectsToUser(list))
            }
        } catch {
            setError('Не удалось загрузить список проектов')
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const value = useMemo(
        () => ({ projects, loading, error, refresh }),
        [projects, loading, error, refresh],
    )

    return (
        <LiveProjectsContext.Provider value={value}>
            {children}
        </LiveProjectsContext.Provider>
    )
}

export function useLiveProjects(): LiveProjectsValue {
    const ctx = useContext(LiveProjectsContext)
    // Без провайдера (тестовые деревья, изолированный рендер host-компонента)
    // деградируем к прежнему источнику — session snapshot, а не бросаем:
    // жёсткий throw превращал бы «чуть устаревший список» в белый экран.
    // Направление fail не ослаблено: snapshot и был источником до FR-PROJ-405.
    const sessionProjects =
        useSessionUser((s) => s.user.projects) ?? EMPTY_PROJECTS
    const fallback = useMemo<LiveProjectsValue>(
        () => ({
            projects: sessionProjects,
            loading: false,
            error: null,
            refresh: async () => {},
        }),
        [sessionProjects],
    )
    return ctx ?? fallback
}
