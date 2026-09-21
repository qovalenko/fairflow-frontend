import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { PiSpinnerGapDuotone, PiWarningCircleDuotone } from 'react-icons/pi'
import Container from '@/components/shared/Container'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import useAuth from '@/auth/useAuth'
import appConfig from '@/configs/app.config'
import { REDIRECT_URL_KEY } from '@/constants/app.constant'
import { notify } from '@/utils/notify'
import { qa } from '@/shared/qa'

/**
 * SCR-AUTH-OAUTH-CALLBACK — завершение входа через OAuth/OIDC (handoff).
 *
 * gateway-callback после обмена кода редиректит браузер сюда с данными во
 * фрагменте URL:
 *   /auth/oauth/callback#access_token=<jwt>&redirectUrl=<spa-path>
 *   /auth/oauth/callback#error=<reason>&redirectUrl=<spa-path>
 *   /auth/oauth/callback#mfaRequired=1&preauthId=<id>&redirectUrl=<spa-path>
 */
const INITIAL_FRAGMENT =
    typeof window !== 'undefined'
        ? window.location.hash.replace(/^#/, '')
        : ''

const OauthCallback = () => {
    const navigate = useNavigate()
    const { completeOAuthSignIn } = useAuth()
    const [phase, setPhase] = useState<'loading' | 'error'>('loading')
    const startedRef = useRef(false)

    useEffect(() => {
        if (startedRef.current) {
            return
        }
        startedRef.current = true

        const raw = INITIAL_FRAGMENT
        if (raw) {
            window.history.replaceState(
                null,
                '',
                window.location.pathname + window.location.search,
            )
        }
        const frag = new URLSearchParams(raw)
        const accessToken = frag.get('access_token') || ''
        // Только SPA-путь: gateway подставляет абсолютный APP_PUBLIC_URL,
        // когда deep-link не передан, а значение вообще приходит из URL —
        // абсолютные и протокол-относительные ссылки отбрасываем (иначе
        // navigate() уводит на битый маршрут / чужой origin).
        const rawRedirect = frag.get(REDIRECT_URL_KEY) || ''
        const redirectUrl =
            rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
                ? rawRedirect
                : ''
        const error = frag.get('error') || ''
        const mfaRequired = frag.get('mfaRequired')
        const preauthId = frag.get('preauthId') || ''

        const toSignIn = (reason?: string) => {
            const params = new URLSearchParams()
            if (redirectUrl) params.set(REDIRECT_URL_KEY, redirectUrl)
            if (reason) params.set('reason', reason)
            const qs = params.toString()
            navigate(`/auth/signin${qs ? `?${qs}` : ''}`, { replace: true })
        }

        if (error) {
            notify(
                error === 'oauth_not_employee' || error === 'oidc_not_employee'
                    ? 'Вход через внешний провайдер доступен только сотрудникам'
                    : 'Не удалось войти через внешний провайдер',
                'danger',
            )
            toSignIn(error)
            return
        }

        if (mfaRequired && preauthId) {
            const params = new URLSearchParams({ preauthId })
            if (redirectUrl) params.set(REDIRECT_URL_KEY, redirectUrl)
            navigate(`/auth/2fa?${params.toString()}`, { replace: true })
            return
        }

        if (!accessToken) {
            notify('Не получен токен входа', 'danger')
            toSignIn('oauth_no_token')
            return
        }

        let cancelled = false
        ;(async () => {
            const res = await completeOAuthSignIn(accessToken)
            if (cancelled) return
            if (res.status === 'success') {
                navigate(
                    redirectUrl || appConfig.authenticatedEntryPath,
                    { replace: true },
                )
                return
            }
            notify(res.message || 'Не удалось завершить вход', 'danger')
            setPhase('error')
        })()

        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <Container>
            <div className="min-h-screen flex items-center justify-center py-12 px-4">
                <AdaptiveCard className="max-w-md w-full">
                    <div className="text-center">
                        {phase === 'loading' ? (
                            <div {...qa('host.oauthCallback.loading')}>
                                <div className="flex justify-center mb-4">
                                    <PiSpinnerGapDuotone className="w-16 h-16 text-blue-500 animate-spin" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2">
                                    Входим…
                                </h2>
                                <p className="text-gray-600 dark:text-gray-400">
                                    Завершаем внешний вход.
                                </p>
                            </div>
                        ) : (
                            <div {...qa('host.oauthCallback.error')}>
                                <div className="flex justify-center mb-4">
                                    <PiWarningCircleDuotone className="w-16 h-16 text-red-500" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2">
                                    Не удалось войти
                                </h2>
                                <p className="text-gray-600 dark:text-gray-400 mb-6">
                                    Попробуйте войти ещё раз.
                                </p>
                                <Button
                                    block
                                    variant="solid"
                                    color="primary"
                                    onClick={() =>
                                        navigate('/auth/signin', {
                                            replace: true,
                                        })
                                    }
                                    {...qa('host.oauthCallback.toSignIn')}
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

export default OauthCallback
