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
import { apiCancelEmailChangeByToken } from '@/services/AuthService'
import { normalizeApiError } from '@/utils/apiError'
import { qa } from '@/shared/qa'

type Phase = 'loading' | 'success' | 'expired' | 'error'

/**
 * SCR-MPROF-EMAIL-CANCEL — публичная deep-link страница отмены запрошенной
 * смены email (FR-MPROF-18): ссылка приходит в security-alert письме на
 * ТЕКУЩИЙ адрес. Без AccountLayout/сайдбара; валидация токена на бэке.
 */
const EmailCancel = () => {
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
                await apiCancelEmailChangeByToken(token)
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
                                <h2 className="text-2xl font-bold mb-2">
                                    Отменяем смену email…
                                </h2>
                            </>
                        )}

                        {phase === 'success' && (
                            <div {...qa('host.emailCancel.success')}>
                                <div className="flex justify-center mb-4">
                                    <PiCheckCircleDuotone className="w-16 h-16 text-emerald-500" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2">
                                    Смена email отменена
                                </h2>
                                <p className="text-gray-600 dark:text-gray-400 mb-6">
                                    Запрос на смену адреса аннулирован — текущий
                                    email остаётся действующим. Если это были не
                                    вы, рекомендуем сменить пароль.
                                </p>
                                <Button
                                    block
                                    variant="solid"
                                    color="primary"
                                    onClick={() =>
                                        navigate('/account/security')
                                    }
                                    {...qa('host.emailCancel.toSecurity')}
                                >
                                    Перейти к настройкам безопасности
                                </Button>
                            </div>
                        )}

                        {(phase === 'expired' || phase === 'error') && (
                            <div {...qa('host.emailCancel.error')}>
                                <div className="flex justify-center mb-4">
                                    <PiWarningCircleDuotone className="w-16 h-16 text-red-500" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2">
                                    {phase === 'expired'
                                        ? 'Ссылка устарела'
                                        : 'Ссылка недействительна'}
                                </h2>
                                <p className="text-gray-600 dark:text-gray-400 mb-6">
                                    {phase === 'expired'
                                        ? 'Запрос уже отменён, подтверждён или срок ссылки истёк.'
                                        : 'Не удалось отменить смену email по этой ссылке.'}
                                </p>
                                <Button
                                    block
                                    variant="solid"
                                    color="primary"
                                    onClick={() => navigate('/account/profile')}
                                    {...qa('host.emailCancel.toProfile')}
                                >
                                    Перейти в профиль
                                </Button>
                            </div>
                        )}
                    </div>
                </AdaptiveCard>
            </div>
        </Container>
    )
}

export default EmailCancel
