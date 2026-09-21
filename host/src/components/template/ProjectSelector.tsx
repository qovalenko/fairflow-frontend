import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router'
import { useSWRConfig } from 'swr'
import Dropdown from '@/components/ui/Dropdown'
import Avatar from '@/components/ui/Avatar'
import Tag from '@/components/ui/Tag'
import Input from '@/components/ui/Input'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import withHeaderItem from '@/utils/hoc/withHeaderItem'
import { useProjectStore } from '@/store/projectStore'
import useWorkspaceRole from '@/utils/hooks/useWorkspaceRole'
import { useLiveProjects } from '@/utils/hooks/useLiveProjects'
import { invalidateProjectSwitchCaches } from '@/utils/hooks/invalidateProjectSwitchCaches'
import { hasUnsavedChanges } from '@/utils/hooks/useUnsavedChangesGuard'
import { hasProjectSwitchDirtyState } from '@/store/projectSwitchDirtyStore'
import { ProjectTemplateTag } from '@/components/shared/ProjectTemplateTag'
import {
    filterProjectsByQuery,
    shouldShowProjectSearch,
} from '@/utils/projectListFilter'
import { qa } from '@/shared/qa'
import {
    PiPlusBold,
    PiCaretDownBold,
    PiBuildingsDuotone,
    PiGearDuotone,
} from 'react-icons/pi'
import type { DropdownRef } from '@/components/ui/Dropdown'

const PROJECT_PATH_REGEX = /^\/p\/([^/]+)/

const projectStatusLabel: Record<string, string> = {
    archived: 'Архив',
    pending_deletion: 'Удаляется',
}

const provisioningStatusLabel: Record<string, string> = {
    pending: 'Настраивается',
    failed: 'Ошибка настройки',
}

