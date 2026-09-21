import { create } from 'zustand'
import type { ProjectModuleConfig, ProjectModulePolicyRule } from '@/@types/auth'

const ID_KEY = 'fairflow_current_project_id'
const PROJECT_KEY = 'fairflow_current_project'

function getStoredProjectId(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(ID_KEY) || null
}

function getStoredProject(): Project | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = localStorage.getItem(PROJECT_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed.id === 'string') return parsed as Project
    } catch { /* corrupted */ }
    return null
}

export type Project = {
    id: string
    name: string
    enabledModules: string[]
    moduleConfigs?: ProjectModuleConfig[]
    modulePolicies?: ProjectModulePolicyRule[]
    effectiveModules?: string[]
}

type ProjectState = {
    currentProject: Project | null
    currentProjectId: string | null
}

type ProjectAction = {
    setCurrentProject: (project: Project | null) => void
}

const storedProject = getStoredProject()
const storedId = getStoredProjectId()

const initialState: ProjectState = {
    currentProject: storedProject,
    currentProjectId: storedProject?.id ?? storedId,
}

export const useProjectStore = create<ProjectState & ProjectAction>()((set) => ({
    ...initialState,
    setCurrentProject: (project) => {
        const id = project?.id ?? null
        if (typeof window !== 'undefined') {
            if (id) {
                localStorage.setItem(ID_KEY, id)
                localStorage.setItem(PROJECT_KEY, JSON.stringify(project))
            } else {
                localStorage.removeItem(ID_KEY)
                localStorage.removeItem(PROJECT_KEY)
            }
        }
        set({ currentProject: project, currentProjectId: id })
    },
}))

export { getStoredProjectId }

/**
 * Enabled module keys of a project — the single Contextual-UI resolver
 * (`effectiveModules` → enabled `moduleConfigs` → `enabledModules`).
 *
 * TODO-455/522 / FR-SHELL-020: FAIL-CLOSED. It used to return a hardcoded
 * 9-module default for `project === null` and for a project with empty sets, so
 * before the project loaded (and for a project that genuinely has no modules)
 * the UI advertised modules that are OFF — chat button, notification polls, menu
 * entries — and the guard treated disabled routes as enabled. `[]` is now the
 * honest answer.
 *
 * Callers MUST distinguish «not loaded yet» from «no modules» by the load state
 * of their source, not by this list: `usePlatformModules().ready` /
 * `useNavigationConfigWithState().isLoading|isEmpty` do exactly that — an empty
 * result while `ready === false` renders a loader, not an empty menu.
 */
export function getEnabledModules(project: Project | null): string[] {
    if (!project) return []
    const fromEffective = project.effectiveModules ?? []
    if (fromEffective.length) return fromEffective
    const fromConfigs =
        project.moduleConfigs
            ?.filter((cfg) => cfg.enabled)
            .map((cfg) => cfg.moduleId) ?? []
    if (fromConfigs.length) return fromConfigs
    if (project.enabledModules.length) return project.enabledModules
    return []
}

// NOTE: the former `getFirstAvailablePath(enabledModules)` helper was removed
// (T-002). The first-enabled-module landing target is now derived in ONE place —
// `useNavigationConfigWithState().firstPath` (the manifest module tree ∩ perms) —
// which ProjectHomeRedirect, Home and usePortfolioProjectGuard all consume. This
// drops the duplicated, MODULE_NAV_PRESETS-order-based logic that always surfaced
// the (possibly disabled) statistics module first.
