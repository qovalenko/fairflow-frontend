import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
    PiShieldDuotone,
    PiShieldCheckDuotone,
    PiShieldSlashDuotone,
    PiArrowRightDuotone,
    PiQuestion,
} from 'react-icons/pi'
import AccountLayout from '../AccountLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Alert from '@/components/ui/Alert'
import Progress from '@/components/ui/Progress'
import Tooltip from '@/components/ui/Tooltip'
import ReauthDialog from '@/components/shared/ReauthDialog'
import {
    apiGetMyProfile,
    apiChangeMyPassword,
    apiDisable2fa,
} from '@/services/AuthService'
import { normalizeApiError, isSessionRevoked } from '@/utils/apiError'
import { notify } from '@/utils/notify'
import { qa } from '@/shared/qa'

/** «?»-иконка с подсказкой при наведении (поля без подписей). */
const HelpIcon = ({ title }: { title: string }) => (
    <Tooltip title={title}>
        <span className="flex cursor-help text-gray-400 hover:text-gray-200">
            <PiQuestion className="text-lg" />
        </span>
    </Tooltip>
)

/**
 * SCR-MPROF-SECURITY — пароль + статус 2FA + вход в сессии (FR-MPROF-6/7/8/10).
 * Replaces the AS-IS console.log mock: real password change + real 2FA status,
 * re-auth for disable, element-gating by `require2fa`, all states from catalog.
 */
