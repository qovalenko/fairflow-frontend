import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import {
    PiCheckCircleDuotone,
    PiWarningCircleDuotone,
    PiSpinnerGapDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import {
    apiConfirmEmailVerify,
    apiRequestEmailVerify,
} from '@/services/AuthService'
import { normalizeApiError } from '@/utils/apiError'
import { notify } from '@/utils/notify'
import { qa } from '@/shared/qa'

type Phase = 'loading' | 'success' | 'expired' | 'error'

/**
 * SCR-AUTH-VERIFY-EMAIL — Подтверждение email (FR-AUTH-4).
 * Closes OQ-UX-AUTH-7: reads token from BOTH path-param and query, calls a real
 * confirm endpoint; states ST-1 loading / ST-9 410 expired / ST-29 success /
 * ST-7 resend error; "Отправить повторно" → реальный resend.
 */
const VerifyEmail = () => {
    const navigate = useNavigate()
    const params = useParams<{ token?: string }>()
    const [searchParams] = useSearchParams()
    const token = params.token || searchParams.get('token') || ''
    const email = searchParams.get('email') || undefined

    const [phase, setPhase] = useState<Phase>('loading')
    const [resending, setResending] = useState(false)

    useEffect(() => {
        let mounted = true
        if (!token) {
            setPhase('expired')
            return
        }
        ;(async () => {
            try {
                await apiConfirmEmailVerify(token)
                if (mounted) setPhase('success')
            } catch (e) {
                if (!mounted) return
                const err = normalizeApiError(e)
                setPhase(
                    err.status === 410 || err.code === 'TOKEN_EXPIRED'
                        ? 'expired'
                        : 'error',
                )
            }
        })()
        return () => {
            mounted = false
        }
    }, [token])

    const handleResend = async () => {
        setResending(true)
        try {
            await apiRequestEmailVerify(email)
            notify('Письмо отправлено повторно', 'success')
        } catch (e) {
            notify(normalizeApiError(e).message, 'danger')
        } finally {
            setResending(false)
        }
    }

    return (
        <Container>
            <div className="min-h-screen flex items-center justify-center py-12 px-4">
                <AdaptiveCard className="max-w-md w-full">
                    <div className="text-center">
                        {phase === 'loading' && (
                            <div {...qa('host.verifyEmail.loading')}>
                                <div className="flex justify-center mb-4">
                                    <PiSpinnerGapDuotone className="w-16 h-16 text-blue-500 animate-spin" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2">
                                    Подтверждаем email…
                                </h2>
                                <p className="text-gray-600 dark:text-gray-400">
                                    Это займёт несколько секунд.
                                </p>
                            </div>
                        )}

                        {phase === 'success' && (
                            <div {...qa('host.verifyEmail.success')}>
                                <div className="flex justify-center mb-4">
                                    <PiCheckCircleDuotone className="w-16 h-16 text-emerald-500" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2">
                                    Email подтверждён!
                                </h2>
                                <p className="text-gray-600 dark:text-gray-400 mb-6">
                                    Теперь вы можете продолжить работу.
                                </p>
                                <Button
                                    block
                                    variant="solid"
                                    color="primary"
                                    onClick={() => navigate('/onboarding')}
                                    {...qa('host.verifyEmail.continue')}
                                >
                                    Продолжить
                                </Button>
                            </div>
                        )}

                        {(phase === 'expired' || phase === 'error') && (
                            <div {...qa('host.verifyEmail.expired')}>
                                <div className="flex justify-center mb-4">
                                    <PiWarningCircleDuotone className="w-16 h-16 text-red-500" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2">
                                    {phase === 'expired'
                                        ? 'Ссылка недействительна'
                                        : 'Не удалось подтвердить'}
                                </h2>
                                <p className="text-gray-600 dark:text-gray-400 mb-6">
                                    {phase === 'expired'
                                        ? 'Ссылка истекла или уже использована. Запросите новое письмо.'
                                        : 'Произошла ошибка. Попробуйте запросить письмо повторно.'}
                                </p>
                                <Button
                                    block
                                    variant="solid"
                                    color="primary"
                                    loading={resending}
                                    onClick={handleResend}
                                    {...qa('host.verifyEmail.resend')}
                                >
                                    Отправить письмо повторно
                                </Button>
                                <Button
                                    block
                                    variant="plain"
                                    className="mt-3"
                                    onClick={() => navigate('/auth/signin')}
                                    {...qa('host.verifyEmail.toSignIn')}
                                >
                                    Ко входу
                                </Button>
                            </div>
                        )}
                    </div>
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default VerifyEmail
