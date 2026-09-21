import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import AccountLayout from '../AccountLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import ReauthDialog from '@/components/shared/ReauthDialog'
import BackupCodesPanel from '@/components/shared/BackupCodesPanel'
import {
    apiGetMyProfile,
    apiRegenerateBackupCodes,
} from '@/services/AuthService'
import { normalizeApiError, isSessionRevoked } from '@/utils/apiError'
import { useUnsavedChangesGuard } from '@/utils/hooks/useUnsavedChangesGuard'
import { qa } from '@/shared/qa'

/**
 * SCR-MPROF-2FA-BACKUP — резервные коды 2FA (FR-MPROF-12a).
 * States: ST-1 counter loading, ST-6 load error, ST-7 reauth/429, ST-9 redirect
 * when 2FA off, ST-26 fresh codes shown once, ST-29 success, ST-30 abandon guard.
 */
const TwoFaBackup = () => {
    const navigate = useNavigate()
    // Self-scoped account surface: own password/2FA/sessions/profile.
    // `profile:manage_self` was never registered in the RBAC catalog, so the
    // old gate can('profile','manage_self') fail-closed to DENY for EVERY user
    // (incl. owner) whenever a project projection was loaded — disabling own-
    // account actions. These endpoints are self-scoped (JwtAuthGuard is the
    // source of truth, BR-SHELL-4); no project permission applies here.
    const canManage = true

    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(false)
    const [remaining, setRemaining] = useState<number | null>(null)

    const [reauthOpen, setReauthOpen] = useState(false)
    const [newCodes, setNewCodes] = useState<string[] | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setLoadError(false)
        try {
            const resp = await apiGetMyProfile()
            // ST-9: do not show backup screen without active 2FA.
            if (!resp?.user?.twoFactorEnabled) {
                navigate('/account/security', { replace: true })
                return
            }
            setRemaining(resp.user.backupCodesRemaining ?? null)
        } catch {
            setLoadError(true)
        } finally {
            setLoading(false)
        }
    }, [navigate])

    useEffect(() => {
        load()
    }, [load])

    // ST-30 guard while new codes are on screen
    useUnsavedChangesGuard(Boolean(newCodes), '2fa-backup')
    useEffect(() => {
        if (!newCodes) return
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = ''
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [newCodes])

    const handleRegenerate = async (cred: {
        currentPassword: string
        totpCode?: string
    }) => {
        try {
            const resp = await apiRegenerateBackupCodes(cred)
            setNewCodes(resp.backupCodes || [])
            setRemaining((resp.backupCodes || []).length)
            setReauthOpen(false)
        } catch (e) {
            const err = normalizeApiError(e)
            if (isSessionRevoked(err)) {
                navigate('/account/logout-forced')
                return
            }
            throw new Error(err.message)
        }
    }

    return (
        <AccountLayout>
            <div className="max-w-xl">
                <AdaptiveCard>
                    <h5 className="mb-6" {...qa('host.twoFaBackup.heading')}>
                        Резервные коды
                    </h5>

                    {loadError ? (
                        <Alert
                            showIcon
                            type="danger"
                            className="flex items-center justify-between"
                            {...qa('host.twoFaBackup.loadError')}
                            {...qa('host.2faBackup.loadError')}
                        >
                            <span>Не удалось загрузить данные.</span>
                            <Button
                                size="xs"
                                onClick={load}
                                {...qa('host.twoFaBackup.retry')}
                                {...qa('host.2faBackup.retry')}
                            >
                                Повторить
                            </Button>
                        </Alert>
                    ) : loading ? (
                        <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" {...qa('host.twoFaBackup.loading')} />
                    ) : newCodes ? (
                        // ST-26 / ST-29: fresh codes shown once
                        <div className="space-y-5">
                            <Alert showIcon type="success" {...qa('host.twoFaBackup.success')}>
                                Коды перевыпущены. Прежние коды недействительны.
                            </Alert>
                            <BackupCodesPanel codes={newCodes} />
                            <div className="flex justify-end">
                                <Button
                                    variant="solid"
                                    color="primary"
                                    onClick={() => navigate('/account/security')}
                                    {...qa('host.twoFaBackup.done')}
                                >
                                    Готово
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Резервные коды позволяют войти, если приложение-
                                аутентификатор недоступно.
                            </p>
                            {remaining !== null && (
                                <p className="text-sm" {...qa('host.twoFaBackup.remaining')} {...qa('host.2faBackup.remaining')}>
                                    Неиспользованных кодов:{' '}
                                    <strong>{remaining}</strong>
                                </p>
                            )}
                            <div className="flex gap-2">
                                <Button
                                    variant="plain"
                                    onClick={() => navigate('/account/security')}
                                    {...qa('host.twoFaBackup.back')}
                                >
                                    Назад
                                </Button>
                                {canManage && (
                                    <Button
                                        variant="solid"
                                        color="primary"
                                        onClick={() => setReauthOpen(true)}
                                        {...qa('host.twoFaBackup.regenerate')}
                                        {...qa('host.2faBackup.regenerate')}
                                    >
                                        Перевыпустить коды
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </AdaptiveCard>
            </div>

            <ReauthDialog
                require2fa
                isOpen={reauthOpen}
                title="Перевыпуск кодов"
                description="Подтвердите личность для перевыпуска резервных кодов."
                confirmLabel="Перевыпустить"
                onClose={() => setReauthOpen(false)}
                onConfirm={handleRegenerate}
            />
        </AccountLayout>
    )
}

export default TwoFaBackup
