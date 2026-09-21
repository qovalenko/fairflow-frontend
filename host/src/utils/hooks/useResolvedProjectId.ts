import { useLayoutEffect, useMemo } from 'react'
import { useParams } from 'react-router'
import { useLiveProjects } from '@/utils/hooks/useLiveProjects'
import { useProjectStore, getEnabledModules } from '@/store/projectStore'
import type { ProjectInfo } from '@/@types/auth'

/**
 * TODO-522: ОДИН резолвер модулей на весь host — `getEnabledModules` из
 * projectStore. Здесь раньше лежал второй хардкод-список DEFAULT_MODULES (те же
 * 9 id) и fail-open фолбэк на него: набор доезжал в стор как `effectiveModules`,
 * то есть выдуманные модули становились «эффективными модулями проекта».
 * Теперь пустой набор остаётся пустым (fail-closed).
 */
function resolveModules(p: ProjectInfo): string[] {
    return getEnabledModules({
        id: p.id,
        name: p.name,
        enabledModules: p.enabledModules ?? [],
        moduleConfigs: p.moduleConfigs,
        modulePolicies: p.modulePolicies,
        effectiveModules: p.effectiveModules,
    })
}

function toStoreProject(p: ProjectInfo) {
    const modules = resolveModules(p)
    return {
        id: p.id,
        name: p.name,
        enabledModules: modules,
        moduleConfigs: p.moduleConfigs ?? [],
        modulePolicies: p.modulePolicies ?? [],
        effectiveModules: p.effectiveModules ?? modules,
    }
}

export default function useResolvedProjectId(): string | undefined {
    const { pid: routeProjectId } = useParams<{ pid?: string }>()
    const { projects: userProjects } = useLiveProjects()
    const currentProjectId = useProjectStore((s) => s.currentProjectId)
    const setCurrentProject = useProjectStore((s) => s.setCurrentProject)

    const validIds = useMemo(
        () => new Set(userProjects.map((p: ProjectInfo) => p.id)),
        [userProjects],
    )

    useLayoutEffect(() => {
        if (userProjects.length === 0) {
            // Пустой user.projects: у юзера нет ни одного проекта. Любой ранее
            // сохранённый выбор (в т.ч. stale/чужой из прошлой сессии) при этом
            // невалиден по определению. T-001-FE: зануляем его, иначе stale
            // currentProjectId остаётся в store и axios-интерцептор штампует его
            // как X-Project-Id на не-исключённые запросы (напр. billing) → чужой
            // контекст протекает. Персистентные проекты юзера восстанавливаются
            // из sessionUser синхронно (persist localStorage), поэтому на релоаде
            // реального юзера этот список НЕ пуст — гонки гидрации тут нет.
            if (useProjectStore.getState().currentProjectId) {
                setCurrentProject(null)
            }
            return
        }

        const stored = useProjectStore.getState().currentProject

        if (routeProjectId && validIds.has(routeProjectId)) {
            if (stored?.id !== routeProjectId) {
                const p = userProjects.find((x) => x.id === routeProjectId)!
                setCurrentProject(toStoreProject(p))
            }
            return
        }

        if (!currentProjectId || !validIds.has(currentProjectId)) {
            const first = userProjects[0]
            setCurrentProject(toStoreProject(first))
        } else if (!stored) {
            const p = userProjects.find((x) => x.id === currentProjectId)
            if (p) {
                setCurrentProject(toStoreProject(p))
            }
        }
    }, [
        userProjects,
        currentProjectId,
        validIds,
        setCurrentProject,
        routeProjectId,
    ])

    // T-001-FE: при пустом списке проектов НЕ отдаём персистентный
    // currentProjectId — его невозможно сверить с membership текущего юзера, а
    // stale/чужой id тут раньше утекал в project-scoped поллы (permissions/
    // dashboard/…) → 403 ×N. Пока проект не сверён с юзером — контекста нет
    // (undefined), поллы гейтятся. Как только projects догрузятся, вернём
    // валидный id ниже.
    if (userProjects.length === 0) return undefined
    if (routeProjectId && validIds.has(routeProjectId)) return routeProjectId
    if (currentProjectId && validIds.has(currentProjectId)) return currentProjectId
    return userProjects[0]?.id
}
