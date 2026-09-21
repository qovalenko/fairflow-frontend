import useSWR from 'swr'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Spinner from '@/components/ui/Spinner'
import Tag from '@/components/ui/Tag'
import Button from '@/components/ui/Button'
import { PiLockKeyDuotone, PiWarningDuotone } from 'react-icons/pi'
import { apiGetProjectRoles } from '@/services/PermissionService'
import { qa } from '@/shared/qa'
import { summarizePermissions } from './RolesEditor'

const BOX_ROLE_HINTS: Record<string, string> = {
    owner: 'Полный контроль над проектом, включая удаление.',
    admin: 'Управление настройками, участниками и доступом.',
    manager: 'Ведение сделок и команды, без администрирования проекта.',
    member: 'Ежедневная работа с записями по матрице прав роли.',
    viewer: 'Только просмотр данных проекта.',
}

function roleHint(name: string): string {
    const n = name.toLowerCase()
    if (n.includes('владел') || n.includes('owner')) return BOX_ROLE_HINTS.owner
    if (n.includes('админ') || n.includes('admin')) return BOX_ROLE_HINTS.admin
    if (n.includes('руковод') || n.includes('manager')) return BOX_ROLE_HINTS.manager
    if (n.includes('наблюд') || n.includes('viewer')) return BOX_ROLE_HINTS.viewer
    if (n.includes('участ') || n.includes('member') || n.includes('сотруд')) {
        return BOX_ROLE_HINTS.member
    }
    return 'Системная роль проекта.'
}

type Props = {
    projectId?: string
}

/**
 * FR-PSET-130 — в коробке фиксированные 5 системных ролей без конструктора кастомных.
 */
export default function SystemRolesReference({ projectId }: Props) {
    const { data: roles, error, isLoading, mutate } = useSWR(
        projectId ? ['project-system-roles', projectId] : null,
        () => apiGetProjectRoles(projectId!),
    )

    if (isLoading) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.access.systemRoles.loading')}>
                <div className="flex items-center justify-center gap-2 py-8 text-gray-400">
                    <Spinner /> Загрузка ролей…
                </div>
            </AdaptiveCard>
        )
    }

    if (error) {
        return (
            <AdaptiveCard {...qa('host.projectSettings.access.systemRoles.error')}>
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                    <PiWarningDuotone className="h-8 w-8 text-red-500" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Не удалось загрузить справочник ролей.
                    </p>
                    <Button
                        size="sm"
                        onClick={() => mutate()}
                        {...qa('host.projectSettings.access.systemRoles.retry')}
                    >
                        Повторить
                    </Button>
                </div>
            </AdaptiveCard>
        )
    }

    const systemRoles = (roles ?? [])
        .filter((r) => r.kind === 'system')
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

    return (
        <AdaptiveCard {...qa('host.projectSettings.access.systemRoles')}>
            <div className="mb-4">
                <h3 className="text-lg font-semibold">Системные роли</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    В коробочной редакции доступны пять фиксированных ролей. Кастомные
                    роли не настраиваются — назначайте участникам одну из системных.
                </p>
            </div>
            <div
                className="space-y-2"
                {...qa('host.projectSettings.access.systemRoles.list')}
            >
                {systemRoles.map((role) => (
                    <div
                        key={role.id}
                        className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                        {...qa('host.projectSettings.access.systemRoles.item', {
                            role: role.id,
                        })}
                    >
                        <div className="flex items-center gap-2">
                            <span className="font-medium">{role.name}</span>
                            <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                <PiLockKeyDuotone className="mr-1 inline" />
                                системная
                            </Tag>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {roleHint(role.name)}
                        </p>
                        <div className="mt-1 text-xs text-gray-500">
                            {role.permissions.length} прав
                            {typeof role.memberCount === 'number'
                                ? ` · ${role.memberCount} носителей`
                                : ''}
                        </div>
                        {role.permissions.length > 0 && (
                            <div className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500">
                                Умеет: {summarizePermissions(role.permissions, 4)}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </AdaptiveCard>
    )
}
