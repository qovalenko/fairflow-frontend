import { request, type APIRequestContext, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    API_BASE_URL,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    BASE_URL,
    DATA_PREFIX,
    STORAGE_KEYS,
    STORAGE_STATE,
} from '../support/env'
import { fetchSystemOrOrg, resolveOrganizationId } from '../support/orgApiBridge'

/** Reuse admin JWT within a worker to avoid login rate-limits on large suites. */
let cachedAdminAuth: { token: string; userId: string } | null = null

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'files')

/**
 * Full URL for an API path. We build absolute URLs explicitly instead of relying
 * on Playwright's `baseURL` join, because an absolute request path (`/v1/...`)
 * REPLACES the whole path of the baseURL — so `http://host:5173/api` + `/v1/x`
 * resolves to `http://host:5173/v1/x`, silently dropping the `/api` prefix (404).
 */
function apiUrl(path: string): string {
    return `${API_BASE_URL}${path}`
}

export type ActivitySeed = {
    type?: 'task' | 'call' | 'meeting' | 'note'
    title: string
    status?: string
    dueDate?: number | string
    startDate?: number
    endDate?: number
    direction?: 'inbound' | 'outbound'
    description?: string
    assigneeId?: string
    dealId?: string
    links?: Array<{ entityType: string; entityId: string }>
}

/**
 * Thin REST client over the gateway (`/api/v1/*`) for seeding/cleanup, so specs
 * don't have to drive slow UI flows to reach a fixture state. Mirrors the
 * endpoints the host/contacts services call (host/src/services/CrmService.ts,
 * AuthService.ts). Auth = Bearer JWT; project scope = `X-Project-Id` header.
 */
export class ApiClient {
    private static session: ApiClient | null = null
    private readonly orgIdCache: { value: string | null } = { value: null }

    private constructor(
        private readonly ctx: APIRequestContext,
        readonly token: string,
        readonly userId: string,
    ) {}

    /** Underlying Playwright request context (bridge helpers). */
    get rawContext(): APIRequestContext {
        return this.ctx
    }

    async resolveOrganizationId(): Promise<string> {
        return resolveOrganizationId(this.ctx, this.token, this.orgIdCache)
    }

    private async systemOrOrg(
        method: 'get' | 'post' | 'patch' | 'delete',
        suffix: string,
        options: {
            data?: unknown
            params?: Record<string, string | number>
            jsonContentType?: boolean
        } = {},
    ): Promise<Awaited<ReturnType<APIRequestContext['get']>>> {
        return fetchSystemOrOrg(this.ctx, this.token, method, suffix, {
            ...options,
            orgIdCache: this.orgIdCache,
        })
    }

