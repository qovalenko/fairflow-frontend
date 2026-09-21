import { apiPrefix } from '@/configs/endpoint.config'

/** Backend entry-point for the Yandex OAuth handshake (VERSION_NEUTRAL). */
export const YANDEX_OAUTH_START_PATH = `${apiPrefix}/auth/oauth/yandex`

/** Active external OIDC providers for the login page (VERSION_NEUTRAL). */
export const OIDC_PROVIDERS_PATH = `${apiPrefix}/auth/oidc/providers`

export type YandexOAuthStartOptions = {
    /** SPA path to return to after a successful login (deep-link preservation). */
    redirectUrl?: string
}

export type OidcProviderSummary = {
    id: string
    name: string
    issuer: string
}

export function buildYandexOAuthStartUrl({
    redirectUrl,
}: YandexOAuthStartOptions = {}): string {
    const params = new URLSearchParams()
    if (redirectUrl) {
        params.set('redirectUrl', redirectUrl)
    }
    const query = params.toString()
    return query
        ? `${YANDEX_OAUTH_START_PATH}?${query}`
        : YANDEX_OAUTH_START_PATH
}

export function buildOidcProviderStartUrl(
    providerId: string,
    { redirectUrl }: YandexOAuthStartOptions = {},
): string {
    const params = new URLSearchParams()
    if (redirectUrl) {
        params.set('redirectUrl', redirectUrl)
    }
    const query = params.toString()
    const base = `${apiPrefix}/auth/oidc/${encodeURIComponent(providerId)}/start`
    return query ? `${base}?${query}` : base
}

export function startYandexOAuthSignIn(options?: YandexOAuthStartOptions): void {
    if (typeof window === 'undefined') {
        return
    }
    window.location.assign(buildYandexOAuthStartUrl(options))
}

export function startOidcProviderSignIn(
    providerId: string,
    options?: YandexOAuthStartOptions,
): void {
    if (typeof window === 'undefined') {
        return
    }
    window.location.assign(buildOidcProviderStartUrl(providerId, options))
}

export async function fetchOidcProviders(): Promise<OidcProviderSummary[]> {
    const res = await fetch(OIDC_PROVIDERS_PATH, { credentials: 'include' })
    if (!res.ok) {
        return []
    }
    const data = (await res.json()) as { providers?: OidcProviderSummary[] }
    return (data.providers ?? []).filter((p) => p.id && p.name)
}
