import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { PiPlusDuotone, PiDotsThreeDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Avatar from '@/components/ui/Avatar'
import Input from '@/components/ui/Input'
import { useLiveProjects } from '@/utils/hooks/useLiveProjects'
import {
    filterProjectsByQuery,
    shouldShowProjectSearch,
} from '@/utils/projectListFilter'
import { apiRestoreProject } from '@/services/CrmService'
import { ProjectTemplateTag } from '@/components/shared/ProjectTemplateTag'
import { qa } from '@/shared/qa'

const roleLabels: Record<string, string> = {
    admin: 'Админ',
    manager: 'Менеджер',
    member: 'Участник',
    viewer: 'Наблюдатель',
}

const roleColors: Record<string, string> = {
    admin: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    manager: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    member: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    viewer: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
}

const statusLabels: Record<string, { label: string; className: string }> = {
    archived: {
        label: 'Архив',
        className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    },
    pending_deletion: {
        label: 'Удаляется',
        className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    },
}

const provisioningLabels: Record<string, { label: string; className: string }> = {
    pending: {
        label: 'Настраивается',
        className: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200',
    },
    failed: {
        label: 'Ошибка настройки',
        className: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    },
}

interface ProjectsListProps {
    /** When true, do not wrap in Container (e.g. when used inside ProjectsLayout) */
    skipContainer?: boolean
    /** Optional filter by owner id (box: Система). */
    filterOwnerId?: string
    /** Base path for project settings (e.g. /account/projects or /settings/projects) */
    settingsBasePath?: string
    /** Optional query string to append when opening project settings. */
    settingsSearch?: string
}

const ProjectsList = ({
    skipContainer,
    filterOwnerId,
    settingsBasePath = '/account/projects',
    settingsSearch = '',
}: ProjectsListProps) => {
    const navigate = useNavigate()
    const { projects: liveProjects, loading, error, refresh } = useLiveProjects()
    const [searchQuery, setSearchQuery] = useState('')

    const projects = useMemo(() => {
        if (!filterOwnerId) return liveProjects
        return liveProjects.filter((p) => p.ownerId === filterOwnerId)
    }, [liveProjects, filterOwnerId])

    const showSearch = shouldShowProjectSearch(projects.length)
    const visibleProjects = useMemo(
        () => (showSearch ? filterProjectsByQuery(projects, searchQuery) : projects),
        [projects, searchQuery, showSearch],
    )

    const totalProjects = projects.length

    const handleRestore = async (projectId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            await apiRestoreProject(projectId)
            await refresh()
        } catch {
            // caller may add toast later
        }
    }

    const content = (
        <div className="py-4 space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold mb-2">Проекты</h2>
                    <p className="text-gray-600 dark:text-gray-400">
                        {loading && totalProjects === 0
                            ? 'Загрузка проектов…'
                            : error && totalProjects === 0
                              ? error
                              : totalProjects === 0
                                ? 'Выберите проект для управления или создайте новый.'
                                : `${totalProjects} ${
                                      totalProjects === 1
                                          ? 'проект'
                                          : totalProjects < 5
                                            ? 'проекта'
                                            : 'проектов'
                                  }`}
                    </p>
                </div>
                <Button
                    variant="solid"
                    icon={<PiPlusDuotone />}
                    onClick={() => navigate('/account/projects/new')}
                    {...qa('host.projectsList.create')}
                >
                    Создать
                </Button>
            </div>

            {showSearch && (
                <Input
                    placeholder="Поиск по названию…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Поиск проекта"
                    data-qa="host.projectsList.search"
                />
            )}

            {totalProjects === 0 ? (
                <Card>
                    <div
                        className="p-6 text-sm text-gray-600 dark:text-gray-400"
                        {...qa('host.projectsList.empty')}
                    >
                        {loading
                            ? 'Загрузка…'
                            : error ?? 'У вас пока нет проектов.'}
                    </div>
                </Card>
            ) : visibleProjects.length === 0 ? (
                <Card>
                    <div className="p-6 text-sm text-gray-600 dark:text-gray-400">
                        Ничего не найдено
                    </div>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleProjects.map((project) => {
                        const statusMeta =
                            project.status && project.status !== 'active'
                                ? statusLabels[project.status]
                                : undefined
                        return (
                            <Card
                                key={project.id}
                                className="hover:shadow-lg transition-shadow cursor-pointer"
                                {...qa('host.projectsList.card', { project: project.id })}
                                onClick={() =>
                                    navigate(
                                        `${settingsBasePath}/${project.id}/settings${settingsSearch}`,
                                    )
                                }
                                {...qa('host.projectsList.item', { project: project.id })}
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <Avatar
                                            size={40}
                                            shape="round"
                                            className="text-white font-bold"
                                            style={{
                                                backgroundColor: project.color,
                                            }}
                                        >
                                            {project.name.charAt(0)}
                                        </Avatar>
                                        <div>
                                            <h5 className="font-semibold heading-text">
                                                {project.name}
                                            </h5>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                <Tag
                                                    className={`text-xs ${roleColors[project.role] ?? ''}`}
                                                >
                                                    {roleLabels[project.role] ??
                                                        project.role}
                                                </Tag>
                                                {statusMeta && (
                                                    <Tag
                                                        className={`text-xs ${statusMeta.className}`}
                                                    >
                                                        {statusMeta.label}
                                                    </Tag>
                                                )}
                                                {project.provisioningStatus &&
                                                    project.provisioningStatus !==
                                                        'complete' &&
                                                    provisioningLabels[
                                                        project.provisioningStatus
                                                    ] && (
                                                        <Tag
                                                            className={`text-xs ${
                                                                provisioningLabels[
                                                                    project.provisioningStatus
                                                                ].className
                                                            }`}
                                                        >
                                                            {
                                                                provisioningLabels[
                                                                    project.provisioningStatus
                                                                ].label
                                                            }
                                                        </Tag>
                                                    )}
                                                <ProjectTemplateTag
                                                    templateId={project.templateId}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        title="Действия проекта"
                                        aria-label="Действия проекта"
                                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                        }}
                                    >
                                        <PiDotsThreeDuotone className="w-5 h-5" />
                                    </button>
                                </div>
                                {project.status === 'pending_deletion' && (
                                    <div className="pt-2 border-t">
                                        <Button
                                            size="sm"
                                            variant="solid"
                                            {...qa('host.projectsList.restore', {
                                                project: project.id,
                                            })}
                                            onClick={(e) =>
                                                handleRestore(project.id, e)
                                            }
                                        >
                                            Восстановить
                                        </Button>
                                    </div>
                                )}
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
    return skipContainer ? content : <Container>{content}</Container>
}

export default ProjectsList
