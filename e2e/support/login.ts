import { expect, type Page } from '@playwright/test'
import { byQa } from './qa'
import { ADMIN_EMAIL, ADMIN_PASSWORD, STORAGE_KEYS } from './env'
import { ApiClient } from '../fixtures/api'

/** Navigate after storageState replay (zustand rehydrate race on first paint). */
export async function gotoAuthenticated(page: Page, path: string): Promise<void> {
    await page.goto(path)
    if (page.url().includes('/auth/signin')) {
        await page.reload()
    }
    await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 30_000 })
}

/** Merge /me + /v1/system into the zustand session user (box single-tenant). */
async function buildSessionUserJson(client: ApiClient): Promise<string | null> {
    const me = await client.getMe()
    if (!me) return null

    const user: Record<string, unknown> = { ...me }
    try {
        const system = await client.getSystem()
        const id = system?.id ?? system?.systemId
        if (id) {
            const role = String(system.role ?? 'platform_admin')
            user.system = {
                id: String(id),
                name: String(system.name ?? ''),
                role,
            }
            user.systemRole = role
        }
    } catch {
        /* legacy stand: system resolves lazily in the shell */
    }
    return JSON.stringify(user)
}

/**
 * Seed browser session from localStorage only (no REST login).
 * Use when login API is rate-limited but UI auth gate must see a session.
 */
export async function seedLocalSession(
    page: Page,
    user: {
        userId?: string
        email?: string
        name?: string
        system?: { id: string; name: string; role: string }
    },
    token = 'e2e-mock-session-token',
): Promise<void> {
    const userObj: Record<string, unknown> = {
        userId: user.userId ?? 'e2e-mock-user',
        email: user.email ?? 'mock@e2e.local',
        name: user.name ?? user.email ?? 'Mock User',
    }
    if (user.system) {
        userObj.system = user.system
        userObj.systemRole = user.system.role
    }
    const userJson = JSON.stringify(userObj)
    await page.addInitScript(
        ({ tokenKey, sessionKey, token, userJson }) => {
            localStorage.setItem(tokenKey, token)
            localStorage.setItem(
                sessionKey,
                JSON.stringify({
                    state: {
                        session: { signedIn: true },
                        user: JSON.parse(userJson),
                    },
                    version: 0,
                }),
            )
        },
        {
            tokenKey: STORAGE_KEYS.token,
            sessionKey: STORAGE_KEYS.sessionUser,
            token,
            userJson,
        },
    )
}

/** Mock GET /v1/auth/me so a localStorage-only session is not revoked by the shell. */
export async function mockAuthMe(
    page: Page,
    user: { userId?: string; email?: string; name?: string },
): Promise<void> {
    await page.route('**/v1/auth/me', (route) => {
        if (route.request().method() !== 'GET') return route.continue()
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                user: {
                    userId: user.userId ?? 'e2e-mock-user',
                    email: user.email ?? 'mock@e2e.local',
                    name: user.name ?? user.email ?? 'Mock User',
                },
            }),
        })
    })
}

/**
 * Seed authenticated session via REST login (same creds/retries as fixtures/api.ts).
 * Used when the host shell cannot render sign-in (e.g. fe-manifest unavailable).
 */
export async function signInViaApi(page: Page, email?: string, password?: string): Promise<void> {
    const client =
        email && password
            ? await ApiClient.loginWith(email, password)
            : await ApiClient.authenticated()
    try {
        const userJson = await buildSessionUserJson(client)
        await page.addInitScript(
            ({ tokenKey, sessionKey, token, userJson }) => {
                localStorage.setItem(tokenKey, token)
                if (userJson) {
                    localStorage.setItem(
                        sessionKey,
                        JSON.stringify({
                            state: {
                                session: { signedIn: true },
                                user: JSON.parse(userJson),
                            },
                            version: 0,
                        }),
                    )
                }
            },
            {
                tokenKey: STORAGE_KEYS.token,
                sessionKey: STORAGE_KEYS.sessionUser,
                token: client.token,
                userJson,
            },
        )
        await gotoAuthenticated(page, '/')
        await expect
            .poll(async () => page.evaluate(() => localStorage.getItem('token')), {
                timeout: 30_000,
            })
            .not.toBeNull()
    } finally {
        await client.dispose()
    }
}

/**
 * Sign in as admin through the real host UI (host.login.* qa-ids).
 *
 * The stand's gateway intermittently answers `/v1/auth/login` with a `401` for
 * valid credentials (documented flake, mirrored in fixtures/api.ts's login retry):
 * the SPA surfaces the error and stays on `/auth/signin`. The API seed client
 * already retries this; the UI path had no such guard, so a transient 401 on the
 * `setup` project would fail the whole run. Re-submit a few times with a short
 * backoff to absorb it — this is stand flakiness, not the flow under test.
 */
export async function signInViaUi(page: Page, attempts = 4): Promise<void> {
    await page.goto('/auth/signin')
    await expect(byQa(page, 'host.login.email')).toBeVisible({ timeout: 30_000 })

    let lastError: unknown
    for (let i = 0; i < attempts; i++) {
        await byQa(page, 'host.login.email').fill(ADMIN_EMAIL)
        await byQa(page, 'host.login.password').fill(ADMIN_PASSWORD)
        await byQa(page, 'host.login.submit').click()
        try {
            // Success = we leave the sign-in screen (token stored, app shell).
            await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 15_000 })
            return
        } catch (error) {
            // Still on /auth/signin -> transient 401; back off and re-submit.
            lastError = error
            await page.waitForTimeout(1000 * (i + 1))
        }
    }
    throw lastError
}
