import { useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Alert from '@/components/ui/Alert'
import type { ReauthCredential } from '@/services/AuthService'
import { qa, qaWithAlias } from '@/shared/qa'

interface ReauthDialogProps {
    isOpen: boolean
    /** Whether to ask for a TOTP code (when 2FA is enabled). */
    require2fa?: boolean
    title?: string
    description?: string
    confirmLabel?: string
    onClose: () => void
    /**
     * Called with the re-auth credential. Throw/reject to surface an inline
     * error inside the dialog; resolve to close it.
     */
    onConfirm: (cred: ReauthCredential) => Promise<void>
}

/**
 * Shared re-authentication dialog (FR-MPROF-8) — used by email-change,
 * password change, 2FA disable and backup-code regeneration. Sensitive
 * self-operations require the current password (+ TOTP when 2FA is on).
 */
const ReauthDialog = ({
    isOpen,
    require2fa = false,
    title = 'Подтвердите личность',
    description = 'Для продолжения введите текущий пароль.',
    confirmLabel = 'Подтвердить',
    onClose,
    onConfirm,
}: ReauthDialogProps) => {
    const [currentPassword, setCurrentPassword] = useState('')
    const [totpCode, setTotpCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const reset = () => {
        setCurrentPassword('')
        setTotpCode('')
        setError(null)
        setLoading(false)
    }

    const handleClose = () => {
        if (loading) return
        reset()
        onClose()
    }

    const handleConfirm = async () => {
        setError(null)
        setLoading(true)
        try {
            await onConfirm({
                currentPassword,
                totpCode: require2fa ? totpCode : undefined,
            })
            reset()
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : 'Не удалось подтвердить. Повторите попытку.',
            )
            setLoading(false)
        }
    }

    const disabled =
        loading ||
        currentPassword.length === 0 ||
        (require2fa && totpCode.trim().length === 0)

    return (
        <Dialog
            isOpen={isOpen}
            onClose={handleClose}
            onRequestClose={handleClose}
            {...qaWithAlias('host.reauthDialog.root', 'host.reauth.dialog')}
        >
            <h5 className="mb-2">{title}</h5>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {description}
            </p>
            {error && (
                <Alert
                    showIcon
                    type="danger"
                    className="mb-4"
                    {...qaWithAlias('host.reauthDialog.error', 'host.reauth.error')}
                >
                    {error}
                </Alert>
            )}
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Текущий пароль
                    </label>
                    <Input
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        placeholder="Введите пароль"
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        {...qaWithAlias('host.reauthDialog.password', 'host.reauth.password')}
                    />
                </div>
                {require2fa && (
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Код из приложения (2FA)
                        </label>
                        <Input
                            value={totpCode}
                            inputMode="numeric"
                            placeholder="6-значный код"
                            onChange={(e) => setTotpCode(e.target.value)}
                            {...qaWithAlias('host.reauthDialog.totp', 'host.reauth.totp')}
                        />
                    </div>
                )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
                <Button
                    variant="plain"
                    disabled={loading}
                    onClick={handleClose}
                    {...qaWithAlias('host.reauthDialog.cancel', 'host.reauth.cancel')}
                >
                    Отмена
                </Button>
                <Button
                    variant="solid"
                    color="primary"
                    loading={loading}
                    disabled={disabled}
                    onClick={handleConfirm}
                    {...qaWithAlias('host.reauthDialog.confirm', 'host.reauth.confirm')}
                >
                    {confirmLabel}
                </Button>
            </div>
        </Dialog>
    )
}

export default ReauthDialog
