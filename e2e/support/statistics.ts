import type { Page } from '@playwright/test'
import { STORAGE_KEYS } from './env'

/** Federated host portfolio routes — no `/p/:pid` prefix (see host routes.config). */
export const FEDERATED = {
    dashboard: '/dashboard',
    statistics: '/statistics',
} as const

/** Default module set for statistics-area e2e fixtures. */
export const STATISTICS_MODULES = [
    'statistics',
    'deals',
    'contacts',
    'activities',
    'orders',
] as const

/** Strip project context from localStorage (ST-19). */
export async function clearProjectContext(page: Page): Promise<void> {
    await page.addInitScript(
        ({ idKey, projKey }) => {
            localStorage.removeItem(idKey)
            localStorage.removeItem(projKey)
        },
        {
            idKey: STORAGE_KEYS.projectId,
            projKey: STORAGE_KEYS.project,
        },
    )
}

/**
 * Intercept the PDP projection and drop selected permission keys from `allowed[]`.
 * Used for ST-10 / ST-11 negative cases without a second test user.
 */
export async function omitPermissions(
    page: Page,
    projectId: string,
    omitKeys: string[],
): Promise<void> {
    const pattern = `**/v1/projects/${projectId}/permissions`
    await page.route(pattern, async (route) => {
        const upstream = await route.fetch()
        const body = (await upstream.json()) as { allowed?: string[] }
        if (Array.isArray(body.allowed)) {
            body.allowed = body.allowed.filter((k) => !omitKeys.includes(k))
        }
        await route.fulfill({
            status: upstream.status(),
            headers: upstream.headers(),
            contentType: 'application/json',
            body: JSON.stringify(body),
        })
    })
}

/** Wait until the dashboard BFF responds for the project. Register before `goto`. */
export function waitForDashboard(page: Page, projectId: string) {
    return page.waitForResponse(
        (r) => r.url().includes('/v1/dashboard') && r.url().includes(projectId) && r.ok(),
        { timeout: 30_000 },
    )
}

/** Open federated dashboard; BFF listener is registered before navigation. */
export async function gotoDashboard(page: Page, projectId: string): Promise<void> {
    const dashPromise = waitForDashboard(page, projectId)
    await page.goto(FEDERATED.dashboard)
    await dashPromise
}

/** Wait until the statistics BFF responds for the project. */
export function waitForStatistics(page: Page, projectId: string) {
    return page.waitForResponse(
        (r) => r.url().includes('/v1/statistics') && r.url().includes(projectId) && r.ok(),
        { timeout: 30_000 },
    )
}

/** Assert no dashboard/statistics API call was made (fail-closed gating). */
export async function expectNoStatisticsApi(page: Page, action: () => Promise<void>) {
    let hit = false
    const handler = (req: { url: () => string }) => {
        const url = req.url()
        if (url.includes('/v1/dashboard') || url.includes('/v1/statistics')) hit = true
    }
    page.on('request', handler)
    try {
        await action()
    } finally {
        page.off('request', handler)
    }
    if (hit) throw new Error('unexpected statistics API call during gated navigation')
}