    /**
     * Reuse JWT from the Playwright storageState file when the stand rate-limits login.
     * Validates the token with `/v1/auth/me` before returning a client.
     */
    static async fromCachedStorageState(): Promise<ApiClient | null> {
        if (!fs.existsSync(STORAGE_STATE)) return null
        try {
            const raw = JSON.parse(fs.readFileSync(STORAGE_STATE, 'utf8')) as {
                origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>
            }
            const token = raw.origins
                ?.flatMap((origin) => origin.localStorage ?? [])
                .find((entry) => entry.name === STORAGE_KEYS.token)?.value
            if (!token) return null

            const ctx = await request.newContext({ ignoreHTTPSErrors: true })
            const meRes = await ctx.get(apiUrl('/v1/auth/me'), {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!meRes.ok()) {
                await ctx.dispose()
                return null
            }
            const body = (await meRes.json()) as { user?: { userId?: string; id?: string } }
            const userId = String(body.user?.userId ?? body.user?.id ?? '')
            if (!userId) {
                await ctx.dispose()
                return null
            }
            cachedAdminAuth = { token, userId }
            return new ApiClient(ctx, token, userId)
        } catch {
            return null
        }
    }

    /**
     * Log in as admin and build an authenticated client.
     *
     * The stand's gateway intermittently answers `/v1/auth/login` with a `401`
     * even though it mints a valid token in the body (observed on the stand — a
     * token is issued but a downstream check flips the status). This is stand
     * flakiness, not a bug in the flow under test (seeding/cleanup), so we retry
     * a few times with a short backoff before giving up.
     *
     * Parallel e2e waves can exhaust the login rate-limit (`429 RESOURCE_EXHAUSTED`).
     * Wait out the lock window (15 min) instead of failing setup immediately.
     */
    static async login(
        maxAttempts = 12,
        rateLimitWaitMs = 60_000,
        maxRateLimitWaits = 60,
    ): Promise<ApiClient> {
        const cachedFirst = await ApiClient.fromCachedStorageState()
        if (cachedFirst) return cachedFirst

        if (cachedAdminAuth) {
            const ctx = await request.newContext({ ignoreHTTPSErrors: true })
            return new ApiClient(ctx, cachedAdminAuth.token, cachedAdminAuth.userId)
        }

        const ctx = await request.newContext({ ignoreHTTPSErrors: true })
        const cachedToken = process.env.E2E_TOKEN?.trim()
        if (cachedToken) {
            const userId = process.env.E2E_USER_ID?.trim() || ''
            return new ApiClient(ctx, cachedToken, userId)
        }
        let lastStatus = 0
        let lastText = ''
        let attempts = 0
        let rateLimitWaits = 0

        while (attempts < maxAttempts && rateLimitWaits <= maxRateLimitWaits) {
            const res = await ctx.post(apiUrl('/v1/auth/login'), {
                data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
            })
            const text = await res.text()
            let body: { token?: string; user?: { userId?: string } } | null = null
            try {
                body = JSON.parse(text) as { token?: string; user?: { userId?: string } }
            } catch {
                /* not JSON / no token */
            }

            if (body?.token && body.user?.userId) {
                cachedAdminAuth = { token: body.token, userId: body.user.userId }
                return new ApiClient(ctx, body.token, body.user.userId)
            }

            lastStatus = res.status()
            lastText = text

            if (lastStatus === 429) {
                const cached = await ApiClient.fromCachedStorageState()
                if (cached) {
                    await ctx.dispose()
                    return cached
                }
                rateLimitWaits += 1
                await new Promise((r) => setTimeout(r, rateLimitWaitMs))
                continue
            }

            attempts += 1
            await new Promise((r) => setTimeout(r, 500 * attempts))
        }

        const cached = await ApiClient.fromCachedStorageState()
        if (cached) {
            await ctx.dispose()
            return cached
        }
        await ctx.dispose()
        throw new Error(
            `API login failed after ${attempts} attempts` +
                (rateLimitWaits ? ` (+${rateLimitWaits} rate-limit waits)` : '') +
                `: ${lastStatus} ${lastText}`,
        )
    }

    /**
     * Reuse the JWT already seeded in the browser context (auth.setup storageState).
     * Avoids a second `/v1/auth/login` that revokes the page session on single-session stands.
     */
    static async fromPageSession(page: Page): Promise<ApiClient | null> {
        const data = await page.evaluate(
            ({ tokenKey, sessionKey }) => {
                const token = localStorage.getItem(tokenKey)
                const raw = localStorage.getItem(sessionKey)
                let userId = ''
                if (raw) {
                    try {
                        const envelope = JSON.parse(raw) as {
                            state?: { user?: { userId?: string; id?: string } }
                        }
                        userId =
                            envelope.state?.user?.userId ??
                            envelope.state?.user?.id ??
                            ''
                    } catch {
                        /* ignore malformed session envelope */
                    }
                }
                return { token, userId }
            },
            { tokenKey: STORAGE_KEYS.token, sessionKey: STORAGE_KEYS.sessionUser },
        )
        if (!data.token) return null
        const ctx = await request.newContext({ ignoreHTTPSErrors: true })
        return new ApiClient(ctx, data.token, data.userId || 'unknown')
    }

    /** Read bearer token from persisted Playwright storageState (if present). */
    private static readTokenFromStorageState(
        storagePath: string = STORAGE_STATE,
    ): string | null {
        if (!fs.existsSync(storagePath)) return null
        try {
            const state = JSON.parse(fs.readFileSync(storagePath, 'utf8')) as {
                origins?: Array<{
                    origin?: string
                    localStorage?: Array<{ name: string; value: string }>
                }>
            }
            const origin = state.origins?.find((o) => o.origin === BASE_URL)
            const token = origin?.localStorage?.find((e) => e.name === STORAGE_KEYS.token)?.value
            return token || null
        } catch {
            return null
        }
    }

    /** Build client from saved storageState when JWT still validates on /v1/auth/me. */
    static async fromStorageState(
        storagePath: string = STORAGE_STATE,
    ): Promise<ApiClient | null> {
        const token = ApiClient.readTokenFromStorageState(storagePath)
        if (!token) return null
        const ctx = await request.newContext({ ignoreHTTPSErrors: true })
        const res = await ctx.get(apiUrl('/v1/auth/me'), {
            headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok()) {
            await ctx.dispose()
            return null
        }
        const body = (await res.json()) as { user?: { userId?: string; id?: string } }
        const userId = body.user?.userId ?? body.user?.id
        if (!userId) {
            await ctx.dispose()
            return null
        }
        return new ApiClient(ctx, token, userId)
    }

    /** Prefer a valid cached session; fall back to REST login (once per process). */
    static async authenticated(): Promise<ApiClient> {
        if (ApiClient.session) return ApiClient.session
        const fromState = await ApiClient.fromStorageState()
        ApiClient.session = fromState ?? (await ApiClient.login())
        return ApiClient.session
    }

    /** Drop the process-wide session (e.g. after auth setup refresh). */
    static async resetSession(): Promise<void> {
        if (ApiClient.session) {
            await ApiClient.session.dispose()
            ApiClient.session = null
        }
    }

    /** Prefer cached storageState token; never hit /login when cache file exists (stand rate-limit). */
    static async loginOrCached(storagePath: string, attempts = 4): Promise<ApiClient> {
        if (fs.existsSync(storagePath)) {
            try {
                const cached = await ApiClient.fromStorageState(storagePath)
                if (cached) return cached
            } catch {
                /* corrupt cache — fall through to login only when file unreadable */
            }
        }
        return ApiClient.login(attempts)
    }

    private headers(projectId?: string): Record<string, string> {
        const h: Record<string, string> = { Authorization: `Bearer ${this.token}` }
        if (projectId) h['X-Project-Id'] = projectId
        return h
    }

    /** Gateway reads project scope from header + query on many CRM routes. */
    private projectScope(projectId: string): {
        headers: Record<string, string>
        params: { projectId: string }
    } {
        return { headers: this.headers(projectId), params: { projectId } }
    }

    private async assertOk(res: Awaited<ReturnType<APIRequestContext['post']>>, label: string): Promise<void> {
        if (!res.ok()) {
            throw new Error(`${label} failed: ${res.status()} ${await res.text()}`)
        }
    }

    /** PATCH /v1/projects/:id — replace enabled module list. */

    /** Create a personal project owned by the admin. Returns its id. */
    async createProject(name: string, modules: string[] = ['deals', 'contacts']): Promise<string> {
        const res = await this.ctx.post(apiUrl('/v1/projects'), {
            headers: this.headers(),
            data: {
                ownerType: 'PERSONAL',
                ownerId: this.userId,
                name,
                templateId: 'blank',
                modules,
            },
        })
        if (!res.ok()) {
            throw new Error(`createProject failed: ${res.status()} ${await res.text()}`)
        }
        return ((await res.json()) as { id: string }).id
    }

    /** Soft-archive (DELETE) a project. Non-fatal on failure — cleanup best-effort. */
    async archiveProject(projectId: string): Promise<void> {
        await this.ctx.delete(apiUrl(`/v1/projects/${projectId}`), { headers: this.headers() })
    }

    /** Replace the enabled module list on a project (PATCH /v1/projects/:id). */
    async updateProjectModules(projectId: string, modules: string[]): Promise<void> {
        const res = await this.ctx.patch(apiUrl(`/v1/projects/${projectId}`), {
            headers: this.headers(),
            data: { modules },
        })
        if (!res.ok()) {
            throw new Error(`updateProjectModules failed: ${res.status()} ${await res.text()}`)
        }
    }

    /** Replace module-policy overlay rules on a project (PATCH /v1/projects/:id). */
    async updateProjectModulePolicies(
        projectId: string,
        modulePolicies: Array<{
            id: string
            moduleId: string
            effect: 'allow' | 'deny'
            subject: string
            action: string
            resource: string
            condition?: Record<string, unknown>
        }>,
    ): Promise<void> {
        const res = await this.ctx.patch(apiUrl(`/v1/projects/${projectId}`), {
            headers: this.headers(),
            data: { modulePolicies },
        })
        if (!res.ok()) {
            throw new Error(
                `updateProjectModulePolicies failed: ${res.status()} ${await res.text()}`,
            )
        }
    }

    /** All projects owned by admin whose name starts with the suite prefix. */
    async listOwnProjects(): Promise<Array<{ id: string; name: string }>> {
        const res = await this.ctx.get(apiUrl('/v1/projects'), {
            headers: this.headers(),
            params: { userId: this.userId },
        })
        if (!res.ok()) return []
        const body = (await res.json()) as unknown
        const list = Array.isArray(body)
            ? body
            : ((body as { list?: unknown[] }).list ?? [])
        return (list as Array<{ id?: string; name?: string }>)
            .filter((p): p is { id: string; name: string } => Boolean(p.id && p.name))
            .map((p) => ({ id: p.id, name: p.name }))
    }

    /**
     * Create a contact in a project. Returns its id.
     *
     * `companyId` links it to a company; the domain keeps the link in BOTH the
     * scalar field and the `companyIds` array (the company card composite reads
     * the array), so send both — the same thing the host create drawer does.
     */
    async createContact(
        projectId: string,
        data: {
            firstName: string
            lastName: string
            email?: string
            phone?: string
            source?: string
            assigneeId?: string
            tags?: string[]
            companyId?: string
        },
    ): Promise<string> {
        const res = await this.ctx.post(apiUrl('/v1/contacts'), {
            ...this.projectScope(projectId),
            data: data.companyId ? { ...data, companyIds: [data.companyId] } : data,
        })
        if (!res.ok()) {
            throw new Error(`createContact failed: ${res.status()} ${await res.text()}`)
        }
        return ((await res.json()) as { id: string }).id
    }

    async createContacts(
        projectId: string,
        contacts: Array<{
            firstName: string
            lastName: string
            email?: string
            phone?: string
            source?: string
            assigneeId?: string
            tags?: string[]
        }>,
    ): Promise<string[]> {
        const ids: string[] = []
        for (const c of contacts) {
            ids.push(await this.createContact(projectId, c))
        }
        return ids
    }

    async getContact(
        projectId: string,
        contactId: string,
    ): Promise<{ id: string; firstName?: string; lastName?: string; email?: string; phone?: string }> {
        const res = await this.ctx.get(apiUrl(`/v1/contacts/${contactId}`), {
            headers: this.headers(projectId),
            params: { projectId },
        })
        if (!res.ok()) {
            throw new Error(`getContact failed: ${res.status()} ${await res.text()}`)
        }
        return (await res.json()) as { id: string; firstName?: string; lastName?: string; email?: string; phone?: string }
    }

    async listDealSources(): Promise<Array<{ name: string }>> {
        const res = await this.ctx.get(apiUrl('/v1/deal-sources'), { headers: this.headers() })
        if (!res.ok()) return []
        const body = (await res.json()) as unknown
        return (Array.isArray(body) ? body : []) as Array<{ name: string }>
    }

    async listMembers(projectId: string): Promise<Array<{ id: string; name: string }>> {
        const res = await this.ctx.get(apiUrl('/v1/members'), {
            headers: this.headers(projectId),
            params: { projectId },
        })
        if (!res.ok()) return []
        const body = (await res.json()) as unknown
        const list = Array.isArray(body) ? body : []
        return list as Array<{ id: string; name: string }>
    }

    async deleteContact(projectId: string, contactId: string): Promise<void> {
        await this.ctx.delete(apiUrl(`/v1/contacts/${contactId}`), { headers: this.headers(projectId) })
    }

    private idempotencyKey(): string {
        return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    }

    /** Create an automation rule via gateway REST. Returns rule id. */
    async createAutomationRule(
        projectId: string,
        data: {
            name: string
            enabled?: boolean
            triggerType?: string
            triggerConfig?: Record<string, unknown>
            conditions?: Record<string, unknown>
            actions?: Array<{ type: string; connectionId?: string; config?: Record<string, unknown> }>
            engineVersion?: 1 | 2
            graph?: unknown
        },
    ): Promise<string> {
        const res = await this.ctx.post(apiUrl('/v1/automation/rules'), {
            headers: {
                ...this.headers(projectId),
                'Idempotency-Key': this.idempotencyKey(),
            },
            params: { projectId },
            data: {
                triggerType: 'crm.contact.created',
                triggerConfig: { event_name: 'crm.contact.created' },
                conditions: { and: [] },
                actions: [{ type: 'create_activity', config: { title: 'E2E activity' } }],
                ...data,
            },
        })
        if (!res.ok()) {
            throw new Error(`createAutomationRule failed: ${res.status()} ${await res.text()}`)
        }
        return ((await res.json()) as { id: string }).id
    }

    async deleteAutomationRule(projectId: string, ruleId: string): Promise<void> {
        await this.ctx.delete(apiUrl(`/v1/automation/rules/${ruleId}`), {
            headers: { ...this.headers(projectId), 'Idempotency-Key': this.idempotencyKey() },
            params: { projectId },
        })
    }

    async setAutomationRuleEnabled(
        projectId: string,
        ruleId: string,
        enabled: boolean,
    ): Promise<void> {
        const res = await this.ctx.put(apiUrl(`/v1/automation/rules/${ruleId}/enabled`), {
            headers: { ...this.headers(projectId), 'Idempotency-Key': this.idempotencyKey() },
            params: { projectId },
            data: { enabled },
        })
        if (!res.ok()) {
            throw new Error(`setAutomationRuleEnabled failed: ${res.status()} ${await res.text()}`)
        }
    }

    async listAutomationRules(
        projectId: string,
        query?: string,
    ): Promise<Array<{ id: string; name: string }>> {
        const res = await this.ctx.get(apiUrl('/v1/automation/rules'), {
            headers: this.headers(projectId),
            params: { projectId, pageSize: 200, query },
        })
        if (!res.ok()) return []
        const body = (await res.json()) as { list?: Array<{ id: string; name: string }> }
        return body.list ?? []
    }

    async createAutomationConnection(
        projectId: string,
        data: { name: string; url: string; enabled?: boolean },
    ): Promise<string> {
        const res = await this.ctx.post(apiUrl('/v1/automation/connections'), {
            headers: {
                ...this.headers(projectId),
                'Idempotency-Key': this.idempotencyKey(),
            },
            params: { projectId },
            data: { enabled: true, ...data },
        })
        if (!res.ok()) {
            throw new Error(`createAutomationConnection failed: ${res.status()} ${await res.text()}`)
        }
        return ((await res.json()) as { id: string }).id
    }

    async deleteAutomationConnection(projectId: string, connectionId: string): Promise<void> {
        await this.ctx.delete(apiUrl(`/v1/automation/connections/${connectionId}`), {
            headers: { ...this.headers(projectId), 'Idempotency-Key': this.idempotencyKey() },
            params: { projectId },
        })
    }

    async runAutomationRule(
        projectId: string,
        ruleId: string,
        entityId: string,
        entityType = 'contact',
    ): Promise<void> {
        const res = await this.ctx.post(apiUrl(`/v1/automation/rules/${ruleId}/run`), {
            headers: { ...this.headers(projectId), 'Idempotency-Key': this.idempotencyKey() },
            params: { projectId },
            data: { entityId, entityType },
        })
        if (!res.ok()) {
            throw new Error(`runAutomationRule failed: ${res.status()} ${await res.text()}`)
        }
    }

    async listAutomationDlq(
        projectId: string,
        status?: string,
    ): Promise<Array<{ id: string; status?: string }>> {
        const res = await this.ctx.get(apiUrl('/v1/automation/dlq'), {
            headers: this.headers(projectId),
            params: { projectId, pageSize: 50, status: status || undefined },
        })
        if (!res.ok()) return []
        const body = (await res.json()) as { list?: Array<{ id: string; status?: string }> }
        return body.list ?? []
    }

    /** Minimal /v1/auth/me user payload for sessionUser seeding. */
    async getMe(): Promise<Record<string, unknown> | null> {
        const res = await this.ctx.get(apiUrl('/v1/auth/me'), {
            headers: this.headers(),
        })
        if (!res.ok()) return null
        const body = (await res.json()) as { user?: Record<string, unknown> }
        return body.user ?? null
    }

    /** GET /v1/system — box single-tenant system context (bridged to org API on legacy stands). */
    async getSystem(): Promise<Record<string, unknown> | null> {
        try {
            const res = await this.systemOrOrg('get', '')
            if (!res.ok()) return null
            return (await res.json()) as Record<string, unknown>
        } catch {
            const res = await this.ctx.get(apiUrl('/v1/system'), {
                headers: this.headers(),
            })
            if (!res.ok()) return null
            return (await res.json()) as Record<string, unknown>
        }
    }

    /** POST /v1/system/invitations — invite with project grants (onboarding / wizard). */
    async createInvitationWithProjectGrants(payload: {
        email: string
        role?: string
        projectGrants?: Array<{ projectId: string; role: string }>
    }): Promise<{ id: string; email: string }> {
        const res = await this.ctx.post(apiUrl('/v1/system/invitations'), {
            headers: this.headers(),
            data: payload,
        })
        if (!res.ok()) {
            throw new Error(
                `createInvitationWithProjectGrants failed: ${res.status()} ${await res.text()}`,
            )
        }
        return (await res.json()) as { id: string; email: string }
    }

    async listOrderTypes(
        projectId: string,
    ): Promise<Array<{ id: string; name?: string }>> {
        const res = await this.ctx.get(apiUrl('/v1/order-types'), {
            headers: this.headers(projectId),
            params: { projectId },
        })
        if (!res.ok()) {
            throw new Error(`listOrderTypes failed: ${res.status()} ${await res.text()}`)
        }
        const body = (await res.json()) as
            | Array<{ id: string; name?: string }>
            | { list?: Array<{ id: string; name?: string }> }
        return Array.isArray(body) ? body : (body.list ?? [])
    }

    /** POST /v1/projects with explicit ownerType for permission-negative cases. */
    async createProjectRaw(data: Record<string, unknown>): Promise<{ status: number; body: string }> {
        const res = await this.ctx.post(apiUrl('/v1/projects'), {
            headers: this.headers(),
            data,
        })
        return { status: res.status(), body: await res.text() }
    }

    /** Best-effort cleanup of automation rules created by this suite in a project. */
    async cleanupAutomationRules(projectId: string): Promise<number> {
        const rules = await this.listAutomationRules(projectId)
        const stale = rules.filter((r) => r.name.startsWith(DATA_PREFIX))
        for (const r of stale) await this.deleteAutomationRule(projectId, r.id)
        return stale.length
    }

    /* ── Companies (gateway v1-data-bff, contract company.md §3) ──────────────
     *
     * Two things differ from the contacts helpers above and both are load-bearing:
     *
     * 1. `projectId` goes in the QUERY STRING, not only in `X-Project-Id`. The
     *    company BFF handlers read `@Query('projectId')` and forward it as
     *    `project_id` to the domain; with the header alone the domain gets an
     *    empty project and answers with an empty list / NOT_FOUND.
     * 2. No `Content-Type` on DELETE. The gateway body parser rejects a request
     *    that declares `application/json` and sends nothing
     *    ("Body cannot be empty when content-type is set", HTTP 400), so a
     *    DELETE must not carry the header — Playwright omits it as long as we
     *    pass no `data`.
     */

    /** Create a company in a project. Returns its id. */
    async createCompany(
        projectId: string,
        data: {
            name: string
            inn?: string
            kpp?: string
            legalAddress?: string
            phone?: string
            email?: string
            website?: string
            industry?: string
            status?: string
            assigneeId?: string
        },
    ): Promise<string> {
        const res = await this.ctx.post(apiUrl('/v1/companies'), {
            headers: this.headers(projectId),
            params: { projectId },
            data,
        })
        if (!res.ok()) {
            throw new Error(`createCompany failed: ${res.status()} ${await res.text()}`)
        }
        return ((await res.json()) as { id: string }).id
    }

    /** Default module set for documents e2e projects. */
    static documentsModules(): string[] {
        return ['documents', 'deals', 'orders', 'contacts', 'products']
    }

    async createDocumentsProject(name: string): Promise<string> {
        return this.createProject(name, ApiClient.documentsModules())
    }

    /** First pipeline + first active stage for deal creation (project-scoped via X-Project-Id). */
    async getDefaultPipelineStage(projectId: string): Promise<{ pipelineId: string; stageId: string }> {
        const list = await this.getPipelines(projectId)
        const pipeline = list.find((p) => p.isDefault) ?? list[0]
        if (!pipeline?.id) {
            throw new Error('no pipeline in project')
        }
        const activeStage =
            pipeline.stages.find((s) => !s.kind || s.kind === 'active') ?? pipeline.stages[0]
        if (!activeStage?.id) {
            throw new Error('no stage in pipeline')
        }
        return { pipelineId: pipeline.id, stageId: activeStage.id }
    }

    async updateCompany(
        projectId: string,
        companyId: string,
        data: Record<string, unknown>,
    ): Promise<void> {
        const res = await this.ctx.put(apiUrl(`/v1/companies/${companyId}`), {
            headers: this.headers(projectId),
            params: { projectId },
            data,
        })
        if (!res.ok()) {
            throw new Error(`updateCompany failed: ${res.status()} ${await res.text()}`)
        }
    }

    /** Soft-delete (move to trash). Non-fatal — cleanup is best-effort. */
    async deleteCompany(projectId: string, companyId: string): Promise<void> {
        await this.ctx.delete(apiUrl(`/v1/companies/${companyId}`), {
            headers: this.headers(projectId),
            params: { projectId },
        })
    }

    /** Create a custom report. Returns its id. */
    async createReport(
        projectId: string,
        body: {
            name: string
            description?: string
            spec?: Record<string, unknown>
            visibility?: 'personal' | 'project'
        },
    ): Promise<string> {
        const res = await this.ctx.post(apiUrl('/v1/reports'), {
            headers: this.headers(projectId),
            params: { projectId },
            data: { kind: 'custom', ...body },
        })
        if (!res.ok()) {
            throw new Error(`createReport failed: ${res.status()} ${await res.text()}`)
        }
        return ((await res.json()) as { id: string }).id
    }

    /** POST /v1/chat/conversations — create a conversation in a project. Returns id. */
    async createChatConversation(
        projectId: string,
        body: {
            type: 'dm' | 'group' | 'project_channel'
            peerUserId?: string
            title?: string
            memberUserIds?: string[]
        },
    ): Promise<string> {
        const res = await this.ctx.post(apiUrl('/v1/chat/conversations'), {
            headers: this.headers(projectId),
            params: { projectId },
            data: body,
        })
        if (!res.ok()) {
            throw new Error(`createChatConversation failed: ${res.status()} ${await res.text()}`)
        }
        return ((await res.json()) as { id: string }).id
    }

    async deleteReport(projectId: string, reportId: string): Promise<void> {
        await this.ctx.delete(apiUrl(`/v1/reports/${reportId}`), {
            headers: this.headers(projectId),
            params: { projectId },
        })
    }

    /** POST /v1/chat/conversations/{id}/archive — best-effort cleanup. */
    async archiveChatConversation(projectId: string, conversationId: string): Promise<void> {
        await this.ctx.post(apiUrl(`/v1/chat/conversations/${conversationId}/archive`), {
            headers: this.headers(projectId),
            params: { projectId },
        })
    }

    /**
     * Restore from trash. `strategy` resolves an identity-key collision
     * (merge / clear_key / as_new) when a live duplicate holds the same INN/domain.
     */
    async restoreCompany(
        projectId: string,
        companyId: string,
        strategy?: 'merge' | 'clear_key' | 'as_new',
    ): Promise<number> {
        const res = await this.ctx.post(apiUrl(`/v1/companies/${companyId}/restore`), {
            headers: this.headers(projectId),
            params: { projectId },
            data: strategy ? { strategy } : {},
        })
        return res.status()
    }

    /** Hard-delete (purge) — the same DELETE route with `force=true`. */
    async purgeCompany(projectId: string, companyId: string): Promise<void> {
        await this.ctx.delete(apiUrl(`/v1/companies/${companyId}`), {
            headers: this.headers(projectId),
            params: { projectId, force: 'true' },
        })
    }

    /** Companies in a project (`{ list, total }` shape of the BFF). */
    async listCompanies(
        projectId: string,
        params: Record<string, string | number> = {},
    ): Promise<Array<{ id: string; name?: string; deletedAt?: number }>> {
        const res = await this.ctx.get(apiUrl('/v1/companies'), {
            headers: this.headers(projectId),
            params: { projectId, pageSize: 200, ...params },
        })
        if (!res.ok()) return []
        const body = (await res.json()) as { list?: Array<{ id: string; name?: string }> }
        return body.list ?? []
    }

    /** Soft-deleted companies of a project (trash screen data source). */
    async listCompaniesTrash(
        projectId: string,
    ): Promise<Array<{ id: string; name?: string; deletedAt?: number }>> {
        const res = await this.ctx.get(apiUrl('/v1/companies/trash'), {
            headers: this.headers(projectId),
            params: { projectId, pageSize: 200 },
        })
        if (!res.ok()) return []
        const body = (await res.json()) as { list?: Array<{ id: string; name?: string; deletedAt?: number }> }
        return body.list ?? []
    }

    async listReports(projectId: string): Promise<Array<{ id: string; name: string; kind?: string }>> {
        const res = await this.ctx.get(apiUrl('/v1/reports'), {
            headers: this.headers(projectId),
            params: { projectId, pageSize: 200 },
        })
        if (!res.ok()) return []
        const body = (await res.json()) as { list?: Array<{ id: string; name: string; kind?: string }> }
        return body.list ?? []
    }

    async uploadDocument(
        projectId: string,
        filePath: string,
        opts: { name?: string; contextType?: string; recordId?: string } = {},
    ): Promise<{ groupId: string; versionId?: string }> {
        const fileName = path.basename(filePath)
        const buffer = fs.readFileSync(filePath)
        const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
            file: {
                name: fileName,
                mimeType: fileName.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                buffer,
            },
            name: opts.name ?? fileName,
            contextType: opts.contextType ?? 'none',
        }
        if (opts.recordId) multipart.recordId = opts.recordId
        const res = await this.ctx.post(apiUrl('/v1/documents/upload'), {
            headers: this.headers(projectId),
            multipart,
        })
        if (!res.ok()) {
            throw new Error(`uploadDocument failed: ${res.status()} ${await res.text()}`)
        }
        const body = (await res.json()) as {
            group: { groupId: string }
            version?: { versionId?: string }
        }
        return { groupId: body.group.groupId, versionId: body.version?.versionId }
    }

    async deleteDocument(projectId: string, groupId: string): Promise<void> {
        await this.ctx.delete(apiUrl(`/v1/documents/${groupId}`), {
            headers: this.headers(projectId),
        })
    }

    async listDocuments(
        projectId: string,
        params: Record<string, string | number | boolean | undefined> = {},
    ): Promise<{ list: Array<{ groupId: string; name: string }>; total: number }> {
        const res = await this.ctx.get(apiUrl('/v1/documents'), {
            headers: this.headers(projectId),
            params,
        })
        if (!res.ok()) return { list: [], total: 0 }
        return (await res.json()) as { list: Array<{ groupId: string; name: string }>; total: number }
    }

    async getDocument(
        projectId: string,
        groupId: string,
    ): Promise<{ group: { groupId: string; currentVersion: number }; versions: Array<{ versionId: string; version: number }> }> {
        const res = await this.ctx.get(apiUrl(`/v1/documents/${groupId}`), {
            headers: this.headers(projectId),
        })
        if (!res.ok()) {
            throw new Error(`getDocument failed: ${res.status()} ${await res.text()}`)
        }
        return (await res.json()) as {
            group: { groupId: string; currentVersion: number }
            versions: Array<{ versionId: string; version: number }>
        }
    }

    async createTemplate(
        projectId: string,
        name: string,
        contextType: 'deal' | 'order' | 'contact' | 'company',
        publish = false,
    ): Promise<string> {
        const docxPath = path.join(FIXTURES_DIR, 'minimal.docx')
        const buffer = fs.readFileSync(docxPath)
        const res = await this.ctx.post(apiUrl('/v1/document-templates'), {
            headers: this.headers(projectId),
            multipart: {
                file: {
                    name: `${name}.docx`,
                    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    buffer,
                },
                name,
                contextType,
            },
        })
        if (!res.ok()) {
            throw new Error(`createTemplate failed: ${res.status()} ${await res.text()}`)
        }
        const id = ((await res.json()) as { id: string }).id
        if (publish) {
            const pub = await this.ctx.post(apiUrl(`/v1/document-templates/${id}/publish`), {
                headers: this.headers(projectId),
                data: {},
            })
            if (!pub.ok()) {
                throw new Error(`publishTemplate failed: ${pub.status()} ${await pub.text()}`)
            }
        }
        return id
    }

    async deleteTemplate(projectId: string, templateId: string): Promise<void> {
        await this.ctx.delete(apiUrl(`/v1/document-templates/${templateId}`), {
            headers: this.headers(projectId),
        })
    }

    async archiveTemplate(projectId: string, templateId: string): Promise<void> {
        const res = await this.ctx.post(apiUrl(`/v1/document-templates/${templateId}/archive`), {
            headers: this.headers(projectId),
            data: {},
        })
        if (!res.ok()) {
            throw new Error(`archiveTemplate failed: ${res.status()} ${await res.text()}`)
        }
    }

    async generateDocument(
        projectId: string,
        payload: { templateId: string; contextType: string; recordId: string },
    ): Promise<{ groupId: string }> {
        const res = await this.ctx.post(apiUrl('/v1/documents/generate'), {
            headers: this.headers(projectId),
            data: payload,
        })
        if (!res.ok()) {
            throw new Error(`generateDocument failed: ${res.status()} ${await res.text()}`)
        }
        const body = (await res.json()) as { group: { groupId: string } }
        return { groupId: body.group.groupId }
    }

    async regenerateDocument(projectId: string, groupId: string): Promise<void> {
        const doc = await this.getDocument(projectId, groupId)
        const res = await this.ctx.post(apiUrl(`/v1/documents/${groupId}/regenerate`), {
            headers: this.headers(projectId),
            data: { useRevision: 'current', expectedVersion: doc.group.currentVersion },
        })
        if (!res.ok()) {
            throw new Error(`regenerateDocument failed: ${res.status()} ${await res.text()}`)
        }
    }

    async deleteOrder(projectId: string, orderId: string): Promise<void> {
        await this.ctx.delete(apiUrl(`/v1/orders/${orderId}`), { headers: this.headers(projectId) })
    }

    fixturePath(name: string): string {
        return path.join(FIXTURES_DIR, name)
    }

    /** Delete every company the suite created in a project (live + trashed). */
    async purgeAllCompanies(projectId: string): Promise<void> {
        for (const c of await this.listCompanies(projectId)) {
            await this.deleteCompany(projectId, c.id)
        }
        for (const c of await this.listCompaniesTrash(projectId)) {
            await this.purgeCompany(projectId, c.id)
        }
    }

    /** Create a product in a project. Returns its id. */
    async createProduct(
        projectId: string,
        data: {
            name: string
            price?: number
            unit?: string
            description?: string
            category?: string
            orderTypeId?: string
            orderTypeName?: string
            prefill?: Record<string, string>
        },
    ): Promise<string> {
        const res = await this.ctx.post(apiUrl('/v1/products'), {
            headers: {
                ...this.headers(projectId),
                'Idempotency-Key': `e2e-${Date.now()}-${Math.random()}`,
            },
            data: {
                name: data.name,
                price: data.price ?? 0,
                unit: data.unit ?? 'ONE_TIME',
                description: data.description ?? '',
                category: data.category ?? '',
                orderTypeId: data.orderTypeId ?? '',
                orderTypeName: data.orderTypeName ?? '',
                prefill: data.prefill ?? {},
            },
        })
        if (!res.ok()) {
            throw new Error(`createProduct failed: ${res.status()} ${await res.text()}`)
        }
        return ((await res.json()) as { id: string }).id
    }

    async updateProduct(
        projectId: string,
        productId: string,
        data: Record<string, unknown>,
    ): Promise<void> {
        const res = await this.ctx.put(apiUrl(`/v1/products/${productId}`), {
            headers: this.headers(projectId),
            data,
        })
        if (!res.ok()) {
            throw new Error(`updateProduct failed: ${res.status()} ${await res.text()}`)
        }
    }

    async getProduct(projectId: string, productId: string): Promise<Record<string, unknown>> {
        const res = await this.ctx.get(apiUrl(`/v1/products/${productId}`), {
            headers: this.headers(projectId),
        })
        if (!res.ok()) {
            throw new Error(`getProduct failed: ${res.status()} ${await res.text()}`)
        }
        return (await res.json()) as Record<string, unknown>
    }

    async listProducts(
        projectId: string,
        params: Record<string, string | number> = {},
    ): Promise<Array<{ id: string; name?: string; status?: string }>> {
        const res = await this.ctx.get(apiUrl('/v1/products'), {
            headers: this.headers(projectId),
            params: { projectId, pageSize: 200, ...params },
        })
        if (!res.ok()) return []
        const body = (await res.json()) as { list?: Array<{ id: string; name?: string; status?: string }> }
        return body.list ?? []
    }

    async archiveProduct(projectId: string, productId: string): Promise<void> {
        const res = await this.ctx.post(apiUrl(`/v1/products/${productId}/archive`), {
            headers: this.headers(projectId),
        })
        if (!res.ok()) {
            throw new Error(`archiveProduct failed: ${res.status()} ${await res.text()}`)
        }
    }

    async restoreProduct(projectId: string, productId: string): Promise<void> {
        const res = await this.ctx.post(apiUrl(`/v1/products/${productId}/restore`), {
            headers: this.headers(projectId),
        })
        if (!res.ok()) {
            throw new Error(`restoreProduct failed: ${res.status()} ${await res.text()}`)
        }
    }

    async deleteProduct(projectId: string, productId: string, force = true): Promise<void> {
        const res = await this.ctx.delete(apiUrl(`/v1/products/${productId}`), {
            headers: this.headers(projectId),
            params: { force: force ? 'true' : 'false' },
        })
        if (!res.ok()) {
            throw new Error(`deleteProduct failed: ${res.status()} ${await res.text()}`)
        }
    }

    /** Best-effort purge of all products in a project (for empty-state tests). */
    async purgeProducts(projectId: string): Promise<void> {
        const list = await this.listProducts(projectId, { status: 'all' })
        for (const p of list) {
            try {
                await this.deleteProduct(projectId, p.id, true)
            } catch {
                try {
                    await this.archiveProduct(projectId, p.id)
                } catch {
                    /* ignore */
                }
            }
        }
    }

    /**
     * Create a minimal order type (required to create an order at all — the
     * orders domain answers `ORDER_TYPE_REQUIRED` otherwise).
     *
     * The stage spec must contain EXACTLY ONE terminal stage and it must be the
     * last by `order`, else the domain rejects the spec with
     * `stages: no_terminal_stage` / `terminal_not_last`. Note the gateway reads
     * the camelCase `isTerminal` (`orderTypeSpecToGrpc`), not `is_terminal`.
     *
     * String name → `{ id, name }` for products e2e; full payload → id string for orders seed.
     */
    async createOrderType(projectId: string, name: string): Promise<{ id: string; name: string }>
    async createOrderType(projectId: string, payload: Record<string, unknown>): Promise<string>
    async createOrderType(
        projectId: string,
        nameOrPayload: string | Record<string, unknown>,
    ): Promise<string | { id: string; name: string }> {
        const isStringName = typeof nameOrPayload === 'string'
        const data = isStringName
            ? {
                  name: nameOrPayload,
                  fields: [],
                  stages: [
                      { id: 's1', name: 'Новый', order: 0, isTerminal: false },
                      { id: 's2', name: 'Готово', order: 1, isTerminal: true },
                  ],
              }
            : nameOrPayload
        const res = await this.ctx.post(apiUrl('/v1/order-types'), {
            headers: this.headers(projectId),
            params: { projectId },
            data,
        })
        if (!res.ok()) {
            throw new Error(`createOrderType failed: ${res.status()} ${await res.text()}`)
        }
        const body = (await res.json()) as { id: string; name?: string }
        if (isStringName) {
            return { id: body.id, name: body.name ?? nameOrPayload }
        }
        return body.id
    }

    async deleteOrderType(projectId: string, orderTypeId: string): Promise<void> {
        await this.ctx.delete(apiUrl(`/v1/order-types/${orderTypeId}`), {
            headers: this.headers(projectId),
        })
    }

    /** Create an order (needs an order type; deal/company links are optional). */
    async createOrder(projectId: string, name: string, dealId?: string): Promise<string>
    async createOrder(projectId: string, data: Record<string, unknown>): Promise<string>
    async createOrder(
        projectId: string,
        nameOrData: string | Record<string, unknown>,
        dealId?: string,
    ): Promise<string> {
        if (typeof nameOrData === 'string') {
            const typesRes = await this.ctx.get(apiUrl('/v1/order-types'), {
                headers: this.headers(projectId),
            })
            let orderTypeId: string | undefined
            if (typesRes.ok()) {
                const typesBody = (await typesRes.json()) as
                    | Array<{ id: string }>
                    | { list?: Array<{ id: string }> }
                const types = Array.isArray(typesBody) ? typesBody : (typesBody.list ?? [])
                orderTypeId = types[0]?.id
            }
            const res = await this.ctx.post(apiUrl('/v1/orders'), {
                headers: this.headers(projectId),
                data: {
                    name: nameOrData,
                    ...(orderTypeId ? { orderTypeId } : {}),
                    ...(dealId ? { dealId } : {}),
                },
            })
            if (!res.ok()) {
                throw new Error(`createOrder failed: ${res.status()} ${await res.text()}`)
            }
            return ((await res.json()) as { id: string }).id
        }
        const res = await this.ctx.post(apiUrl('/v1/orders'), {
            headers: this.headers(projectId),
            params: { projectId },
            data: nameOrData,
        })
        if (!res.ok()) {
            throw new Error(`createOrder failed: ${res.status()} ${await res.text()}`)
        }
        return ((await res.json()) as { id: string }).id
    }

    /** POST /v1/orders/batch */
    async createOrdersBatch(
        projectId: string,
        payload: Record<string, unknown>,
    ): Promise<unknown> {
        const res = await this.ctx.post(apiUrl('/v1/orders/batch'), {
            ...this.projectScope(projectId),
            data: payload,
        })
        await this.assertOk(res, 'createOrdersBatch')
        return res.json()
    }

    /** GET /v1/orders */
    async listOrders(
        projectId: string,
        params: Record<string, string | number | boolean> = {},
    ): Promise<Array<{ id: string; number?: string; status?: string }>> {
        const res = await this.ctx.get(apiUrl('/v1/orders'), {
            headers: this.headers(projectId),
            params: { projectId, pageSize: 200, ...params },
        })
        if (!res.ok()) return []
        const body = (await res.json()) as { list?: Array<{ id: string; number?: string; status?: string }> }
        return body.list ?? []
    }

    /** GET /v1/orders/:id */
    async getOrder(projectId: string, orderId: string): Promise<Record<string, unknown>> {
        const res = await this.ctx.get(apiUrl(`/v1/orders/${orderId}`), this.projectScope(projectId))
        await this.assertOk(res, 'getOrder')
        return (await res.json()) as Record<string, unknown>
    }

    /** PUT /v1/orders/:id/stage */
    async moveOrderStage(
        projectId: string,
        orderId: string,
        stageId: string,
        acceptDrift?: boolean,
    ): Promise<void> {
        const res = await this.ctx.put(apiUrl(`/v1/orders/${orderId}/stage`), {
            ...this.projectScope(projectId),
            data: { stageId, ...(acceptDrift !== undefined ? { acceptDrift } : {}) },
        })
        await this.assertOk(res, 'moveOrderStage')
    }

    /** POST /v1/orders/:id/cancel */
    async cancelOrder(projectId: string, orderId: string, reason?: string): Promise<void> {
        const res = await this.ctx.post(apiUrl(`/v1/orders/${orderId}/cancel`), {
            ...this.projectScope(projectId),
            data: reason ? { reason } : {},
        })
        await this.assertOk(res, 'cancelOrder')
    }

    /** POST /v1/orders/:id/accept-drift */
    async acceptOrderDrift(projectId: string, orderId: string): Promise<void> {
        const res = await this.ctx.post(apiUrl(`/v1/orders/${orderId}/accept-drift`), this.projectScope(projectId))
        await this.assertOk(res, 'acceptOrderDrift')
    }


    // ─── Deals (pipe BFF) ───────────────────────────────────────────────────

    async getPipelines(projectId: string): Promise<
        Array<{
            id: string
            name: string
            isDefault?: boolean
            stages: Array<{ id: string; name: string; kind?: string; order?: number }>
        }>
    > {
        const res = await this.ctx.get(apiUrl('/v1/pipelines'), this.projectScope(projectId))
        if (!res.ok()) return []
        const body = (await res.json()) as unknown
        if (Array.isArray(body)) return body as never
        return ((body as { list?: unknown[] }).list ?? []) as never
    }

    /** GET /v1/pipelines — alias used by orders e2e seed helpers. */
    async listPipelines(
        projectId: string,
    ): Promise<
        Array<{
            id: string
            name: string
            isDefault?: boolean
            stages: Array<{ id: string; name: string; kind?: string; order?: number }>
        }>
    > {
        return this.getPipelines(projectId)
    }

    async createDeal(projectId: string, name: string): Promise<string>
    async createDeal(projectId: string, data: Record<string, unknown>): Promise<string>
    async createDeal(
        projectId: string,
        nameOrData: string | Record<string, unknown>,
    ): Promise<string> {
        const defaults = await this.getDefaultPipelineStage(projectId)
        const data =
            typeof nameOrData === 'string'
                ? {
                      name: nameOrData,
                      ...defaults,
                      lightName: nameOrData,
                      lightPhone: '+79001234567',
                  }
                : {
                      amount: 100_000,
                      ...defaults,
                      ...nameOrData,
                  }
        const res = await this.ctx.post(apiUrl('/v1/deals'), {
            headers: this.headers(projectId),
            params: { projectId },
            data: { amount: 0, ...data },
        })
        if (!res.ok()) {
            throw new Error(`createDeal failed: ${res.status()} ${await res.text()}`)
        }
        return ((await res.json()) as { id: string }).id
    }

    async getDeal(projectId: string, dealId: string): Promise<Record<string, unknown>> {
        const res = await this.ctx.get(apiUrl(`/v1/deals/${dealId}`), {
            headers: this.headers(projectId),
            params: { projectId },
        })
        if (!res.ok()) {
            throw new Error(`getDeal failed: ${res.status()} ${await res.text()}`)
        }
        return (await res.json()) as Record<string, unknown>
    }

    async listDeals(
        projectId: string,
        params: Record<string, string | number | boolean | undefined> = {},
    ): Promise<{ list: Array<{ id: string; name?: string }>; total: number }> {
        const res = await this.ctx.get(apiUrl('/v1/deals'), {
            headers: this.headers(projectId),
            params: { projectId, pageSize: 200, ...params },
        })
        if (!res.ok()) return { list: [], total: 0 }
        const body = (await res.json()) as { list?: Array<{ id: string; name?: string }>; total?: number }
        return { list: body.list ?? [], total: body.total ?? body.list?.length ?? 0 }
    }

    async updateDeal(
        projectId: string,
        dealId: string,
        data: Record<string, unknown>,
    ): Promise<void> {
        const res = await this.ctx.put(apiUrl(`/v1/deals/${dealId}`), {
            headers: this.headers(projectId),
            data,
        })
        if (!res.ok()) {
            throw new Error(`updateDeal failed: ${res.status()} ${await res.text()}`)
        }
    }

    async moveDealStage(projectId: string, dealId: string, stageId: string): Promise<void> {
        const res = await this.ctx.put(apiUrl(`/v1/deals/${dealId}/stage`), {
            headers: this.headers(projectId),
            data: { stageId },
        })
        if (!res.ok()) {
            throw new Error(`moveDealStage failed: ${res.status()} ${await res.text()}`)
        }
    }

    async closeDeal(
        projectId: string,
        dealId: string,
        result: 'won' | 'lost',
        extra: { lostReasonId?: string; lostReasonComment?: string } = {},
    ): Promise<void> {
        const res = await this.ctx.post(apiUrl(`/v1/deals/${dealId}/close`), {
            headers: this.headers(projectId),
            data: { result, ...extra },
        })
        if (!res.ok()) {
            throw new Error(`closeDeal failed: ${res.status()} ${await res.text()}`)
        }
    }

    async reopenDeal(
        projectId: string,
        dealId: string,
        reason: string,
        targetStageId: string,
    ): Promise<void> {
        const res = await this.ctx.post(apiUrl(`/v1/deals/${dealId}/reopen`), {
            headers: this.headers(projectId),
            data: { reason, targetStageId },
        })
        if (!res.ok()) {
            throw new Error(`reopenDeal failed: ${res.status()} ${await res.text()}`)
        }
    }

    /** PATCH /v1/auth/me — profile fields including defaultDealsView. */
    async updateMyProfile(data: Record<string, unknown>): Promise<void> {
        const res = await this.ctx.patch(apiUrl('/v1/auth/me'), {
            headers: this.headers(),
            data,
        })
        if (!res.ok()) {
            throw new Error(`updateMyProfile failed: ${res.status()} ${await res.text()}`)
        }
    }

    /** GET deal expecting failure (404/403). */
    async getDealRaw(
        projectId: string,
        dealId: string,
    ): Promise<{ ok: boolean; status: number; body: unknown }> {
        const res = await this.ctx.get(apiUrl(`/v1/deals/${dealId}`), {
            headers: this.headers(projectId),
            params: { projectId },
        })
        let body: unknown = null
        try {
            body = await res.json()
        } catch {
            body = await res.text()
        }
        return { ok: res.ok(), status: res.status(), body }
    }

    async moveDealStageRaw(
        projectId: string,
        dealId: string,
        stageId: string,
    ): Promise<{ ok: boolean; status: number }> {
        const res = await this.ctx.put(apiUrl(`/v1/deals/${dealId}/stage`), {
            headers: this.headers(projectId),
            data: { stageId },
        })
        return { ok: res.ok(), status: res.status() }
    }

    async deleteDeal(projectId: string, dealId: string): Promise<void> {
        const res = await this.ctx.delete(apiUrl(`/v1/deals/${dealId}`), {
            headers: this.headers(projectId),
        })
        if (!res.ok()) {
            throw new Error(`deleteDeal failed: ${res.status()} ${await res.text()}`)
        }
    }

    async restoreDeal(projectId: string, dealId: string): Promise<void> {
        const res = await this.ctx.post(apiUrl(`/v1/deals/${dealId}/restore`), {
            headers: this.headers(projectId),
        })
        if (!res.ok()) {
            throw new Error(`restoreDeal failed: ${res.status()} ${await res.text()}`)
        }
    }

    async createPipeline(
        projectId: string,
        data: Record<string, unknown>,
    ): Promise<{ id: string }> {
        const res = await this.ctx.post(apiUrl('/v1/pipelines'), {
            headers: this.headers(projectId),
            data,
        })
        if (!res.ok()) {
            throw new Error(`createPipeline failed: ${res.status()} ${await res.text()}`)
        }
        return (await res.json()) as { id: string }
    }

    async updatePipeline(
        projectId: string,
        pipelineId: string,
        data: Record<string, unknown>,
    ): Promise<void> {
        const res = await this.ctx.put(apiUrl(`/v1/pipelines/${pipelineId}`), {
            headers: this.headers(projectId),
            data,
        })
        if (!res.ok()) {
            throw new Error(`updatePipeline failed: ${res.status()} ${await res.text()}`)
        }
    }

    /** Try to seed a deal the list marks as stalled (rottingDays on stage). Returns null if BE does not flag it. */
    async seedStalledDeal(
        projectId: string,
        name: string,
    ): Promise<{ id: string; stageId: string; pipelineId: string } | null> {
        const pipelines = await this.getPipelines(projectId)
        const pipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0]
        if (!pipeline) return null
        const activeStage =
            pipeline.stages.find((s) => !s.kind || s.kind === 'active') ?? pipeline.stages[0]
        if (!activeStage) return null
        await this.updatePipeline(projectId, pipeline.id, {
            name: pipeline.name,
            isDefault: pipeline.isDefault,
            stages: pipeline.stages.map((s) =>
                s.id === activeStage.id ? { ...s, rottingDays: 0 } : s,
            ),
        })
        const seeded = await this.seedOpenDeal(projectId, name, {
            pipelineId: pipeline.id,
            stageId: activeStage.id,
        })
        const deal = await this.getDeal(projectId, seeded.id)
        if (!deal.isStalled) return null
        return seeded
    }

