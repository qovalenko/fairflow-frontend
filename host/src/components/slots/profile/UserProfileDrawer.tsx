import { useEffect, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import Spinner from '@/components/ui/Spinner'
import {
    apiGetForeignUserProfile,
    type ForeignUserProfile,
} from '@/services/AuthService'
import { normalizeApiError } from '@/utils/apiError'
import { qa } from '@/shared/qa'

type UserProfileDrawerProps = {
    entityType?: string
    entityId?: string
}

const formatLastActive = (iso: string) => {
    if (!iso) return ''
    try {
        return new Intl.DateTimeFormat('ru-RU', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(iso))
    } catch {
        return iso
    }
}

const roleLabel = (role: string) => {
    switch (role) {
        case 'owner':
            return 'Владелец'
        case 'admin':
        case 'project_admin':
            return 'Администратор'
        case 'manager':
            return 'Менеджер'
        case 'member':
            return 'Участник'
        case 'viewer':
            return 'Наблюдатель'
        default:
            return role || '—'
    }
}

/**
 * FR-PROFILE-320: colleague mini-profile in `global.drawer.entity` (`entityType=user`).
 */
export default function UserProfileDrawer({ entityType, entityId }: UserProfileDrawerProps) {
    const [profile, setProfile] = useState<ForeignUserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [notFound, setNotFound] = useState(false)

    useEffect(() => {
        let mounted = true
        if (entityType !== 'user' || !entityId) {
            setProfile(null)
            setNotFound(false)
            setLoading(false)
            return
        }
        ;(async () => {
            setLoading(true)
            setNotFound(false)
            try {
                const res = await apiGetForeignUserProfile(entityId)
                if (mounted) setProfile(res.user)
            } catch (e) {
                if (!mounted) return
                const err = normalizeApiError(e)
                if (err.status === 404) setNotFound(true)
                else setProfile(null)
            } finally {
                if (mounted) setLoading(false)
            }
        })()
        return () => {
            mounted = false
        }
    }, [entityType, entityId])

    if (entityType !== 'user') return null

    if (loading) {
        return (
            <div className="flex justify-center py-12" {...qa('host.userProfileDrawer.loading')}>
                <Spinner size={32} />
            </div>
        )
    }

    if (notFound) {
        return (
            <p className="text-gray-600" {...qa('host.userProfileDrawer.notFound')}>
                Пользователь не найден.
            </p>
        )
    }

    if (!profile) {
        return (
            <p className="text-gray-600" {...qa('host.userProfileDrawer.loadError')}>
                Не удалось загрузить профиль.
            </p>
        )
    }

    return (
        <div className="flex flex-col gap-6" {...qa('host.userProfileDrawer.body')}>
            <div className="flex items-center gap-4">
                <Avatar
                    size={72}
                    src={profile.avatar || undefined}
                    alt={profile.name || profile.userName}
                    {...qa('host.userProfileDrawer.avatar')}
                />
                <div>
                    <h2 className="text-xl font-semibold" {...qa('host.userProfileDrawer.name')}>
                        {profile.name || profile.userName || 'Пользователь'}
                    </h2>
                    {profile.position ? (
                        <p className="text-gray-600" {...qa('host.userProfileDrawer.position')}>
                            {profile.position}
                        </p>
                    ) : null}
                </div>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2">
                {profile.departmentName ? (
                    <div {...qa('host.userProfileDrawer.field', { field: 'department' })}>
                        <dt className="text-sm text-gray-500">Отдел</dt>
                        <dd>{profile.departmentName}</dd>
                    </div>
                ) : null}
                {profile.projectRole ? (
                    <div {...qa('host.userProfileDrawer.field', { field: 'projectRole' })}>
                        <dt className="text-sm text-gray-500">Роль в проекте</dt>
                        <dd>{roleLabel(profile.projectRole)}</dd>
                    </div>
                ) : null}
                {profile.email ? (
                    <div {...qa('host.userProfileDrawer.field', { field: 'email' })}>
                        <dt className="text-sm text-gray-500">Email</dt>
                        <dd>{profile.email}</dd>
                    </div>
                ) : null}
                {profile.lastActiveAt ? (
                    <div {...qa('host.userProfileDrawer.field', { field: 'lastActiveAt' })}>
                        <dt className="text-sm text-gray-500">Последняя активность</dt>
                        <dd>{formatLastActive(profile.lastActiveAt)}</dd>
                    </div>
                ) : null}
                {profile.phone ? (
                    <div {...qa('host.userProfileDrawer.field', { field: 'phone' })}>
                        <dt className="text-sm text-gray-500">Телефон</dt>
                        <dd>{profile.phone}</dd>
                    </div>
                ) : null}
            </dl>
        </div>
    )
}
