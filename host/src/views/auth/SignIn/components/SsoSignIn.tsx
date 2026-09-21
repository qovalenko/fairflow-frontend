import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import Button from '@/components/ui/Button'
import {
    fetchOidcProviders,
    startOidcProviderSignIn,
    startYandexOAuthSignIn,
    type OidcProviderSummary,
} from '@/services/OAuthServices'
import { qa } from '@/shared/qa'

type SsoSignInProps = {
    setMessage?: (message: string) => void
    disableSubmit?: boolean
    redirectUrl?: string
}

const YandexIcon = () => (
    <svg
        className="h-[22px] w-[22px]"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
    >
        <circle cx="12" cy="12" r="12" fill="#FC3F1D" />
        <path
            d="M13.32 6.61h-1.2c-2.2 0-3.36 1.13-3.36 2.8 0 1.86.8 2.74 2.43 3.86l1.35.93-3.88 5.8h2.6l3.48-5.2v5.2h2.26V6.61h-2.28zm-1.07 5.95l-.84-.6c-1-.7-1.5-1.24-1.5-2.4 0-1.02.7-1.71 1.94-1.71h.45v4.71z"
            fill="#fff"
        />
    </svg>
)

/**
 * SSO-кнопки на экране входа (FR-AUTH-359): OIDC-провайдеры с gateway
 * и Yandex OAuth (если настроен на BE — иначе редирект завершится ошибкой).
 */
const SsoSignIn = ({
    setMessage,
    disableSubmit,
    redirectUrl,
}: SsoSignInProps) => {
    const [redirecting, setRedirecting] = useState(false)
    const [providers, setProviders] = useState<OidcProviderSummary[]>([])
    const [loaded, setLoaded] = useState(false)
    const [searchParams] = useSearchParams()

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            const list = await fetchOidcProviders()
            if (!cancelled) {
                setProviders(list)
                setLoaded(true)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [])

    const showYandex = import.meta.env.VITE_SSO_YANDEX === 'true'
    const available = loaded && (providers.length > 0 || showYandex)

    const target = redirectUrl ?? searchParams.get('redirectUrl') ?? undefined

    const startRedirect = (start: () => void) => {
        if (disableSubmit || redirecting) return
        try {
            setRedirecting(true)
            start()
        } catch (error) {
            setRedirecting(false)
            setMessage?.(
                (error as Error)?.message ||
                    'Не удалось начать внешний вход.',
            )
        }
    }

    if (!loaded || !available) {
        return null
    }

    return (
        <div className="mt-8">
            <div className="flex items-center gap-2 mb-6">
                <div className="border-t border-gray-200 dark:border-gray-800 flex-1 mt-[1px]" />
                <p className="font-semibold heading-text">или</p>
                <div className="border-t border-gray-200 dark:border-gray-800 flex-1 mt-[1px]" />
            </div>
            <div className="flex flex-col gap-2">
            {providers.map((provider) => (
                <Button
                    key={provider.id}
                    block
                    type="button"
                    loading={redirecting}
                    disabled={disableSubmit}
                    {...qa('host.sso.provider', { provider: provider.id })}
                    onClick={() =>
                        startRedirect(() =>
                            startOidcProviderSignIn(provider.id, {
                                redirectUrl: target,
                            }),
                        )
                    }
                >
                    Войти через {provider.name}
                </Button>
            ))}
            {showYandex && (
                <Button
                    block
                    type="button"
                    loading={redirecting}
                    disabled={disableSubmit}
                    {...qa('host.sso.yandex')}
                    onClick={() =>
                        startRedirect(() =>
                            startYandexOAuthSignIn({ redirectUrl: target }),
                        )
                    }
                >
                    <div className="flex items-center justify-center gap-2">
                        {!redirecting && <YandexIcon />}
                        <span>Войти через Яндекс</span>
                    </div>
                </Button>
            )}
        </div>
        </div>
    )
}

export default SsoSignIn
