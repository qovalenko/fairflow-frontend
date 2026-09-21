import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { PiCopyDuotone } from 'react-icons/pi'
import AccountLayout from '../AccountLayout'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Alert from '@/components/ui/Alert'
import Checkbox from '@/components/ui/Checkbox'
import ReauthDialog from '@/components/shared/ReauthDialog'
import BackupCodesPanel from '@/components/shared/BackupCodesPanel'
import {
    apiGetMyProfile,
    apiInit2fa,
    apiEnable2fa,
} from '@/services/AuthService'
import { normalizeApiError, isSessionRevoked } from '@/utils/apiError'
import { useUnsavedChangesGuard } from '@/utils/hooks/useUnsavedChangesGuard'
import { qa, qaWithAlias } from '@/shared/qa'

type Step = 'reauth' | 'qr' | 'codes'

/**
 * SCR-MPROF-2FA-SETUP — мастер включения 2FA (FR-MPROF-9/11/13).
 * Steps: re-auth → QR/secret (init) → TOTP verify (enable) → backup codes (once).
 * States: ST-1 init loading, ST-6 init error, ST-7 INVALID_TOTP/NO_PENDING_2FA,
 * ST-26 pending secret, ST-29 success, ST-30 abandon guard at codes step.
 */
const TwoFaSetup = () => {
    const navigate = useNavigate()
    // Self-scoped account surface: own password/2FA/sessions/profile.
    // `profile:manage_self` was never registered in the RBAC catalog, so the
    // old gate can('profile','manage_self') fail-closed to DENY for EVERY user
    // (incl. owner) whenever a project projection was loaded — disabling own-
    // account actions. These endpoints are self-scoped (JwtAuthGuard is the
    // source of truth, BR-SHELL-4); no project permission applies here.
    const canManage = true

    const [require2faPolicy, setRequire2faPolicy] = useState(false)
    const [step, setStep] = useState<Step>('reauth')

    const [initLoading, setInitLoading] = useState(false)
    const [initError, setInitError] = useState<string | null>(null)
    const [secret, setSecret] = useState('')
    const [otpauthUri, setOtpauthUri] = useState('')
    const [qrSvg, setQrSvg] = useState<string | undefined>()

    const [code, setCode] = useState('')
    const [enabling, setEnabling] = useState(false)
    const [codeError, setCodeError] = useState<string | null>(null)

    const [backupCodes, setBackupCodes] = useState<string[]>([])
    const [savedAck, setSavedAck] = useState(false)

    useEffect(() => {
        let mounted = true
        ;(async () => {
            try {
                const resp = await apiGetMyProfile()
                if (!mounted) return
                // already enabled → bounce back
                if (resp?.user?.twoFactorEnabled) {
                    navigate('/account/security', { replace: true })
                    return
                }
                setRequire2faPolicy(Boolean(resp?.user?.require2fa))
            } catch {
                /* non-fatal */
            }
        })()
        return () => {
            mounted = false
        }
    }, [navigate])

    // ST-30 abandon guard at the codes step (codes shown once)
    useUnsavedChangesGuard(step === 'codes' && !savedAck, '2fa-setup')
    useEffect(() => {
        if (step !== 'codes' || savedAck) return
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault()
            e.returnValue = ''
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [step, savedAck])

    const runInit = useCallback(async (cred: {
        currentPassword: string
        totpCode?: string
    }) => {
        setInitError(null)
        setInitLoading(true)
        try {
            const resp = await apiInit2fa(cred)
            setSecret(resp.secret)
            setOtpauthUri(resp.otpauthUri)
            setQrSvg(resp.qrSvg)
            setStep('qr')
        } catch (e) {
            const err = normalizeApiError(e)
            if (isSessionRevoked(err)) {
                navigate('/account/logout-forced')
                return
            }
            throw new Error(err.message) // shown inside ReauthDialog
        } finally {
            setInitLoading(false)
        }
    }, [navigate])

    const handleEnable = async () => {
        setCodeError(null)
        setEnabling(true)
        try {
            const resp = await apiEnable2fa(code)
            setBackupCodes(resp.backupCodes || [])
            setStep('codes')
        } catch (e) {
            const err = normalizeApiError(e)
            if (isSessionRevoked(err)) {
                navigate('/account/logout-forced')
                return
            }
            setCodeError(err.message) // ST-7
        } finally {
            setEnabling(false)
        }
    }

    return (
        <AccountLayout>
            <div className="max-w-xl">
                <AdaptiveCard>
                    <h5 className="mb-6" {...qa('host.twoFaSetup.heading')}>
                        Включение двухфакторной аутентификации
                    </h5>

                    {!canManage ? (
                        <Alert showIcon type="info">
                            Недостаточно прав для управления 2FA.
                        </Alert>
                    ) : step === 'reauth' ? (
                        <div className="space-y-4" {...qa('host.twoFaSetup.reauth')}>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Подтвердите личность, чтобы начать настройку.
                            </p>
                            {require2faPolicy && (
                                <Alert showIcon type="info" {...qa('host.2faSetup.require2faBanner')}>
                                    Организация требует 2FA для вашей роли.
                                </Alert>
                            )}
                            <ReauthDialog
                                isOpen
                                title="Подтвердите личность"
                                description="Введите текущий пароль для начала настройки 2FA."
                                confirmLabel="Продолжить"
                                onClose={() => navigate('/account/security')}
                                onConfirm={runInit}
                            />
                            {initLoading && (
                                <p className="text-sm text-gray-500">
                                    Генерируем секрет…
                                </p>
                            )}
                            {initError && (
                                <Alert showIcon type="danger" {...qa('host.twoFaSetup.initError')}>
                                    {initError}
                                </Alert>
                            )}
                        </div>
                    ) : step === 'qr' ? (
                        <div className="space-y-5" {...qa('host.twoFaSetup.qrStep')}>
                            <div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                    Отсканируйте QR-код приложением-аутентификатором
                                    или введите секрет вручную.
                                </p>
                                <div className="flex flex-col items-center gap-3">
                                    {qrSvg ? (
                                        <div
                                            className="w-44 h-44"
                                            {...qa('host.2faSetup.qr')}
                                            // QR is server-rendered SVG from otpauth URI
                                            dangerouslySetInnerHTML={{
                                                __html: qrSvg,
                                            }}
                                            {...qa('host.twoFaSetup.qr')}
                                        />
                                    ) : (
                                        <div
                                            className="w-44 h-44 flex items-center justify-center border border-dashed rounded text-xs text-gray-400 text-center p-2 break-all"
                                            {...qa('host.twoFaSetup.qrFallback')}
                                        >
                                            {otpauthUri || 'QR недоступен'}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2 w-full">
                                        <Input
                                            readOnly
                                            value={secret}
                                            {...qaWithAlias('host.twoFaSetup.secret', 'host.2faSetup.secret')}
                                        />
                                        <Button
                                            size="sm"
                                            icon={<PiCopyDuotone />}
                                            onClick={() =>
                                                navigator.clipboard?.writeText(
                                                    secret,
                                                )
                                            }
                                            {...qa('host.twoFaSetup.copySecret')}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Код из приложения
                                </label>
                                <Input
                                    value={code}
                                    inputMode="numeric"
                                    placeholder="6-значный код"
                                    {...qa('host.twoFaSetup.code')}
                                    onChange={(e) => setCode(e.target.value)}
                                    {...qaWithAlias('host.twoFaSetup.code', 'host.2faSetup.totpCode')}
                                />
                                {codeError && (
                                    <p
                                        className="text-xs text-red-600 mt-1"
                                        {...qaWithAlias('host.twoFaSetup.codeError', 'host.2faSetup.codeError')}
                                    >
                                        {codeError}
                                    </p>
                                )}
                            </div>
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="plain"
                                    onClick={() => navigate('/account/security')}
                                    {...qaWithAlias('host.twoFaSetup.cancel', 'host.2faSetup.cancel')}
                                >
                                    Отмена
                                </Button>
                                <Button
                                    variant="solid"
                                    color="primary"
                                    loading={enabling}
                                    disabled={code.trim().length === 0}
                                    onClick={handleEnable}
                                    {...qaWithAlias('host.twoFaSetup.activate', 'host.2faSetup.activate')}
                                >
                                    Активировать
                                </Button>
                            </div>
                        </div>
                    ) : (
                        // step === 'codes' — ST-29 success
                        <div className="space-y-5" {...qa('host.twoFaSetup.codesStep')}>
                            <Alert showIcon type="success" {...qa('host.twoFaSetup.success')}>
                                Двухфакторная аутентификация включена.
                            </Alert>
                            <BackupCodesPanel codes={backupCodes} />
                            <Checkbox
                                checked={savedAck}
                                onChange={(val) => setSavedAck(val)}
                                {...qaWithAlias('host.twoFaSetup.savedAck', 'host.2faSetup.savedAck')}
                            >
                                Я сохранил резервные коды
                            </Checkbox>
                            <div className="flex justify-end">
                                <Button
                                    variant="solid"
                                    color="primary"
                                    disabled={!savedAck}
                                    onClick={() => navigate('/account/security')}
                                    {...qaWithAlias('host.twoFaSetup.done', 'host.2faSetup.done')}
                                >
                                    Готово
                                </Button>
                            </div>
                        </div>
                    )}
                </AdaptiveCard>
            </div>
        </AccountLayout>
    )
}

export default TwoFaSetup
