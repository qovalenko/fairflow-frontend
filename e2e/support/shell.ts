import type { Page } from '@playwright/test'
import { API_BASE_URL, STORAGE_KEYS } from './env'
import type { ApiClient } from '../fixtures/api'

export const FALLBACK_SYSTEM_ID = 'e2e-shell-system'

/** Drop JWT + persisted session (expired-session / re-auth scenarios). */
export async function clearSession(page: Page): Promise<void> {
    await page.evaluate(
        ({ tokenKey, sessionKey }) => {
            localStorage.removeItem(tokenKey)
            localStorage.removeItem(sessionKey)
        },
        { tokenKey: STORAGE_KEYS.token, sessionKey: STORAGE_KEYS.sessionUser },
    )
}

/** Simulate ManifestBootstrapGate failure (catalog #3). */
export async function blockFeManifest(page: Page): Promise<void> {
    await page.route('**/fe-manifest.json', (route) =>
        route.fulfill({ status: 500, contentType: 'text/plain', body: 'manifest unavailable' }),
    )
}

const DEFAULT_PUBLIC_CONFIG = {
    deploymentMode: 'box',
    needsBootstrap: false,
    appName: 'Fairflow',
    features: {},
}

/** Override GET /api/public-config (PublicConfigGate bootstrap routing). */
export async function mockPublicConfig(
    page: Page,
    patch: Partial<{ needsBootstrap: boolean; appName: string }>,
): Promise<void> {
    const body = { ...DEFAULT_PUBLIC_CONFIG, ...patch }
    await page.route('**/api/public-config', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(body),
        }),
    )
}

/** Stub POST /api/bootstrap for negative bootstrap flows (#18, #19). */
export async function mockBootstrapPost(
    page: Page,
    response: { status: number; body: Record<string, unknown> },
): Promise<void> {
    await page.route('**/api/bootstrap', (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        return route.fulfill({
            status: response.status,
            contentType: 'application/json',
            body: JSON.stringify(response.body),
        })
    })
}

/** Unknown project id for NotFound / guard probes (valid UUID shape, not in user.projects). */
export const UNKNOWN_PROJECT_ID = '00000000-0000-4000-8000-000000000001'

type SessionPatch = {
    projects?: unknown[]
    system?: { id: string; name: string; role?: string } | null
    systemRole?: string
    lastActiveProjectId?: string | null
}

/** Patch the persisted sessionUser envelope before navigation. */
export async function patchSessionUser(page: Page, patch: SessionPatch): Promise<void> {
    await page.addInitScript(
        ({ sessionKey, patchJson }) => {
            const patch = JSON.parse(patchJson) as SessionPatch
            const raw = localStorage.getItem(sessionKey)
            const token = localStorage.getItem('token')
            if (!raw) {
                if (!token) return
                localStorage.setItem(
                    sessionKey,
                    JSON.stringify({
                        state: { user: {}, session: { signedIn: true } },
                        version: 0,
                    }),
                )
            }
            const current = localStorage.getItem(sessionKey)
            if (!current) return
            try {
                const envelope = JSON.parse(current) as {
                    state?: {
                        user?: Record<string, unknown>
                        session?: { signedIn?: boolean }
                    }
                }
                const user = envelope.state?.user ?? {}
                if (patch.projects !== undefined) user.projects = patch.projects
                if (patch.system !== undefined) user.system = patch.system
                if (patch.systemRole !== undefined) user.systemRole = patch.systemRole
                if (patch.lastActiveProjectId !== undefined) {
                    user.lastActiveProjectId = patch.lastActiveProjectId
                }
                envelope.state = envelope.state ?? {}
                envelope.state.session = envelope.state.session ?? { signedIn: true }
                envelope.state.user = user
                localStorage.setItem(sessionKey, JSON.stringify(envelope))
            } catch {
                /* best-effort seed */
            }
        },
        { sessionKey: STORAGE_KEYS.sessionUser, patchJson: JSON.stringify(patch) },
    )
}

export async function seedOwnerWithoutProjects(
    page: Page,
    systemId: string,
    systemName = 'E2E Test Org',
): Promise<void> {
    await patchSessionUser(page, {
        projects: [],
        system: { id: systemId, name: systemName, role: 'platform_owner' },
        systemRole: 'platform_owner',
    })
}

export async function seedEmployeeWithoutProjects(
    page: Page,
    systemId: string,
    systemName = 'E2E Test Org',
): Promise<void> {
    await patchSessionUser(page, {
        projects: [],
        system: { id: systemId, name: systemName, role: 'employee' },
        systemRole: 'employee',
    })
}

/** Stub GET /v1/projects so live refresh returns an empty membership list. */
export async function stubEmptyProjectsList(page: Page): Promise<void> {
    await page.route(/\/v1\/projects\/?(\?|$)/, async (route) => {
        if (route.request().method() !== 'GET') {
            await route.continue()
            return
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '[]',
        })
    })
}

/** Resolve the live system id from gateway (falls back to a deterministic stub). */
export async function resolveSystemId(api: ApiClient): Promise<string> {
    const system = await api.getSystem()
    if (system?.id) return system.id
    const me = await api.getMe()
    const fromMe = (me as { system?: { id?: string } } | null)?.system?.id
    if (fromMe) return fromMe
    return FALLBACK_SYSTEM_ID
}

/** Revoke the JWT session bound to the browser page (catalog #173). */
export async function revokeCurrentPageSession(page: Page): Promise<void> {
    const token = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.token)
    if (!token) {
        throw new Error('revokeCurrentPageSession: no JWT in page localStorage')
    }
    const headers = { Authorization: `Bearer ${token}` }
    const sessionsRes = await page.request.get(`${API_BASE_URL}/v1/auth/me/sessions`, { headers })
    if (!sessionsRes.ok()) {
        throw new Error(
            `list sessions failed: ${sessionsRes.status()} ${await sessionsRes.text()}`,
        )
    }
    const body = (await sessionsRes.json()) as {
        sessions?: Array<{ id: string; isCurrent?: boolean }>
    }
    const current = body.sessions?.find((s) => s.isCurrent)
    if (!current?.id) {
        throw new Error('revokeCurrentPageSession: current session id not found')
    }
    const del = await page.request.delete(`${API_BASE_URL}/v1/auth/me/sessions/${current.id}`, {
        headers,
    })
    if (!del.ok()) {
        throw new Error(`revoke session failed: ${del.status()} ${await del.text()}`)
    }
}
