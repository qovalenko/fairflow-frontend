import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
    PiCheckCircleDuotone,
    PiWarningCircleDuotone,
    PiSpinnerGapDuotone,
} from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import { qa, qaWithAlias } from '@/shared/qa'
import { apiConfirmEmailChange } from '@/services/AuthService'
import { normalizeApiError } from '@/utils/apiError'

type Phase = 'loading' | 'success' | 'expired' | 'error'

/**
 * SCR-MPROF-EMAIL-CONFIRM — публичная deep-link страница подтверждения нового
 * email (FR-MPROF-18). Без AccountLayout/сайдбара; валидация токена на бэке.
 * States: ST-1 loading, ST-7 INVALID_TOKEN, ST-9 410 expired, ST-29 success.
 */
const EmailConfirm = () => {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token') || ''

    const [phase, setPhase] = useState<Phase>('loading')

    useEffect(() => {
        let mounted = true
        if (!token) {
            setPhase('error')
            return
        }
        ;(async () => {
            try {
                await apiConfirmEmailChange(token)
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

    return (
        <Container>
            <div className="min-h-screen flex items-center justify-center py-12 px-4">
                <AdaptiveCard className="max-w-md w-full">
                    <div className="text-center">
                        {phase === 'loading' && (
                            <>
                                <div className="flex justify-center mb-4">
                                    <PiSpinnerGapDuotone className="w-16 h-16 text-blue-500 animate-spin" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2" {...qa('host.emailConfirm.loading')}>
                                    Подтверждаем новый email…
                                </h2>
                            </>
                        )}

                        {phase === 'success' && (
                            <div {...qa('host.emailConfirm.success')}>
                                <div className="flex justify-center mb-4">
                                    <PiCheckCircleDuotone className="w-16 h-16 text-emerald-500" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2" {...qa('host.emailConfirm.successHeading')}>
                                    Email подтверждён
                                </h2>
                                <p className="text-gray-600 dark:text-gray-400 mb-6" {...qa('host.emailConfirm.successMessage')}>
                                    Новый адрес теперь используется для входа.
                                </p>
                                <Button
                                    block
                                    variant="solid"
                                    color="primary"
                                    onClick={() => navigate('/account/profile')}
                                    {...qa('host.emailConfirm.toProfile')}
                                >
                                    Перейти в профиль
                                </Button>
                            </div>
                        )}

                        {(phase === 'expired' || phase === 'error') && (
                            <div {...qa('host.emailConfirm.error')}>
                                <div className="flex justify-center mb-4">
                                    <PiWarningCircleDuotone className="w-16 h-16 text-red-500" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2" {...qa('host.emailConfirm.errorHeading')}>
                                    {phase === 'expired'
                                        ? 'Ссылка устарела'
                                        : 'Ссылка недействительна'}
                                </h2>
                                <p className="text-gray-600 dark:text-gray-400 mb-6" {...qa('host.emailConfirm.errorMessage')}>
                                    {phase === 'expired'
                                        ? 'Срок действия ссылки истёк. Запросите смену email заново.'
                                        : 'Не удалось подтвердить email по этой ссылке.'}
                                </p>
                                <Button
                                    block
                                    variant="solid"
                                    color="primary"
                                    onClick={() =>
                                        navigate('/account/profile/change-email')
                                    }
                                    {...qaWithAlias(
                                        'host.emailConfirm.retryChange',
                                        'host.emailConfirm.retry',
                                    )}
                                >
                                    Запросить смену заново
                                </Button>
                            </div>
                        )}
                    </div>
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default EmailConfirm
