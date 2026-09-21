import { request, type APIRequestContext, type Page, type Route } from '@playwright/test'
import { API_BASE_URL } from './env'

type HttpMethod = 'get' | 'post' | 'patch' | 'delete'

const SYSTEM_ROUTE_RE = /\/v1\/system(\/|$|\?)/

function apiUrl(path: string): string {
    return `${API_BASE_URL}${path}`
}

/** Map box `/v1/system/*` suffix to legacy `/v1/organizations/:orgId/*`. */
function orgSuffixFromSystem(suffix: string): string {
    if (suffix === '/requisites' || suffix === '') return ''
    return suffix
}

/**
 * Resolve the single-tenant organization id.
 * Box BFF (`GET /v1/system`) when deployed; otherwise legacy `GET /v1/organizations`.
 */
export async function resolveOrganizationId(
    ctx: APIRequestContext,
    token: string,
    cache?: { value: string | null },
): Promise<string> {
    if (cache?.value) return cache.value

    const headers = { Authorization: `Bearer ${token}` }

    const systemRes = await ctx.get(apiUrl('/v1/system'), { headers })
    if (systemRes.ok()) {
        const body = (await systemRes.json()) as Record<string, unknown>
        const id = body.id ?? body.systemId
        if (id) {
            const resolved = String(id)
            if (cache) cache.value = resolved
            return resolved
        }
    }

    const orgRes = await ctx.get(apiUrl('/v1/organizations'), { headers })
    if (!orgRes.ok()) {
        throw new Error(`listOrganizations failed: ${orgRes.status()} ${await orgRes.text()}`)
    }
    const orgs = (await orgRes.json()) as Array<{ id?: string }>
    const id = orgs[0]?.id
    if (!id) throw new Error('listOrganizations returned no organizations')
    if (cache) cache.value = id
    return id
}

/** Try box path first; on 404 fall back to legacy org-scoped routes on the stand. */
export async function fetchSystemOrOrg(
    ctx: APIRequestContext,
    token: string,
    method: HttpMethod,
    suffix: string,
    options: {
        data?: unknown
        params?: Record<string, string | number>
        orgIdCache?: { value: string | null }
        jsonContentType?: boolean
    } = {},
): Promise<Awaited<ReturnType<APIRequestContext['get']>>> {
    const baseHeaders: Record<string, string> = { Authorization: `Bearer ${token}` }
    if (options.jsonContentType !== false && (method === 'post' || method === 'patch' || method === 'delete')) {
        baseHeaders['Content-Type'] = 'application/json'
    }

    const reqOpts = {
        headers: baseHeaders,
        ...(options.params ? { params: options.params } : {}),
        ...(options.data !== undefined ? { data: options.data } : {}),
    }

    const systemRes = await ctx[method](apiUrl(`/v1/system${suffix}`), reqOpts)
    if (systemRes.status() !== 404) return systemRes

    const orgId = await resolveOrganizationId(ctx, token, options.orgIdCache)
    const orgSuffix = orgSuffixFromSystem(suffix)
    return ctx[method](apiUrl(`/v1/organizations/${orgId}${orgSuffix}`), reqOpts)
}

/** Admin org-structure projection stub when legacy stand has no `/v1/system/me/permissions`. */
const ADMIN_ORG_PERMISSIONS = [
    'org:employees:read',
    'org:employees:manage',
    'org:departments:read',
    'org:departments:manage',
    'org:units:read',
    'org:units:manage',
    'org:invitations:manage',
    'org:profile:read',
    'org:profile:manage',
    'org:audit:read',
    'org:seats:read',
]

/**
 * Proxy browser `/v1/system/*` calls to legacy org API so box UI loads on the stand.
 * Uses a dedicated request context (not the worker `api` fixture) so route callbacks
 * stay valid through teardown.
 */
export async function installSystemApiBridge(
    page: Page,
    token: string,
    orgId: string,
): Promise<() => Promise<void>> {
    const bridgeCtx = await request.newContext({ ignoreHTTPSErrors: true })
    const orgIdCache = { value: orgId }

    const handler = async (route: Route) => {
        const req = route.request()
        const url = new URL(req.url())
        const rawSuffix = url.pathname.replace(/^.*\/v1\/system/, '')
        const suffix = rawSuffix + url.search

        if ((suffix === '' || suffix.startsWith('?')) && req.method() === 'GET') {
            const res = await fetchSystemOrOrg(bridgeCtx, token, 'get', '', { orgIdCache })
            return route.fulfill({
                status: res.status(),
                contentType: 'application/json',
                body: await res.text(),
            })
        }

        if (suffix.startsWith('/me/permissions') && req.method() === 'GET') {
            const legacy = await fetchSystemOrOrg(bridgeCtx, token, 'get', '/me/permissions', {
                orgIdCache,
            })
            if (legacy.ok()) {
                return route.fulfill({
                    status: legacy.status(),
                    contentType: 'application/json',
                    body: await legacy.text(),
                })
            }
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ allowed: ADMIN_ORG_PERMISSIONS }),
            })
        }

        if (suffix.startsWith('/requisites')) {
            const legacyPath = `/v1/organizations/${orgId}`
            if (req.method() === 'GET' || req.method() === 'PATCH') {
                return route.continue({ url: apiUrl(legacyPath) })
            }
        }

        if (suffix.startsWith('/colleagues') && req.method() === 'GET') {
            const res = await fetchSystemOrOrg(bridgeCtx, token, 'get', '/employees', { orgIdCache })
            if (!res.ok()) {
                return route.fulfill({ status: res.status(), body: await res.text() })
            }
            const employees = (await res.json()) as Array<Record<string, unknown>>
            const colleagues = employees
                .filter((e) => e.isActive !== false)
                .map((e) => ({
                    userId: e.userId,
                    name: e.name,
                    position: e.position ?? '',
                    departmentName: e.departmentName ?? '',
                    managerName: e.managerName ?? '',
                }))
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(colleagues),
            })
        }

        const offboardMatch = suffix.match(/^\/employees\/([^/]+)\/offboard(\?.*)?$/)
        if (offboardMatch && req.method() === 'POST') {
            const userId = offboardMatch[1]
            const body = req.postDataJSON() as { reassignToUserId?: string } | null
            const res = await bridgeCtx.delete(
                apiUrl(`/v1/organizations/${orgId}/employees/${userId}`),
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    data: body ?? {},
                },
            )
            return route.fulfill({
                status: res.status(),
                contentType: 'application/json',
                body: await res.text(),
            })
        }

        const offboardPreviewMatch = suffix.match(/^\/employees\/([^/]+)\/offboard\/preview(\?.*)?$/)
        if (offboardPreviewMatch && req.method() === 'GET') {
            const userId = offboardPreviewMatch[1]
            return route.continue({
                url: apiUrl(`/v1/organizations/${orgId}/employees/${userId}/offboard/preview`),
            })
        }

        const legacySuffix = orgSuffixFromSystem(suffix.split('?')[0])
        const query = suffix.includes('?') ? suffix.slice(suffix.indexOf('?')) : ''
        return route.continue({
            url: apiUrl(`/v1/organizations/${orgId}${legacySuffix}${query}`),
        })
    }

    await page.route(SYSTEM_ROUTE_RE, handler)

    return async () => {
        await page.unroute(SYSTEM_ROUTE_RE, handler)
        await bridgeCtx.dispose()
    }
}