const _ProjectSelector = () => {
    const navigate = useNavigate()
    const paramsPid = useParams().pid
    const location = useLocation()
    const storeProjectId = useProjectStore((s) => s.currentProjectId)
    const setCurrentProject = useProjectStore((s) => s.setCurrentProject)
    const pidFromUrl = paramsPid ?? location.pathname.match(PROJECT_PATH_REGEX)?.[1]
    // pid: приоритет URL (/p/:pid), иначе из store (localStorage)
    const pid = pidFromUrl ?? storeProjectId
    const hasPidInUrl = Boolean(pidFromUrl)
    const dropdownRef = useRef<DropdownRef>(null)
    const projectStoreProject = useProjectStore((s) => s.currentProject)
    const { isSystemOwnerOrAdmin } = useWorkspaceRole()
    const { projects, loading, error } = useLiveProjects()
    const { mutate } = useSWRConfig()
    const [searchQuery, setSearchQuery] = useState('')
    const [pendingSwitch, setPendingSwitch] = useState<string | null>(null)

    const canCreate = isSystemOwnerOrAdmin
    const showSearch = shouldShowProjectSearch(projects.length)
    const visibleProjects = useMemo(
        () => (showSearch ? filterProjectsByQuery(projects, searchQuery) : projects),
        [projects, searchQuery, showSearch],
    )

    const currentProject = useMemo(
        () => projects.find((p) => p.id === pid),
        [pid, projects],
    )

    // Если проект из localStorage больше недоступен в user.projects и мы не в /p/:pid, очищаем выбор.
    useEffect(() => {
        if (!hasPidInUrl && pid && !projects.some((p) => p.id === pid)) {
            setCurrentProject(null)
        }
    }, [hasPidInUrl, pid, projects, setCurrentProject])

    // Активный проект: из user.projects или projectStore
    const displayProject = useMemo(() => {
        if (currentProject) return currentProject
        if (hasPidInUrl && pid && projectStoreProject?.id === pid) {
            return {
                id: pid,
                name: projectStoreProject.name,
                color: '#8B5CF6',
                role: 'member' as const,
            }
        }
        if (hasPidInUrl && pid) {
            return {
                id: pid,
                name: `Проект ${pid}`,
                color: '#8B5CF6',
                role: 'member' as const,
            }
        }
        return null
    }, [currentProject, hasPidInUrl, pid, projectStoreProject])

    const performSelectProject = (projectId: string) => {
        const previousProjectId = pid
        const project = projects.find((p) => p.id === projectId)
        if (project) {
            setCurrentProject({
                id: project.id,
                name: project.name,
                enabledModules: project.enabledModules ?? [],
                moduleConfigs: project.moduleConfigs ?? [],
                modulePolicies: project.modulePolicies ?? [],
                effectiveModules: project.effectiveModules ?? project.enabledModules ?? [],
            })
        }
        void invalidateProjectSwitchCaches(mutate, previousProjectId)
        const hasPidInUrlPath = PROJECT_PATH_REGEX.test(location.pathname)
        if (hasPidInUrlPath && pid) {
            const newPath = location.pathname.replace(
                `/p/${pid}/`,
                `/p/${projectId}/`,
            )
            navigate(newPath)
        } else if (location.pathname.startsWith('/account')) {
            navigate(`/account/projects/${projectId}/settings`)
        }
        dropdownRef.current?.handleDropdownClose()
    }

    const handleSelectProject = (projectId: string) => {
        if (projectId === pid) {
            dropdownRef.current?.handleDropdownClose()
            return
        }
        if (hasUnsavedChanges() || hasProjectSwitchDirtyState()) {
            setPendingSwitch(projectId)
            return
        }
        performSelectProject(projectId)
    }

    const handleProjectSettings = (projectId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        navigate(`/account/projects/${projectId}/settings`)
        dropdownRef.current?.handleDropdownClose()
    }

    return (
        <>
        <Dropdown
            ref={dropdownRef}
            className="flex min-w-0"
            toggleClassName="flex items-center min-w-0"
            renderTitle={
                <div
                    className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    {...qa('host.projectSelector.trigger')}
                >
                    {displayProject ? (
                        <>
                            <span
                                className="w-7 h-7 min-w-7 min-h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shrink-0"
                                style={{
                                    backgroundColor:
                                        displayProject.color || '#8B5CF6',
                                }}
                            >
                                {displayProject.name.charAt(0)}
                            </span>
                            <span className="font-semibold text-sm max-w-[140px] sm:max-w-[160px] truncate">
                                {displayProject.name}
                            </span>
                        </>
                    ) : (
                        <span className="font-semibold text-sm">
                            Выберите проект
                        </span>
                    )}
                    <PiCaretDownBold className="text-xs text-gray-400" />
                </div>
            }
            placement="bottom-start"
            menuClass="min-w-[280px] md:min-w-[300px]"
        >
            <Dropdown.Item variant="header">
                <div className="py-1 px-3 flex items-center gap-2 w-full">
                    <span className="w-6 h-6 flex items-center justify-center flex-shrink-0 text-gray-500">
                        <PiBuildingsDuotone className="text-sm" />
                    </span>
                    <span className="flex-1 min-w-0 truncate text-xs font-semibold text-gray-500 uppercase">
                        Проекты
                    </span>
                    <span className="flex items-center justify-end w-9 flex-shrink-0">
                        {canCreate && (
                            <button
                                type="button"
                                tabIndex={-1}
                                className="text-gray-400 hover:text-primary text-sm p-0.5 rounded hover:bg-primary/10 transition-colors"
                                title="Создать проект"
                                {...qa('host.projectSelector.create')}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    navigate('/account/projects/new')
                                    dropdownRef.current?.handleDropdownClose()
                                }}
                            >
                                <PiPlusBold />
                            </button>
                        )}
                    </span>
                </div>
            </Dropdown.Item>
            {showSearch && (
                <Dropdown.Item variant="header">
                    {/* stopPropagation: DropdownMenu useTypeahead calls stopEvent
                        on character keys (floating-ui), which would swallow typing. */}
                    <div
                        className="px-3 pb-1"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        onKeyUp={(e) => e.stopPropagation()}
                    >
                        <Input
                            size="sm"
                            placeholder="Поиск проекта…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            aria-label="Поиск проекта"
                            {...qa('host.projectSelector.search')}
                        />
                    </div>
                </Dropdown.Item>
            )}
            {loading && projects.length === 0 ? (
                <Dropdown.Item disabled>
                    <span className="text-xs text-gray-400 flex items-center gap-2">
                        <span className="w-6 h-6 flex-shrink-0" />
                        Загрузка проектов…
                    </span>
                </Dropdown.Item>
            ) : error && projects.length === 0 ? (
                <Dropdown.Item disabled>
                    <span className="text-xs text-red-500 flex items-center gap-2">
                        <span className="w-6 h-6 flex-shrink-0" />
                        {error}
                    </span>
                </Dropdown.Item>
            ) : projects.length === 0 ? (
                <Dropdown.Item disabled {...qa('host.projectSelector.empty')}>
                    <span className="text-xs text-gray-400 flex items-center gap-2">
                        <span className="w-6 h-6 flex-shrink-0" />
                        Нет проектов
                    </span>
                </Dropdown.Item>
            ) : visibleProjects.length === 0 ? (
                <Dropdown.Item disabled {...qa('host.projectSelector.noResults')}>
                    <span className="text-xs text-gray-400 flex items-center gap-2">
                        <span className="w-6 h-6 flex-shrink-0" />
                        Ничего не найдено
                    </span>
                </Dropdown.Item>
            ) : (
                visibleProjects.map((project) => {
                    const isActive = project.id === currentProject?.id
                    const canManageProject =
                        project.role === 'admin' || project.role === 'manager'
                    return (
                        <Dropdown.Item
                            key={project.id}
                            eventKey={project.id}
                            className={
                                isActive
                                    ? 'bg-gray-50 dark:bg-gray-700/50'
                                    : ''
                            }
                            {...qa('host.projectSelector.item', { project: project.id })}
                            onClick={() => handleSelectProject(project.id)}
                        >
                            <span className="flex items-center gap-2 w-full">
                                <Avatar
                                    size={24}
                                    shape="round"
                                    className="text-white text-[10px] font-bold flex-shrink-0 w-6 h-6"
                                    style={{
                                        backgroundColor: project.color,
                                    }}
                                >
                                    {project.name.charAt(0)}
                                </Avatar>
                                <span className="truncate flex-1 min-w-0">
                                    {project.name}
                                </span>
                                <ProjectTemplateTag
                                    templateId={project.templateId}
                                    className="text-[10px] flex-shrink-0 max-w-[120px] truncate"
                                />
                                {project.status && project.status !== 'active' && (
                                    <Tag className="text-[10px] flex-shrink-0">
                                        {projectStatusLabel[project.status] ??
                                            project.status}
                                    </Tag>
                                )}
                                {project.provisioningStatus &&
                                    project.provisioningStatus !== 'complete' && (
                                        <Tag
                                            className={`text-[10px] flex-shrink-0 ${
                                                project.provisioningStatus === 'failed'
                                                    ? 'bg-red-100 text-red-700'
                                                    : 'bg-sky-100 text-sky-700'
                                            }`}
                                        >
                                            {provisioningStatusLabel[
                                                project.provisioningStatus
                                            ] ?? project.provisioningStatus}
                                        </Tag>
                                    )}
                                <span className="flex items-center gap-1 flex-shrink-0 w-9 justify-end">
                                    {canManageProject && (
                                        <button
                                            type="button"
                                            tabIndex={-1}
                                            className="text-gray-400 hover:text-primary text-sm p-0.5 rounded hover:bg-primary/10 transition-colors"
                                            title="Настройки проекта"
                                            aria-label="Настройки проекта"
                                            {...qa('host.projectSelector.settings', {
                                                project: project.id,
                                            })}
                                            onClick={(e) =>
                                                handleProjectSettings(
                                                    project.id,
                                                    e,
                                                )
                                            }
                                        >
                                            <PiGearDuotone />
                                        </button>
                                    )}
                                </span>
                            </span>
                        </Dropdown.Item>
                    )
                })
            )}
        </Dropdown>
        <ConfirmDialog
            isOpen={pendingSwitch !== null}
            type="warning"
            title="Несохранённые изменения"
            confirmText="Сменить проект"
            cancelText="Остаться"
            {...qa('host.projectSelector.dirtyDialog')}
            {...qa('host.projectSelector.switchDialog')}
            confirmButtonProps={{
                ...qa('host.projectSelector.dirtyConfirm'),
                ...qa('host.projectSelector.switchConfirm'),
            }}
            cancelButtonProps={{
                ...qa('host.projectSelector.dirtyCancel'),
                ...qa('host.projectSelector.switchCancel'),
            }}
            onClose={() => setPendingSwitch(null)}
            onRequestClose={() => setPendingSwitch(null)}
            onCancel={() => setPendingSwitch(null)}
            onConfirm={() => {
                const next = pendingSwitch
                setPendingSwitch(null)
                if (next) performSelectProject(next)
            }}
        >
            <p className="text-sm text-gray-600 dark:text-gray-300">
                Есть несохранённые изменения. Сменить проект без сохранения?
            </p>
        </ConfirmDialog>
        </>
    )
}

const ProjectSelector = withHeaderItem(_ProjectSelector)

export default ProjectSelector
