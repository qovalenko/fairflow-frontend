import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import AccountLayout from '../AccountLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Spinner from '@/components/ui/Spinner'
import { apiGetMyAccess, type MyAccessProject, type MyAccessResponse } from '@/services/AuthService'
import { normalizeApiError } from '@/utils/apiError'
import { qa } from '@/shared/qa'

const SYSTEM_ROLE_LABELS: Record<string, string> = {
    platform_owner: 'Владелец платформы',
    platform_admin: 'Администратор платформы',
}

const PROJECT_ROLE_LABELS: Record<string, string> = {
    owner: 'Владелец',
    admin: 'Администратор',
    project_admin: 'Администратор',
    manager: 'Менеджер',
    member: 'Участник',
    viewer: 'Наблюдатель',
}

const formatJoinedAt = (iso: string) => {
    if (!iso) return '—'
    try {
        return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(new Date(iso))
    } catch {
        return iso
    }
}

/**
 * SCR-MPROF-MY-ACCESS — projects, roles and visibility (FR-PROFILE-280).
 */
const MyAccess = () => {
    const [data, setData] = useState<MyAccessResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        let mounted = true
        ;(async () => {
            setLoading(true)
            setError('')
            try {
                const res = await apiGetMyAccess()
                if (mounted) setData(res)
            } catch (e) {
                if (mounted) {
                    setData(null)
                    setError(normalizeApiError(e).message || 'Не удалось загрузить доступы')
                }
            } finally {
                if (mounted) setLoading(false)
            }
        })()
        return () => {
            mounted = false
        }
    }, [])

    const systemRoles = data?.systemRoles ?? []
    const projects = data?.projects ?? []

    return (
        <AccountLayout>
            <AdaptiveCard>
                <h1 className="text-2xl font-semibold mb-2" {...qa('host.myAccess.heading')}>
                    Мои доступы
                </h1>
                <p className="text-gray-600 mb-6 text-sm">
                    Проекты, в которых вы участвуете, с ролью и уровнем видимости записей.
                </p>
                {loading ? (
                    <div className="flex justify-center py-12" {...qa('host.myAccess.loading')}>
                        <Spinner size={32} />
                    </div>
                ) : error ? (
                    <p className="text-red-600" {...qa('host.myAccess.error')}>
                        {error}
                    </p>
                ) : (
                    <div className="flex flex-col gap-8">
                        {systemRoles.length > 0 ? (
                            <section>
                                <h2 className="text-lg font-medium mb-3" {...qa('host.myAccess.systemRolesHeading')}>
                                    Системные роли
                                </h2>
                                <ul className="space-y-2">
                                    {systemRoles.map((role) => (
                                        <li
                                            key={role}
                                            className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3"
                                            {...qa('host.myAccess.systemRole', { role })}
                                        >
                                            {SYSTEM_ROLE_LABELS[role] ?? role}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        ) : null}
                        <section>
                            <h2 className="text-lg font-medium mb-3" {...qa('host.myAccess.projectsHeading')}>
                                Проекты
                            </h2>
                            {projects.length === 0 ? (
                                <p className="text-gray-600" {...qa('host.myAccess.emptyProjects')}>
                                    Вы пока не состоите ни в одном проекте.
                                </p>
                            ) : (
                                <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-lg border border-gray-200 dark:border-gray-700">
                                    {projects.map((p: MyAccessProject) => (
                                        <li
                                            key={p.projectId}
                                            className="px-4 py-4"
                                            {...qa('host.myAccess.projectRow', { project: p.projectId })}
                                            {...qa('host.profile.myAccess.projectRow', { project: p.projectId })}
                                        >
                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <Link
                                                        to={`/account/projects/${p.projectId}/settings`}
                                                        className="font-medium text-primary hover:underline"
                                                        {...qa('host.myAccess.projectLink', { project: p.projectId })}
                                                        {...qa('host.profile.myAccess.projectLink', { project: p.projectId })}
                                                    >
                                                        {p.projectName || p.projectId}
                                                    </Link>
                                                    <p className="text-sm text-gray-600">
                                                        Роль:{' '}
                                                        {PROJECT_ROLE_LABELS[p.role] ?? (p.role || '—')}
                                                    </p>
                                                </div>
                                                <div className="text-sm text-gray-600 sm:text-right">
                                                    <p>{p.visibilityLabel || p.visibilityLevel}</p>
                                                    <p className="text-xs text-gray-500">
                                                        В проекте с {formatJoinedAt(p.joinedAt)}
                                                    </p>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>
                )}
            </AdaptiveCard>
        </AccountLayout>
    )
}

export default MyAccess
