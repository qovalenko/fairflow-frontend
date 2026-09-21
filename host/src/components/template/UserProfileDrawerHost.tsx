import { useCallback, useEffect, useState, type ReactNode } from 'react'
import Drawer from '@/components/ui/Drawer'
import Avatar from '@/components/ui/Avatar'
import Spinner from '@/components/ui/Spinner'
import Button from '@/components/ui/Button'
import { useNavigate } from 'react-router'
import {
    apiGetForeignUserProfile,
    type ForeignUserProfile,
} from '@/services/AuthService'
import { normalizeApiError } from '@/utils/apiError'
import {
    registerEntityDrawerOpener,
    registerUserProfileOpener,
} from '@/components/shared/userProfileBridge'
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

const ProfileBody = ({ profile }: { profile: ForeignUserProfile }) => (
    <div className="flex flex-col gap-6" {...qa('host.userProfileDrawer.body')}>
        <div className="flex items-center gap-4">
            <Avatar
                size={64}
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
        <dl className="grid gap-3">
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

/**
 * Global colleague profile drawer (SCR-MPROF-USER-VIEW / global.drawer.entity).
 */
export default function UserProfileDrawerHost({ children }: { children: ReactNode }) {
    const navigate = useNavigate()
    const [userId, setUserId] = useState<string | null>(null)
    const [profile, setProfile] = useState<ForeignUserProfile | null>(null)
    const [loading, setLoading] = useState(false)
    const [notFound, setNotFound] = useState(false)

    const close = useCallback(() => {
        setUserId(null)
        setProfile(null)
        setNotFound(false)
        setLoading(false)
    }, [])

    const open = useCallback((id: string) => {
        setUserId(id)
        setProfile(null)
        setNotFound(false)
        setLoading(true)
    }, [])

    useEffect(() => {
        registerUserProfileOpener(open)
        registerEntityDrawerOpener((entityType, entityId) => {
            if (entityType === 'user') open(entityId)
        })
    }, [open])

    useEffect(() => {
        if (!userId) return
        let mounted = true
        ;(async () => {
            setLoading(true)
            setNotFound(false)
            try {
                const res = await apiGetForeignUserProfile(userId)
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
    }, [userId])

    return (
        <>
            {children}
            <Drawer
                isOpen={!!userId}
                onClose={close}
                onRequestClose={close}
                title="Профиль коллеги"
                width={480}
                {...qa('host.userProfileDrawer.drawer')}
                footer={
                    userId && !notFound ? (
                        <Button
                            variant="plain"
                            {...qa('host.userProfileDrawer.openFull')}
                            onClick={() => {
                                close()
                                navigate(`/account/users/${userId}`)
                            }}
                        >
                            Открыть полностью
                        </Button>
                    ) : undefined
                }
            >
                {loading ? (
                    <div className="flex justify-center py-12" {...qa('host.userProfileDrawer.loading')}>
                        <Spinner size={32} />
                    </div>
                ) : notFound ? (
                    <p className="text-gray-600" {...qa('host.userProfileDrawer.notFound')}>
                        Пользователь не найден.
                    </p>
                ) : profile ? (
                    <ProfileBody profile={profile} />
                ) : (
                    <p className="text-gray-600" {...qa('host.userProfileDrawer.loadError')}>
                        Не удалось загрузить профиль.
                    </p>
                )}
            </Drawer>
        </>
    )
}
