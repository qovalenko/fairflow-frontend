import ApiService from './ApiService'

export type ServiceApiKeyRow = {
    id: string
    name: string
    keyPrefix: string
    scopes: string[]
    expiresAt: string | null
    lastUsedAt: string | null
    isActive: boolean
    createdAt: string
}

export type OidcProviderAdminRow = {
    id: string
    name: string
    issuer: string
    clientId: string
    isActive: boolean
    fromEnv: boolean
    discoveryUrl?: string
    scopes?: string[]
    trustEmail?: boolean
    createdAt?: string
    updatedAt?: string
}

export type UpsertOidcProviderPayload = {
    id: string
    name: string
    issuer: string
    clientId: string
    clientSecret?: string
    discoveryUrl?: string
    authorizationEndpoint?: string
    tokenEndpoint?: string
    userInfoEndpoint?: string
    jwksUri?: string
    scopes?: string[]
    isActive?: boolean
    trustEmail?: boolean
}

export async function apiListServiceApiKeys(): Promise<ServiceApiKeyRow[]> {
    const res = await ApiService.fetchDataWithAxios<{ keys: ServiceApiKeyRow[] }>({
        url: '/v1/system/service-api-keys',
        method: 'get',
    })
    return res.keys ?? []
}

export async function apiListOidcProvidersAdmin(): Promise<OidcProviderAdminRow[]> {
    const res = await ApiService.fetchDataWithAxios<{
        providers: OidcProviderAdminRow[]
    }>({
        url: '/v1/system/oidc-providers',
        method: 'get',
    })
    return res.providers ?? []
}

export async function apiUpsertOidcProvider(
    payload: UpsertOidcProviderPayload,
): Promise<OidcProviderAdminRow> {
    const res = await ApiService.fetchDataWithAxios<{ provider: OidcProviderAdminRow }>(
        {
            url: '/v1/system/oidc-providers',
            method: 'post',
            data: payload,
        },
    )
    return res.provider
}

export async function apiDeactivateOidcProvider(id: string): Promise<void> {
    await ApiService.fetchDataWithAxios({
        url: `/v1/system/oidc-providers/${encodeURIComponent(id)}`,
        method: 'delete',
    })
}

export function serviceKeyExpiryBadge(expiresAt: string | null): 'ok' | 'soon' | 'expired' | 'none' {
    if (!expiresAt) return 'none'
    const exp = new Date(expiresAt).getTime()
    if (!Number.isFinite(exp)) return 'none'
    const now = Date.now()
    if (exp <= now) return 'expired'
    const days = (exp - now) / (24 * 60 * 60_000)
    return days <= 14 ? 'soon' : 'ok'
}
