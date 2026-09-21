import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import AccountLayout from '../AccountLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Avatar from '@/components/ui/Avatar'
import Spinner from '@/components/ui/Spinner'
import {
    apiGetForeignUserProfile,
    type ForeignUserProfile,
} from '@/services/AuthService'
import { normalizeApiError } from '@/utils/apiError'
import { qa } from '@/shared/qa'

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
 * SCR-MPROF-USER-VIEW — projected colleague profile (FR-PROFILE-320).
 * Field set depends on the viewer's role; the backend enforces §19 matrix.
 */
const UserProfileView = () => {
    const { id = '' } = useParams()
    const [profile, setProfile] = useState<ForeignUserProfile | null>(null)
    const [loading, setLoading] = useState(true)
    const [notFound, setNotFound] = useState(false)

    useEffect(() => {
        let mounted = true
        if (!id) {
            setNotFound(true)
            setLoading(false)
            return
        }
        ;(async () => {
            setLoading(true)
            setNotFound(false)
            try {
                const res = await apiGetForeignUserProfile(id)
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
    }, [id])

    return (
        <AccountLayout>
            <div className="mb-4">
                <Link to="/" className="text-primary hover:underline text-sm" {...qa('host.userProfileView.back')}>
                    ← Назад
                </Link>
            </div>
            <AdaptiveCard>
                {loading ? (
                    <div className="flex justify-center py-12" {...qa('host.userProfileView.loading')}>
                        <Spinner size={32} />
                    </div>
                ) : notFound ? (
                    <p className="text-gray-600" {...qa('host.userProfileView.notFound')}>
                        Пользователь не найден.
                    </p>
                ) : !profile ? (
                    <p className="text-gray-600" {...qa('host.userProfileView.loadError')}>
                        Не удалось загрузить профиль.
                    </p>
                ) : (
                    <div className="flex flex-col gap-6">
                        <div className="flex items-center gap-4">
                            <Avatar
                                size={72}
                                src={profile.avatar || undefined}
                                alt={profile.name || profile.userName}
                                {...qa('host.userProfileView.avatar')}
                            />
                            <div>
                                <h1 className="text-2xl font-semibold" {...qa('host.userProfileView.name')}>
                                    {profile.name || profile.userName || 'Пользователь'}
                                </h1>
                                {profile.position ? (
                                    <p className="text-gray-600" {...qa('host.userProfileView.position')}>
                                        {profile.position}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                        <dl className="grid gap-3 sm:grid-cols-2">
                            {profile.departmentName ? (
                                <div {...qa('host.userProfileView.field', { field: 'department' })}>
                                    <dt className="text-sm text-gray-500">Отдел</dt>
                                    <dd>{profile.departmentName}</dd>
                                </div>
                            ) : null}
                            {profile.projectRole ? (
                                <div {...qa('host.userProfileView.field', { field: 'projectRole' })}>
                                    <dt className="text-sm text-gray-500">Роль в проекте</dt>
                                    <dd>{roleLabel(profile.projectRole)}</dd>
                                </div>
                            ) : null}
                            {profile.email ? (
                                <div {...qa('host.userProfileView.field', { field: 'email' })}>
                                    <dt className="text-sm text-gray-500">Email</dt>
                                    <dd>{profile.email}</dd>
                                </div>
                            ) : null}
                            {profile.lastActiveAt ? (
                                <div {...qa('host.userProfileView.field', { field: 'lastActiveAt' })}>
                                    <dt className="text-sm text-gray-500">Последняя активность</dt>
                                    <dd>{formatLastActive(profile.lastActiveAt)}</dd>
                                </div>
                            ) : null}
                            {profile.phone ? (
                                <div {...qa('host.userProfileView.field', { field: 'phone' })}>
                                    <dt className="text-sm text-gray-500">Телефон</dt>
                                    <dd>{profile.phone}</dd>
                                </div>
                            ) : null}
                        </dl>
                    </div>
                )}
            </AdaptiveCard>
        </AccountLayout>
    )
}

export default UserProfileView
