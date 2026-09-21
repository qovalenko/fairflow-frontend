import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import AccountLayout from '../AccountLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Alert from '@/components/ui/Alert'
import {
    apiGetMyProfile,
    apiRequestEmailChange,
    apiCancelEmailChange,
} from '@/services/AuthService'
import { normalizeApiError, isSessionRevoked } from '@/utils/apiError'
import { notify } from '@/utils/notify'
import { useUnsavedChangesGuard } from '@/utils/hooks/useUnsavedChangesGuard'
import { qa } from '@/shared/qa'

/**
 * SCR-MPROF-EMAIL-CHANGE — Смена email (re-auth, FR-MPROF-18/19).
 * States: ST-1 loading, ST-7 error-action (per-field codes), ST-26 pending,
 * ST-29 success, ST-30 dirty-guard, ST-21 session revoked.
 */
const EmailChange = () => {
    const navigate = useNavigate()
    // Self-scoped account surface: own password/2FA/sessions/profile.
    // `profile:manage_self` was never registered in the RBAC catalog, so the
    // old gate can('profile','manage_self') fail-closed to DENY for EVERY user
    // (incl. owner) whenever a project projection was loaded — disabling own-
    // account actions. These endpoints are self-scoped (JwtAuthGuard is the
    // source of truth, BR-SHELL-4); no project permission applies here.
    const canManage = true

    const [currentEmail, setCurrentEmail] = useState('')
    const [require2fa, setRequire2fa] = useState(false)
    const [pendingEmail, setPendingEmail] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const [newEmail, setNewEmail] = useState('')
    const [password, setPassword] = useState('')
    const [totp, setTotp] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const [emailError, setEmailError] = useState<string | null>(null)
    const [passwordError, setPasswordError] = useState<string | null>(null)
    const [totpError, setTotpError] = useState<string | null>(null)
    const [banner, setBanner] = useState<string | null>(null)

    useEffect(() => {
        let mounted = true
        ;(async () => {
            try {
                const resp = await apiGetMyProfile()
                if (!mounted) return
                setCurrentEmail(resp?.user?.email ?? '')
                setRequire2fa(Boolean(resp?.user?.twoFactorEnabled))
                setPendingEmail(resp?.user?.pendingEmail ?? null)
            } catch {
                /* current email also available from store; non-fatal */
            } finally {
                if (mounted) setLoading(false)
            }
        })()
        return () => {
            mounted = false
        }
    }, [])

    // ST-30 dirty-guard (tab close + project switch, FR-PROJ-380)
    const dirty = newEmail !== '' || password !== '' || totp !== ''
    useUnsavedChangesGuard(dirty, 'email-change')
    useEffect(() => {
        if (!dirty) return
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = ''
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [dirty])

    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)
    const canSubmit =
        canManage &&
        emailValid &&
        password.length > 0 &&
        (!require2fa || totp.trim().length > 0)

    const clearErrors = () => {
        setEmailError(null)
        setPasswordError(null)
        setTotpError(null)
        setBanner(null)
    }

    const handleSubmit = async () => {
        clearErrors()
        setSubmitting(true)
        try {
            const resp = await apiRequestEmailChange({
                newEmail,
                currentPassword: password,
                totpCode: require2fa ? totp : undefined,
            })
            setPendingEmail(resp.pendingEmail || newEmail)
            setNewEmail('')
            setPassword('')
            setTotp('')
            notify('Письмо с подтверждением отправлено', 'success') // ST-29
        } catch (e) {
            const err = normalizeApiError(e)
            if (isSessionRevoked(err)) {
                navigate('/account/logout-forced')
                return
            }
            // ST-7: route the error to the relevant field by code.
            if (err.code === 'EMAIL_TAKEN' || err.code === 'ALREADY_EXISTS' || err.status === 409) {
                setEmailError(err.message)
            } else if (err.code === 'INVALID_TOTP') {
                setTotpError(err.message)
            } else if (
                err.code === 'INVALID_CREDENTIALS' ||
                err.code === 'REAUTH_REQUIRED' ||
                err.status === 403
            ) {
                setPasswordError(err.message)
            } else {
                setBanner(err.message)
            }
        } finally {
            setSubmitting(false)
        }
    }

    const handleCancelPending = async () => {
        try {
            await apiCancelEmailChange()
            setPendingEmail(null)
            notify('Запрос на смену email отменён', 'success')
        } catch (e) {
            notify(normalizeApiError(e).message, 'danger')
        }
    }

    return (
        <AccountLayout>
            <div className="max-w-xl">
                <AdaptiveCard>
                    <h5 className="mb-6" {...qa('host.emailChange.heading')}>
                        Смена email
                    </h5>

                    {loading ? (
                        <div className="space-y-3">
                            <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                            <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
                        </div>
                    ) : pendingEmail ? (
                        // ST-26 Pending
                        <div className="space-y-4" {...qa('host.emailChange.pending')}>
                            <Alert showIcon type="info" {...qa('host.emailChange.pendingInfo')}>
                                На адрес <strong>{pendingEmail}</strong> отправлено
                                письмо. До подтверждения действует текущий email
                                <strong> {currentEmail}</strong>.
                            </Alert>
                            <div className="flex gap-2">
                                <Button variant="plain" onClick={handleCancelPending} {...qa('host.emailChange.cancelPending')}>
                                    Отменить запрос
                                </Button>
                                <Button onClick={() => navigate('/account/profile')} {...qa('host.emailChange.toProfile')}>
                                    К профилю
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {banner && (
                                <Alert
                                    showIcon
                                    type="danger"
                                    {...qa('host.emailChange.banner')}
                                    {...qa('host.emailChange.error')}
                                >
                                    {banner}
                                </Alert>
                            )}
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Текущий email
                                </label>
                                <Input
                                    readOnly
                                    value={currentEmail}
                                    className="bg-gray-50 dark:bg-gray-800"
                                    {...qa('host.emailChange.currentEmail')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Новый email
                                </label>
                                <Input
                                    type="email"
                                    value={newEmail}
                                    placeholder="new@example.com"
                                    {...qa('host.emailChange.newEmail')}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    {...qa('host.emailChange.newEmail')}
                                />
                                {emailError && (
                                    <p className="text-xs text-red-600 mt-1" {...qa('host.emailChange.emailError')}>
                                        {emailError}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Текущий пароль
                                </label>
                                <Input
                                    type="password"
                                    autoComplete="current-password"
                                    value={password}
                                    {...qa('host.emailChange.password')}
                                    onChange={(e) => setPassword(e.target.value)}
                                    {...qa('host.emailChange.password')}
                                />
                                {passwordError && (
                                    <p className="text-xs text-red-600 mt-1" {...qa('host.emailChange.passwordError')}>
                                        {passwordError}
                                    </p>
                                )}
                            </div>
                            {require2fa && (
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Код 2FA
                                    </label>
                                    <Input
                                        value={totp}
                                        inputMode="numeric"
                                        placeholder="6-значный код"
                                        {...qa('host.emailChange.totp')}
                                        onChange={(e) => setTotp(e.target.value)}
                                        {...qa('host.emailChange.totp')}
                                    />
                                    {totpError && (
                                        <p className="text-xs text-red-600 mt-1" {...qa('host.emailChange.totpError')}>
                                            {totpError}
                                        </p>
                                    )}
                                </div>
                            )}
                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    variant="plain"
                                    onClick={() => navigate('/account/profile')}
                                    {...qa('host.emailChange.cancel')}
                                >
                                    Отмена
                                </Button>
                                <Button
                                    variant="solid"
                                    color="primary"
                                    loading={submitting}
                                    disabled={!canSubmit}
                                    onClick={handleSubmit}
                                    {...qa('host.emailChange.submit')}
                                >
                                    Подтвердить смену
                                </Button>
                            </div>
                        </div>
                    )}
                </AdaptiveCard>
            </div>
        </AccountLayout>
    )
}

export default EmailChange