const Security = () => {
    const navigate = useNavigate()
    // Self-scoped account surface: own password/2FA/sessions/profile.
    // `profile:manage_self` was never registered in the RBAC catalog, so the
    // old gate can('profile','manage_self') fail-closed to DENY for EVERY user
    // (incl. owner) whenever a project projection was loaded — disabling own-
    // account actions. These endpoints are self-scoped (JwtAuthGuard is the
    // source of truth, BR-SHELL-4); no project permission applies here.
    const canManage = true

    // 2FA status (ST-1 / ST-6)
    const [statusLoading, setStatusLoading] = useState(true)
    const [statusError, setStatusError] = useState(false)
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
    const [require2fa, setRequire2fa] = useState(false)
    const [backupRemaining, setBackupRemaining] = useState<number | null>(null)

    // password form
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [savingPassword, setSavingPassword] = useState(false)
    const [passwordError, setPasswordError] = useState<string | null>(null)

    const [disableOpen, setDisableOpen] = useState(false)

    const loadStatus = useCallback(async () => {
        setStatusLoading(true)
        setStatusError(false)
        try {
            const resp = await apiGetMyProfile()
            setTwoFactorEnabled(Boolean(resp?.user?.twoFactorEnabled))
            setRequire2fa(Boolean(resp?.user?.require2fa))
            setBackupRemaining(resp?.user?.backupCodesRemaining ?? null)
        } catch {
            setStatusError(true)
        } finally {
            setStatusLoading(false)
        }
    }, [])

    useEffect(() => {
        loadStatus()
    }, [loadStatus])

    const calculatePasswordStrength = (password: string) => {
        if (!password) return { strength: 0, label: '' }
        let strength = 0
        if (password.length >= 8) strength++
        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++
        if (/\d/.test(password)) strength++
        if (/[^a-zA-Z\d]/.test(password)) strength++
        const labels = ['Очень слабый', 'Слабый', 'Средний', 'Хороший', 'Отличный']
        return { strength: strength * 25, label: labels[strength - 1] || '' }
    }

    const passwordStrength = calculatePasswordStrength(newPassword)

    const handleChangePassword = async () => {
        setPasswordError(null)
        setSavingPassword(true)
        try {
            const resp = await apiChangeMyPassword({ currentPassword, newPassword })
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
            const revoked = resp?.revokedSessions
            notify(
                revoked
                    ? `Пароль изменён. Прочие сессии завершены (${revoked})`
                    : 'Пароль изменён',
                'success',
            ) // ST-29
        } catch (e) {
            const err = normalizeApiError(e)
            if (isSessionRevoked(err)) {
                navigate('/account/logout-forced')
                return
            }
            setPasswordError(err.message) // ST-7
        } finally {
            setSavingPassword(false)
        }
    }

    const handleDisable2fa = async (cred: {
        currentPassword: string
        totpCode?: string
    }) => {
        try {
            await apiDisable2fa(cred)
            setDisableOpen(false)
            setTwoFactorEnabled(false)
            notify('Двухфакторная аутентификация отключена', 'success')
            loadStatus()
        } catch (e) {
            const err = normalizeApiError(e)
            if (isSessionRevoked(err)) {
                navigate('/account/logout-forced')
                return
            }
            throw new Error(err.message) // surface inside ReauthDialog
        }
    }

    const passwordDisabled =
        !canManage ||
        !currentPassword ||
        !newPassword ||
        newPassword !== confirmPassword

    return (
        <AccountLayout>
            <div className="space-y-6">
                <h2 className="text-2xl font-semibold" {...qa('host.security.heading')}>
                    Безопасность
                </h2>

                {/* Пароль */}
                <AdaptiveCard>
                    <h5 className="mb-6">Пароль</h5>

                    <div className="space-y-4 max-w-lg">
                        {passwordError && (
                            <Alert showIcon type="danger" {...qa('host.security.passwordError')}>
                                {passwordError}
                            </Alert>
                        )}
                        <div>
                            <Input
                                type="password"
                                autoComplete="current-password"
                                value={currentPassword}
                                placeholder="Текущий пароль"
                                suffix={<HelpIcon title="Текущий пароль" />}
                                {...qa('host.security.currentPassword')}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                {...qa('host.security.currentPassword')}
                            />
                        </div>
                        <div>
                            <Input
                                type="password"
                                autoComplete="new-password"
                                value={newPassword}
                                placeholder="Новый пароль"
                                suffix={<HelpIcon title="Новый пароль" />}
                                {...qa('host.security.newPassword')}
                                onChange={(e) => setNewPassword(e.target.value)}
                                {...qa('host.security.newPassword')}
                            />
                            {newPassword && (
                                <div className="mt-2" {...qa('host.security.passwordStrength')}>
                                    <Progress
                                        percent={passwordStrength.strength}
                                        customColorClass={
                                            passwordStrength.strength < 50
                                                ? 'bg-red-500'
                                                : passwordStrength.strength < 75
                                                  ? 'bg-yellow-500'
                                                  : 'bg-green-500'
                                        }
                                    />
                                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                        {passwordStrength.label}
                                    </p>
                                </div>
                            )}
                        </div>
                        <div>
                            <Input
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                placeholder="Повторите новый пароль"
                                suffix={<HelpIcon title="Подтвердите пароль" />}
                                {...qa('host.security.confirmPassword')}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                {...qa('host.security.confirmPassword')}
                            />
                            {confirmPassword && newPassword !== confirmPassword && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-1" {...qa('host.security.passwordMismatch')}>
                                    Пароли не совпадают
                                </p>
                            )}
                        </div>
                        <Button
                            variant="solid"
                            color="primary"
                            loading={savingPassword}
                            disabled={passwordDisabled}
                            onClick={handleChangePassword}
                            {...qa('host.security.changePassword')}
                        >
                            Изменить пароль
                        </Button>
                    </div>
                </AdaptiveCard>

                {/* Двухфакторная аутентификация */}
                <AdaptiveCard>
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h5 className="mb-1">
                                Двухфакторная аутентификация
                            </h5>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Добавьте дополнительный уровень безопасности к
                                вашему аккаунту
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {statusLoading ? (
                                <div
                                    className="h-7 w-24 bg-gray-100 dark:bg-gray-800 rounded animate-pulse"
                                    {...qa('host.security.2faStatusLoading')}
                                />
                            ) : twoFactorEnabled ? (
                                <Tag
                                    className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                    {...qa('host.security.twoFaEnabled')}
                                    {...qa('host.security.2faBadge', { enabled: 'true' })}
                                >
                                    <PiShieldCheckDuotone className="w-4 h-4 mr-1" />
                                    Включено
                                </Tag>
                            ) : (
                                <Tag
                                    className="bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                    {...qa('host.security.twoFaDisabled')}
                                    {...qa('host.security.2faBadge', { enabled: 'false' })}
                                >
                                    <PiShieldSlashDuotone className="w-4 h-4 mr-1" />
                                    Выключено
                                </Tag>
                            )}
                        </div>
                    </div>

                    {statusError ? (
                        // ST-6
                        <Alert
                            showIcon
                            type="danger"
                            className="flex items-center justify-between"
                            {...qa('host.security.twoFaLoadError')}
                            {...qa('host.security.2faStatusError')}
                        >
                            <span>Не удалось получить статус 2FA.</span>
                            <Button
                                size="xs"
                                onClick={loadStatus}
                                {...qa('host.security.twoFaRetry')}
                                {...qa('host.security.2faStatusRetry')}
                            >
                                Повторить
                            </Button>
                        </Alert>
                    ) : statusLoading ? (
                        <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                    ) : !twoFactorEnabled ? (
                        <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                Используйте приложение-аутентификатор для
                                генерации кодов безопасности
                            </p>
                            {canManage && (
                                <Link to="/account/security/2fa/setup" {...qa('host.security.enable2faLink')}>
                                    <Button
                                        variant="solid"
                                        color="primary"
                                        icon={<PiShieldDuotone />}
                                        {...qa('host.security.enable2fa')}
                                    >
                                        Включить 2FA
                                    </Button>
                                </Link>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <div className="flex items-start gap-3">
                                    <PiShieldCheckDuotone className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium mb-1">
                                            Двухфакторная аутентификация активна
                                        </p>
                                        <p className="text-xs text-gray-600 dark:text-gray-400">
                                            Используется приложение-аутентификатор
                                            (TOTP)
                                        </p>
                                    </div>
                                </div>
                            </div>
                            {backupRemaining !== null && backupRemaining <= 2 && (
                                <Alert
                                    showIcon
                                    type="warning"
                                    {...qa('host.security.backupLowWarning')}
                                    {...qa('host.security.lowBackupCodes')}
                                >
                                    Осталось мало резервных кодов (
                                    {backupRemaining}). Рекомендуем перевыпустить.
                                </Alert>
                            )}
                            <div className="flex gap-2">
                                <Link to="/account/security/2fa/backup-codes" {...qa('host.security.backupCodesLink')}>
                                    <Button variant="plain" {...qa('host.security.backupCodes')}>
                                        Резервные коды
                                    </Button>
                                </Link>
                                {/* ST-12: disable blocked by org policy */}
                                {require2fa ? (
                                    <Tooltip title="Запрещено политикой организации">
                                        <Button
                                            disabled
                                            variant="plain"
                                            color="red"
                                            {...qa('host.security.disable2faBlocked')}
                                            {...qa('host.security.disable2fa')}
                                        >
                                            Отключить 2FA
                                        </Button>
                                    </Tooltip>
                                ) : (
                                    canManage && (
                                        <Button
                                            variant="plain"
                                            color="red"
                                            onClick={() => setDisableOpen(true)}
                                            {...qa('host.security.disable2fa')}
                                        >
                                            Отключить 2FA
                                        </Button>
                                    )
                                )}
                            </div>
                        </div>
                    )}
                </AdaptiveCard>

                {/* Активные сессии */}
                <AdaptiveCard>
                    <div className="flex items-center justify-between">
                        <div>
                            <h5 className="mb-1">Активные сессии</h5>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Управляйте устройствами, на которых вы вошли в
                                систему
                            </p>
                        </div>
                        <Link to="/account/security/sessions" {...qa('host.security.sessionsLink')}>
                            <Button variant="plain" icon={<PiArrowRightDuotone />} {...qa('host.security.sessions')}>
                                Активные сессии
                            </Button>
                        </Link>
                    </div>
                </AdaptiveCard>
            </div>

            <ReauthDialog
                require2fa
                isOpen={disableOpen}
                title="Отключение 2FA"
                description="Для отключения двухфакторной аутентификации подтвердите личность."
                confirmLabel="Отключить 2FA"
                onClose={() => setDisableOpen(false)}
                onConfirm={handleDisable2fa}
            />
        </AccountLayout>
    )
}

export default Security