    /** Seed an open deal on the default pipeline's first active stage. */
    async seedOpenDeal(
        projectId: string,
        name: string,
        extra: Record<string, unknown> = {},
    ): Promise<{ id: string; stageId: string; pipelineId: string }> {
        const pipelines = await this.getPipelines(projectId)
        const pipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0]
        if (!pipeline) throw new Error('seedOpenDeal: no pipeline in project')
        const activeStage =
            pipeline.stages.find((s) => !s.kind || s.kind === 'active') ?? pipeline.stages[0]
        if (!activeStage) throw new Error('seedOpenDeal: pipeline has no stages')
        const id = await this.createDeal(projectId, {
            name,
            amount: 1000,
            pipelineId: pipeline.id,
            stageId: activeStage.id,
            ...extra,
        })
        return { id, stageId: activeStage.id, pipelineId: pipeline.id }
    }

    /** Open deal with expectedCloseDate in the past (overdue badge e2e). */
    async seedOverdueDeal(
        projectId: string,
        name: string,
        extra: Record<string, unknown> = {},
    ): Promise<{ id: string; stageId: string; pipelineId: string }> {
        return this.seedOpenDeal(projectId, name, {
            expectedCloseDate: Math.floor(Date.now() / 1000) - 3 * 86_400,
            ...extra,
        })
    }

    async seedLightDeal(
        projectId: string,
        name: string,
        light: { lightName?: string; lightPhone?: string; lightEmail?: string; lightCompanyName?: string },
    ): Promise<{ id: string }> {
        const pipelines = await this.getPipelines(projectId)
        const pipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0]
        if (!pipeline) throw new Error('seedLightDeal: no pipeline')
        const stage = pipeline.stages.find((s) => !s.kind || s.kind === 'active') ?? pipeline.stages[0]
        const id = await this.createDeal(projectId, {
            name,
            amount: 1000,
            pipelineId: pipeline.id,
            stageId: stage?.id,
            ...light,
        })
        return { id }
    }

    async getLostReasons(projectId: string): Promise<Array<{ id: string; name: string }>> {
        const res = await this.ctx.get(apiUrl('/v1/lost-reasons'), {
            headers: this.headers(projectId),
            params: { activeOnly: true },
        })
        if (!res.ok()) return []
        const body = (await res.json()) as unknown
        if (Array.isArray(body)) return body as Array<{ id: string; name: string }>
        return ((body as { list?: Array<{ id: string; name: string }> }).list ?? []) as Array<{
            id: string
            name: string
        }>
    }

    async updateContact(
        projectId: string,
        contactId: string,
        data: Record<string, unknown>,
    ): Promise<void> {
        const res = await this.ctx.put(apiUrl(`/v1/contacts/${contactId}`), {
            headers: this.headers(projectId),
            data,
        })
        if (!res.ok()) {
            throw new Error(`updateContact failed: ${res.status()} ${await res.text()}`)
        }
    }

    async cleanupDeals(projectId: string, namePrefix: string): Promise<void> {
        const { list } = await this.listDeals(projectId, { pageSize: 500 })
        for (const d of list) {
            if (d.name?.startsWith(namePrefix)) {
                try {
                    await this.deleteDeal(projectId, d.id)
                } catch {
                    /* best-effort */
                }
            }
        }
    }

    /** Contacts in a project (mapped `list`/array shape). */
    async listContacts(
        projectId: string,
        params: { query?: string; pageSize?: number; pageIndex?: number } = {},
    ): Promise<{ list: Array<{ id: string; name?: string; source?: string }>; total: number }> {
        const res = await this.ctx.get(apiUrl('/v1/contacts'), {
            headers: this.headers(projectId),
            params: { projectId, pageSize: params.pageSize ?? 200, pageIndex: params.pageIndex ?? 0, query: params.query },
        })
        if (!res.ok()) return { list: [], total: 0 }
        const body = (await res.json()) as { list?: Array<{ id: string; name?: string; source?: string }>; total?: number }
        return { list: body.list ?? [], total: body.total ?? 0 }
    }


    // ─── Activities (activity BFF) ───────────────────────────────────────────

    /** Create an activity. Returns its id. */
    async createActivity(projectId: string, data: ActivitySeed): Promise<string> {
        const payload: Record<string, unknown> = {
            projectId,
            type: data.type ?? 'task',
            title: data.title,
            status: data.status ?? 'planned',
            assigneeId: data.assigneeId ?? this.userId,
        }
        if (data.dueDate != null) payload.dueDate = data.dueDate
        if (data.startDate != null) payload.startDate = data.startDate
        if (data.endDate != null) payload.endDate = data.endDate
        if (data.direction) payload.direction = data.direction
        if (data.description) payload.description = data.description
        if (data.dealId) payload.dealId = data.dealId
        if (data.links?.length) payload.links = data.links
        const res = await this.ctx.post(apiUrl('/v1/activities'), {
            headers: this.headers(projectId),
            params: { projectId },
            data: payload,
        })
        if (!res.ok()) {
            throw new Error(`createActivity failed: ${res.status()} ${await res.text()}`)
        }
        const body = (await res.json()) as { id?: string; _id?: string }
        return body.id ?? body._id ?? ''
    }

    async getActivity(
        projectId: string,
        activityId: string,
    ): Promise<{ id: string; status?: string; title?: string } | null> {
        const res = await this.ctx.get(apiUrl(`/v1/activities/${activityId}`), {
            headers: this.headers(projectId),
            params: { projectId },
        })
        if (!res.ok()) return null
        return (await res.json()) as { id: string; status?: string; title?: string }
    }

    async listActivities(
        projectId: string,
        params: Record<string, unknown> = {},
    ): Promise<Array<{ id: string; title?: string; status?: string }>> {
        const res = await this.ctx.get(apiUrl('/v1/activities'), {
            headers: this.headers(projectId),
            params: { projectId, pageSize: 200, pageIndex: 0, ...params },
        })
        if (!res.ok()) return []
        const body = (await res.json()) as { list?: Array<{ id: string; title?: string; status?: string }> }
        return body.list ?? []
    }

    async completeActivity(projectId: string, activityId: string): Promise<void> {
        const res = await this.ctx.post(apiUrl(`/v1/activities/${activityId}/complete`), {
            headers: this.headers(projectId),
            params: { projectId },
            data: {},
        })
        if (!res.ok()) {
            throw new Error(`completeActivity failed: ${res.status()} ${await res.text()}`)
        }
    }

    async deleteActivity(projectId: string, activityId: string): Promise<void> {
        const res = await this.ctx.delete(apiUrl(`/v1/activities/${activityId}`), {
            headers: this.headers(projectId),
            params: { projectId },
        })
        if (!res.ok()) {
            throw new Error(`deleteActivity failed: ${res.status()} ${await res.text()}`)
        }
    }

    async restoreActivity(projectId: string, activityId: string): Promise<void> {
        const res = await this.ctx.post(apiUrl(`/v1/activities/${activityId}/restore`), {
            headers: this.headers(projectId),
            params: { projectId },
            data: {},
        })
        if (!res.ok()) {
            throw new Error(`restoreActivity failed: ${res.status()} ${await res.text()}`)
        }
    }

    async bulkActivities(
        projectId: string,
        action: 'complete' | 'delete',
        ids: string[],
    ): Promise<void> {
        const res = await this.ctx.post(apiUrl('/v1/activities/bulk'), {
            headers: this.headers(projectId),
            params: { projectId },
            data: { action, ids, projectId },
        })
        if (!res.ok()) {
            throw new Error(`bulkActivities failed: ${res.status()} ${await res.text()}`)
        }
    }

    /** POST /search/reindex — rebuild project search index. */
    async reindexSearch(projectId: string): Promise<{ indexed_count: number }> {
        const res = await this.ctx.post(apiUrl('/search/reindex'), {
            headers: {
                ...this.headers(projectId),
                'Idempotency-Key': this.idempotencyKey(),
            },
            params: { projectId },
        })
        if (!res.ok()) {
            throw new Error(`reindexSearch failed: ${res.status()} ${await res.text()}`)
        }
        return (await res.json()) as { indexed_count: number }
    }

    /** GET /search/query */
    async searchQuery(
        projectId: string,
        query: string,
        opts: {
            entityTypes?: string
            scope?: string
            pageIndex?: number
            pageSize?: number
            perTypeLimit?: number
        } = {},
    ): Promise<{
        total: number
        groups: Array<{ entity_type: string; type_total: number; list: Array<{ entity_id: string }> }>
        total_by_type?: Record<string, number>
        has_more?: boolean
    }> {
        const res = await this.ctx.get(apiUrl('/search/query'), {
            headers: this.headers(projectId),
            params: { projectId, query, ...opts },
        })
        if (!res.ok()) {
            throw new Error(`searchQuery failed: ${res.status()} ${await res.text()}`)
        }
        return (await res.json()) as {
            total: number
            groups: Array<{ entity_type: string; type_total: number; list: Array<{ entity_id: string }> }>
            total_by_type?: Record<string, number>
            has_more?: boolean
        }
    }

    /** GET project search module settings (admin). */
    async getSearchSettings(projectId: string): Promise<Record<string, unknown>> {
        const res = await this.ctx.get(
            apiUrl(`/projects/${projectId}/modules/search/settings`),
            { headers: this.headers(projectId) },
        )
        if (!res.ok()) {
            throw new Error(`getSearchSettings failed: ${res.status()} ${await res.text()}`)
        }
        return (await res.json()) as Record<string, unknown>
    }

    /** PUT project search module settings (admin). */
    async putSearchSettings(
        projectId: string,
        settings: Record<string, unknown>,
    ): Promise<Record<string, unknown>> {
        const res = await this.ctx.put(
            apiUrl(`/projects/${projectId}/modules/search/settings`),
            {
                headers: {
                    ...this.headers(projectId),
                    'Idempotency-Key': this.idempotencyKey(),
                },
                data: settings,
            },
        )
        if (!res.ok()) {
            throw new Error(`putSearchSettings failed: ${res.status()} ${await res.text()}`)
        }
        return (await res.json()) as Record<string, unknown>
    }

    /** GET /search/status */
    async getSearchStatus(projectId: string): Promise<{ indexedCount: number }> {
        const res = await this.ctx.get(apiUrl('/search/status'), {
            headers: this.headers(projectId),
            params: { projectId },
        })
        if (!res.ok()) {
            throw new Error(`getSearchStatus failed: ${res.status()} ${await res.text()}`)
        }
        return (await res.json()) as { indexedCount: number }
    }

    /** Deals matching a search substring (list filter server-side contract). */
    async searchDeals(
        projectId: string,
        query: string,
    ): Promise<Array<{ id: string; name?: string }>> {
        const res = await this.ctx.get(apiUrl('/v1/deals'), {
            headers: this.headers(projectId),
            params: { projectId, search: query, pageSize: 50 },
        })
        if (!res.ok()) {
            throw new Error(`searchDeals failed: ${res.status()} ${await res.text()}`)
        }
        const body = (await res.json()) as { list?: Array<{ id: string; name?: string }> }
        return body.list ?? []
    }

    /** GET /v1/auth/me/sessions — active sessions for the current user. */
    async listMySessions(): Promise<
        Array<{ id: string; isCurrent?: boolean; deviceLabel?: string }>
    > {
        const res = await this.ctx.get(apiUrl('/v1/auth/me/sessions'), {
            headers: this.headers(),
        })
        if (!res.ok()) {
            throw new Error(`listMySessions failed: ${res.status()} ${await res.text()}`)
        }
        const body = (await res.json()) as {
            sessions?: Array<{ id: string; isCurrent?: boolean; deviceLabel?: string }>
        }
        return body.sessions ?? []
    }

    /** DELETE /v1/auth/me/sessions/:id — revoke one session (ST-21 when current). */
    async revokeSession(sessionId: string): Promise<void> {
        const res = await this.ctx.delete(apiUrl(`/v1/auth/me/sessions/${sessionId}`), {
            headers: this.headers(),
        })
        if (!res.ok()) {
            throw new Error(`revokeSession failed: ${res.status()} ${await res.text()}`)
        }
    }

    /** Best-effort: archive every project this suite may have leaked. */
    async cleanupProjects(): Promise<number> {
        const own = await this.listOwnProjects()
        const stale = own.filter((p) => p.name.startsWith(DATA_PREFIX))
        for (const p of stale) await this.archiveProject(p.id)
        return stale.length
    }

    /* ── Organization / System (gateway /v1/system/*) ─────────────────────── */

    static async loginWith(email: string, password: string, attempts = 4): Promise<ApiClient> {
        if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
            const cached = await ApiClient.fromCachedStorageState()
            if (cached) return cached
        }

        const ctx = await request.newContext({ ignoreHTTPSErrors: true })
        let lastStatus = 0
        let lastText = ''
        for (let i = 0; i < attempts; i++) {
            const res = await ctx.post(apiUrl('/v1/auth/login'), {
                data: { email, password },
            })
            if (res.ok()) {
                const body = (await res.json()) as { token: string; user: { userId: string } }
                return new ApiClient(ctx, body.token, body.user.userId)
            }
            lastStatus = res.status()
            lastText = await res.text()
            await new Promise((r) => setTimeout(r, 500 * (i + 1)))
        }
        await ctx.dispose()
        throw new Error(`API login failed for ${email}: ${lastStatus} ${lastText}`)
    }

    async getOrganizationRequisites(): Promise<Record<string, unknown>> {
        const res = await this.systemOrOrg('get', '/requisites')
        await this.assertOk(res, 'getOrganizationRequisites')
        return (await res.json()) as Record<string, unknown>
    }

    async updateOrganizationRequisites(data: Record<string, unknown>): Promise<Record<string, unknown>> {
        const res = await this.systemOrOrg('patch', '/requisites', { data })
        await this.assertOk(res, 'updateOrganizationRequisites')
        return (await res.json()) as Record<string, unknown>
    }

    async listEmployees(): Promise<Array<Record<string, unknown>>> {
        const res = await this.systemOrOrg('get', '/employees')
        await this.assertOk(res, 'listEmployees')
        const body = await res.json()
        return (Array.isArray(body) ? body : ((body as { list?: unknown[] }).list ?? [])) as Array<
            Record<string, unknown>
        >
    }

    async addEmployee(data: {
        userId: string
        role?: string
        departmentId?: string
    }): Promise<Record<string, unknown>> {
        const res = await this.systemOrOrg('post', '/employees', { data })
        await this.assertOk(res, 'addEmployee')
        return (await res.json()) as Record<string, unknown>
    }

    async updateEmployee(
        userId: string,
        data: { role?: string; departmentId?: string | null },
    ): Promise<Record<string, unknown>> {
        const res = await this.systemOrOrg('patch', `/employees/${userId}`, { data })
        await this.assertOk(res, 'updateEmployee')
        return (await res.json()) as Record<string, unknown>
    }

    async offboardEmployee(userId: string, reassignToUserId = ''): Promise<Record<string, unknown>> {
        let res = await this.systemOrOrg('post', `/employees/${userId}/offboard`, {
            data: { reassignToUserId },
        })
        if (res.status() === 404) {
            const orgId = await this.resolveOrganizationId()
            res = await this.ctx.delete(apiUrl(`/v1/organizations/${orgId}/employees/${userId}`), {
                headers: this.headers(),
                data: { reassignToUserId },
            })
        }
        await this.assertOk(res, 'offboardEmployee')
        const text = await res.text()
        if (!text) return { ok: true }
        try {
            return JSON.parse(text) as Record<string, unknown>
        } catch {
            return { ok: true }
        }
    }

    async transferOwnership(newOwnerUserId: string): Promise<void> {
        const res = await this.systemOrOrg('post', '/transfer-ownership', {
            data: { newOwnerUserId },
        })
        await this.assertOk(res, 'transferOwnership')
    }

    async listDepartments(): Promise<Array<{ id: string; name: string; parentId?: string | null }>> {
        const res = await this.systemOrOrg('get', '/departments')
        await this.assertOk(res, 'listDepartments')
        const body = await res.json()
        return (Array.isArray(body) ? body : ((body as { list?: unknown[] }).list ?? [])) as Array<{
            id: string
            name: string
            parentId?: string | null
        }>
    }

    async createDepartment(data: {
        name: string
        parentId?: string
        leaderUserId?: string
    }): Promise<{ id: string; name: string }> {
        const res = await this.systemOrOrg('post', '/departments', { data })
        await this.assertOk(res, 'createDepartment')
        return (await res.json()) as { id: string; name: string }
    }

    async updateDepartment(
        deptId: string,
        data: { name?: string; parentId?: string | null; leaderUserId?: string | null },
    ): Promise<Record<string, unknown>> {
        const res = await this.ctx.patch(apiUrl(`/v1/departments/${deptId}`), {
            headers: this.headers(),
            data,
        })
        await this.assertOk(res, 'updateDepartment')
        return (await res.json()) as Record<string, unknown>
    }

    async deleteDepartment(deptId: string): Promise<void> {
        const res = await this.ctx.delete(apiUrl(`/v1/departments/${deptId}`), {
            headers: this.headers(),
        })
        if (!res.ok() && res.status() !== 409) {
            throw new Error(`deleteDepartment failed: ${res.status()} ${await res.text()}`)
        }
    }

    async listInvitations(): Promise<
        Array<{ id: string; email: string; status: string; inviteUrl?: string }>
    > {
        const res = await this.systemOrOrg('get', '/invitations')
        await this.assertOk(res, 'listInvitations')
        const body = await res.json()
        return (Array.isArray(body) ? body : ((body as { list?: unknown[] }).list ?? [])) as Array<{
            id: string
            email: string
            status: string
            inviteUrl?: string
        }>
    }

    async createInvitation(data: {
        email: string
        role?: string
        departmentId?: string
        projectGrants?: Array<{ projectId: string; role: string }>
    }): Promise<{ id: string; email: string; inviteUrl?: string }> {
        const res = await this.systemOrOrg('post', '/invitations', { data })
        await this.assertOk(res, 'createInvitation')
        const body = (await res.json()) as { id: string; email: string; inviteUrl?: string }
        if (!body.inviteUrl && body.id) {
            body.inviteUrl = `/auth/invite/${encodeURIComponent(body.id)}`
        }
        return body
    }

    async revokeInvitation(id: string): Promise<void> {
        const res = await this.systemOrOrg('delete', `/invitations/${id}`, { jsonContentType: false })
        await this.assertOk(res, 'revokeInvitation')
    }

    async resendInvitation(id: string): Promise<{ inviteUrl?: string }> {
        const res = await this.systemOrOrg('post', `/invitations/${id}/resend`, { data: {} })
        await this.assertOk(res, 'resendInvitation')
        const body = (await res.json()) as { inviteUrl?: string; id?: string }
        if (!body.inviteUrl && body.id) {
            body.inviteUrl = `/auth/invite/${encodeURIComponent(body.id)}`
        }
        return body
    }

    async getColleagues(): Promise<Array<Record<string, unknown>>> {
        const res = await this.systemOrOrg('get', '/colleagues')
        if (res.status() === 404) {
            const employees = await this.listEmployees()
            return employees
                .filter((e) => e.isActive !== false)
                .map((e) => ({
                    userId: e.userId,
                    name: e.name,
                    position: e.position ?? '',
                    departmentName: e.departmentName ?? '',
                    managerName: e.managerName ?? '',
                }))
        }
        await this.assertOk(res, 'getColleagues')
        const body = await res.json()
        return (Array.isArray(body) ? body : ((body as { list?: unknown[] }).list ?? [])) as Array<
            Record<string, unknown>
        >
    }

    async getOrgAudit(params: Record<string, string | number> = {}): Promise<{
        list: Array<Record<string, unknown>>
        nextCursor?: string
    }> {
        const res = await this.systemOrOrg('get', '/audit', { params })
        await this.assertOk(res, 'getOrgAudit')
        const body = (await res.json()) as
            | { list?: Array<Record<string, unknown>>; nextCursor?: string }
            | Array<Record<string, unknown>>
        if (Array.isArray(body)) {
            return { list: body, nextCursor: '' }
        }
        return { list: body.list ?? [], nextCursor: body.nextCursor }
    }

    async getMyAccess(): Promise<Record<string, unknown>> {
        const res = await this.ctx.get(apiUrl('/v1/profile/my-access'), { headers: this.headers() })
        await this.assertOk(res, 'getMyAccess')
        return (await res.json()) as Record<string, unknown>
    }

    async listAccessUnits(scopeId: string): Promise<Array<Record<string, unknown>>> {
        const resolvedScopeId = scopeId || (await this.resolveOrganizationId())
        const res = await this.ctx.get(apiUrl('/v1/access-units'), {
            headers: this.headers(),
            params: { scopeType: 'ORGANIZATION', scopeId: resolvedScopeId },
        })
        await this.assertOk(res, 'listAccessUnits')
        const body = await res.json()
        return (Array.isArray(body) ? body : ((body as { list?: unknown[] }).list ?? [])) as Array<
            Record<string, unknown>
        >
    }

    async createAccessUnit(data: {
        scopeType: 'ORGANIZATION'
        scopeId: string
        name: string
        kind: string
        parentId?: string
        leaderUserId?: string
    }): Promise<{ id: string; name: string }> {
        const payload = {
            ...data,
            scopeId: data.scopeId || (await this.resolveOrganizationId()),
        }
        const res = await this.ctx.post(apiUrl('/v1/access-units'), {
            headers: this.headers(),
            data: payload,
        })
        await this.assertOk(res, 'createAccessUnit')
        return (await res.json()) as { id: string; name: string }
    }

    async archiveAccessUnit(id: string): Promise<void> {
        const res = await this.ctx.delete(apiUrl(`/v1/access-units/${id}`), {
            headers: this.headers(),
        })
        await this.assertOk(res, 'archiveAccessUnit')
    }

    async addAccessUnitMember(
        unitId: string,
        data: { memberType: 'user' | 'group'; memberId: string },
    ): Promise<void> {
        const res = await this.ctx.post(apiUrl(`/v1/access-units/${unitId}/members`), {
            headers: this.headers(),
            data,
        })
        await this.assertOk(res, 'addAccessUnitMember')
    }

    async setAccessUnitParent(unitId: string, parentId: string | null): Promise<void> {
        const res = await this.ctx.patch(apiUrl(`/v1/access-units/${unitId}/parent`), {
            headers: this.headers(),
            data: { parentId },
        })
        await this.assertOk(res, 'setAccessUnitParent')
    }

    async listUnassigned(
        projectId: string,
        params: Record<string, string | number> = {},
    ): Promise<{ list: Array<Record<string, unknown>>; total?: number; nextCursor?: string }> {
        const res = await this.ctx.get(apiUrl(`/v1/projects/${projectId}/unassigned`), {
            headers: this.headers(projectId),
            params,
        })
        await this.assertOk(res, 'listUnassigned')
        const body = (await res.json()) as {
            list?: Array<Record<string, unknown>>
            total?: number
            nextCursor?: string
        }
        return { list: body.list ?? [], total: body.total, nextCursor: body.nextCursor }
    }

    async bulkReassignUnassigned(
        projectId: string,
        data: { newOwnerUserId: string; items: Array<{ entityType: string; entityId: string }> },
    ): Promise<Record<string, unknown>> {
        const res = await this.ctx.post(apiUrl(`/v1/projects/${projectId}/unassigned/bulk-reassign`), {
            headers: this.headers(projectId),
            data,
        })
        await this.assertOk(res, 'bulkReassignUnassigned')
        return (await res.json()) as Record<string, unknown>
    }

    /** Accept invitation without auth (public endpoint). */
    static async acceptInvitationPublic(
        token: string,
        data: { name?: string; password?: string } = {},
    ): Promise<Record<string, unknown>> {
        const ctx = await request.newContext({ ignoreHTTPSErrors: true })
        try {
            const res = await ctx.post(apiUrl('/v1/invitations/accept'), {
                data: { token, ...data },
            })
            if (!res.ok()) {
                throw new Error(`acceptInvitation failed: ${res.status()} ${await res.text()}`)
            }
            return (await res.json()) as Record<string, unknown>
        } finally {
            await ctx.dispose()
        }
    }

    async dispose(): Promise<void> {
        await this.ctx.dispose()
    }
}
