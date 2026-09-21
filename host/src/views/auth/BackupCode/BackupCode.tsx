import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router'
import { PiKeyDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Alert from '@/components/ui/Alert'
import { apiVerifyMfa } from '@/services/AuthService'
import { normalizeApiError } from '@/utils/apiError'
import { qa } from '@/shared/qa'

/**
 * SCR-AUTH-BACKUP-CODE — вход по резервному коду 2FA (FR-AUTH-10).
 * Closes the dangling `/auth/backup-code` link from SCR-AUTH-2FA.
 * States: ST-1 loading, ST-7 invalid/used code, ST-26 expired pre-auth, ST-29.
 */
const BackupCode = () => {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const preauthId = searchParams.get('preauthId') || ''

    const [code, setCode] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async () => {
        setError(null)
        setSubmitting(true)
        try {
            await apiVerifyMfa({ preauthId, backupCode: code })
            navigate('/') // ST-29
        } catch (e) {
            const err = normalizeApiError(e, 'Неверный или использованный код')
            if (err.status === 410) {
                navigate('/auth/signin?reason=token_expired')
                return
            }
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Container>
            <div className="min-h-screen flex items-center justify-center py-12 px-4">
                <AdaptiveCard className="max-w-md w-full">
                    <div className="text-center mb-6">
                        <div className="flex justify-center mb-4">
                            <PiKeyDuotone className="w-12 h-12 text-blue-500" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">
                            Резервный код
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400">
                            Введите один из резервных кодов
                        </p>
                    </div>

                    {error && (
                        <Alert showIcon type="danger" className="mb-4" {...qa('host.backupCode.error')}>
                            {error}
                        </Alert>
                    )}

                    <Input
                        value={code}
                        placeholder="XXXX-XXXX"
                        className="mb-4"
                        {...qa('host.backupCode.input')}
                        onChange={(e) => setCode(e.target.value)}
                    />
                    <Button
                        block
                        variant="solid"
                        color="primary"
                        loading={submitting}
                        disabled={code.trim().length === 0}
                        onClick={handleSubmit}
                        {...qa('host.backupCode.submit')}
                    >
                        Подтвердить
                    </Button>

                    <div className="text-center mt-6">
                        <Link
                            to={
                                preauthId
                                    ? `/auth/2fa?preauthId=${preauthId}`
                                    : '/auth/2fa'
                            }
                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            ← Код из приложения
                        </Link>
                    </div>
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default BackupCode
