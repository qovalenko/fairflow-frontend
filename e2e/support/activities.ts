import { expect, type Page } from '@playwright/test'
import type { ApiClient } from '../fixtures/api'
import { byQa } from './qa'
import { STORAGE_KEYS, uniqueName } from './env'

/** Modules enabled on seeded projects for activities e2e. */
export const ACTIVITIES_MODULES = ['deals', 'contacts', 'activities', 'statistics'] as const

/** Expected 403 on portfolio pages that over-fetch disabled modules. */
export const ACTIVITIES_FORBIDDEN_ALLOW = [
    '/v1/companies',
    '/v1/orders',
    '/v1/products',
    '/v1/documents',
    '/v1/automation',
]

export async function seedActivitiesProject(
    api: ApiClient,
    useProject: (projectId: string, enabledModules?: string[]) => Promise<void>,
    modules: string[] = [...ACTIVITIES_MODULES],
): Promise<string> {
    const pid = await api.createProject(uniqueName('activities'), modules)
    await useProject(pid, modules)
    return pid
}

export async function expectActivitiesList(page: Page): Promise<void> {
    await expect(byQa(page, 'activities.list.search')).toBeVisible({ timeout: 30_000 })
}

export async function gotoActivitiesList(page: Page): Promise<void> {
    await page.goto('/activities')
    await expectActivitiesList(page)
}

export async function openActivitiesFromSidebar(page: Page): Promise<void> {
    await byQa(page, 'host.sidebar.item', { nav: ACTIVITIES_NAV_KEY }).click()
    await expectActivitiesList(page)
}

export function startOfDayMs(offsetDays = 0): number {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
}

export function endOfDayMs(offsetDays = 0): number {
    const d = new Date()
    d.setDate(d.getDate() + offsetDays)
    d.setHours(23, 59, 59, 999)
    return d.getTime()
}

export function daysAgoMs(days: number): number {
    return Date.now() - days * 86_400_000
}

/** Pick activity type on the full edit form (create mode). */
export async function pickActivityType(page: Page, typeIndex: number): Promise<void> {
    await byQa(page, 'activities.edit.type').click()
    for (let i = 0; i < typeIndex; i++) {
        await page.keyboard.press('ArrowDown')
    }
    await page.keyboard.press('Enter')
}

export async function acceptNextDialog(page: Page): Promise<void> {
    page.once('dialog', (dialog) => dialog.accept())
}

/** Sidebar nav key for the activities module (manifest `portfolio.activities`). */
export const ACTIVITIES_NAV_KEY = 'portfolio.activities'

const permissionsPattern = (projectId: string) => `**/v1/projects/${projectId}/permissions`

/** Deny all activities:* PDP keys while keeping other permissions. */
export async function denyActivitiesRead(page: Page, projectId: string): Promise<void> {
    await page.route(permissionsPattern(projectId), async (route) => {
        const upstream = await route.fetch()
        const body = upstream.ok()
            ? ((await upstream.json()) as { allowed?: string[] })
            : { allowed: [] as string[] }
        const allowed = (body.allowed ?? []).filter(
            (key) => !key.startsWith('activities:') && !key.startsWith('activities.'),
        )
        await route.fulfill({
            status: upstream.ok() ? upstream.status() : 200,
            headers: upstream.headers(),
            contentType: 'application/json',
            body: JSON.stringify({ ...body, allowed }),
        })
    })
}

/** Grant activities:read only (no write/manage) for read-only edit/trash scenarios. */
export async function grantActivitiesReadWithoutWrite(
    page: Page,
    projectId: string,
): Promise<void> {
    await page.route(permissionsPattern(projectId), async (route) => {
        const upstream = await route.fetch()
        const body = upstream.ok()
            ? ((await upstream.json()) as { allowed?: string[] })
            : { allowed: [] as string[] }
        const base = new Set(body.allowed ?? [])
        for (const key of [...base]) {
            if (key.startsWith('activities:') || key.startsWith('activities.')) base.delete(key)
        }
        base.add('activities:read')
        await route.fulfill({
            status: upstream.ok() ? upstream.status() : 200,
            headers: upstream.headers(),
            contentType: 'application/json',
            body: JSON.stringify({ ...body, allowed: [...base] }),
        })
    })
}

/**
 * Clear the selected project in the live zustand store (CreateDropdown guard, catalog #121).
 * Requires the host vite dev server so `/src/store/projectStore.ts` resolves in-page.
 */
export async function resetProjectSelection(page: Page): Promise<void> {
    await page.evaluate(
        async ({ idKey, projKey }) => {
            localStorage.removeItem(idKey)
            localStorage.removeItem(projKey)
            // @ts-expect-error browser-only import resolved by host vite dev during hybrid runs
            const store = await import('/src/store/projectStore.ts')
            store.useProjectStore.getState().setCurrentProject(null)
        },
        { idKey: STORAGE_KEYS.projectId, projKey: STORAGE_KEYS.project },
    )
}

/** Delay GET /v1/activities/:id so the details loading state is observable (catalog #62). */
export async function delayActivityGetById(
    page: Page,
    activityId: string,
    delayMs: number,
): Promise<void> {
    const pattern = new RegExp(`/v1/activities/${activityId}(\\?|$)`)
    await page.route(pattern, async (route) => {
        if (route.request().method() !== 'GET') {
            await route.continue()
            return
        }
        const upstream = await route.fetch()
        await new Promise((r) => setTimeout(r, delayMs))
        await route.fulfill({
            status: upstream.status(),
            headers: upstream.headers(),
            body: await upstream.body(),
        })
    })
}

/** Inject user.defaultActivitiesView into the persisted session (catalog #36). */
export async function setDefaultActivitiesView(
    page: Page,
    view: 'list' | 'calendar',
): Promise<void> {
    await page.addInitScript(
        ({ sessionKey, view }) => {
            const raw = localStorage.getItem(sessionKey)
            if (!raw) return
            try {
                const envelope = JSON.parse(raw) as {
                    state?: { user?: { defaultActivitiesView?: string } }
                }
                envelope.state = envelope.state ?? {}
                envelope.state.user = envelope.state.user ?? {}
                envelope.state.user.defaultActivitiesView = view
                localStorage.setItem(sessionKey, JSON.stringify(envelope))
            } catch {
                /* session shape unexpected — test will fail on assertion */
            }
        },
        { sessionKey: STORAGE_KEYS.sessionUser, view },
    )
}

/** Drop selected permission keys from PDP projection (generalized ST-10/11 helper). */
export async function omitActivitiesPermissions(
    page: Page,
    projectId: string,
    omitKeys: string[],
): Promise<void> {
    await page.route(permissionsPattern(projectId), async (route) => {
        const upstream = await route.fetch()
        const body = upstream.ok()
            ? ((await upstream.json()) as { allowed?: string[] })
            : { allowed: [] as string[] }
        const allowed = (body.allowed ?? []).filter((k) => !omitKeys.includes(k))
        await route.fulfill({
            status: upstream.ok() ? upstream.status() : 200,
            headers: upstream.headers(),
            contentType: 'application/json',
            body: JSON.stringify({ ...body, allowed }),
        })
    })
}

/** Read + write without delete (bulk delete disabled, catalog #18). */
export async function grantActivitiesReadWriteWithoutDelete(
    page: Page,
    projectId: string,
): Promise<void> {
    await omitActivitiesPermissions(page, projectId, ['activities:delete'])
}

/** Mock GET /v1/activities list failure (catalog #15). */
export async function mockActivitiesListError(page: Page, status = 500): Promise<void> {
    await page.route('**/v1/activities?**', async (route) => {
        if (route.request().method() !== 'GET') {
            await route.continue()
            return
        }
        const url = route.request().url()
        if (/\/v1\/activities\/[^/?]+/.test(url)) {
            await route.continue()
            return
        }
        await route.fulfill({ status, contentType: 'application/json', body: '{}' })
    })
}

/** Mock GET /v1/activities/calendar failure (catalog #48). */
export async function mockActivitiesCalendarError(page: Page, status = 500): Promise<void> {
    await page.route('**/v1/activities/calendar**', async (route) => {
        if (route.request().method() !== 'GET') {
            await route.continue()
            return
        }
        await route.fulfill({ status, contentType: 'application/json', body: '{}' })
    })
}

/** Mock GET /v1/activities/:id failure (catalog #63, #89). */
export async function mockActivityGetByIdError(
    page: Page,
    activityId: string,
    status = 500,
): Promise<void> {
    const pattern = new RegExp(`/v1/activities/${activityId}(\\?|$)`)
    await page.route(pattern, async (route) => {
        if (route.request().method() !== 'GET') {
            await route.continue()
            return
        }
        await route.fulfill({ status, contentType: 'application/json', body: '{}' })
    })
}

/** Mock PATCH /v1/activities/:id failure (catalog #69). */
export async function mockActivityPatchError(
    page: Page,
    activityId: string,
    status = 409,
): Promise<void> {
    const pattern = new RegExp(`/v1/activities/${activityId}(\\?|$)`)
    await page.route(pattern, async (route) => {
        if (route.request().method() !== 'PATCH') {
            await route.continue()
            return
        }
        await route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify({ error: { message: 'conflict' } }),
        })
    })
}

/** Mock DELETE /v1/activities/:id failure (catalog #70). */
export async function mockActivityDeleteError(
    page: Page,
    activityId: string,
    status = 500,
): Promise<void> {
    const pattern = new RegExp(`/v1/activities/${activityId}(\\?|$)`)
    await page.route(pattern, async (route) => {
        if (route.request().method() !== 'DELETE') {
            await route.continue()
            return
        }
        await route.fulfill({ status, contentType: 'application/json', body: '{}' })
    })
}

/** Mock POST /v1/activities/bulk failure (catalog #30). */
export async function mockActivityBulkError(page: Page, status = 500): Promise<void> {
    await page.route('**/v1/activities/bulk**', async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue()
            return
        }
        await route.fulfill({ status, contentType: 'application/json', body: '{}' })
    })
}

/** Mock POST /v1/activities/:id/restore failure (catalog #106). */
export async function mockActivityRestoreError(
    page: Page,
    activityId: string,
    status = 500,
): Promise<void> {
    const pattern = new RegExp(`/v1/activities/${activityId}/restore`)
    await page.route(pattern, async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue()
            return
        }
        await route.fulfill({ status, contentType: 'application/json', body: '{}' })
    })
}

/** Mock POST /v1/activities create failure (catalog #92, #118). */
export async function mockActivityCreateError(page: Page, status = 500): Promise<void> {
    await page.route('**/v1/activities**', async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue()
            return
        }
        const url = route.request().url()
        if (url.includes('/bulk') || url.includes('/complete') || url.includes('/restore')) {
            await route.continue()
            return
        }
        await route.fulfill({ status, contentType: 'application/json', body: '{}' })
    })
}

/** Mock trash list GET failure (catalog #103). */
export async function mockActivitiesTrashListError(page: Page, status = 500): Promise<void> {
    await page.route('**/v1/activities**', async (route) => {
        if (route.request().method() !== 'GET') {
            await route.continue()
            return
        }
        const url = route.request().url()
        if (!url.includes('state=trashed')) {
            await route.continue()
            return
        }
        await route.fulfill({ status, contentType: 'application/json', body: '{}' })
    })
}

/** Slow PATCH so busy state is observable (catalog #75). */
export async function delayActivityPatch(
    page: Page,
    activityId: string,
    delayMs: number,
): Promise<void> {
    const pattern = new RegExp(`/v1/activities/${activityId}(\\?|$)`)
    await page.route(pattern, async (route) => {
        if (route.request().method() !== 'PATCH') {
            await route.continue()
            return
        }
        const upstream = await route.fetch()
        await new Promise((r) => setTimeout(r, delayMs))
        await route.fulfill({
            status: upstream.status(),
            headers: upstream.headers(),
            body: await upstream.body(),
        })
    })
}

export async function gotoActivitiesCalendar(page: Page): Promise<void> {
    await page.goto('/activities/calendar')
    await expect(byQa(page, 'activities.calendar.grid')).toBeVisible({ timeout: 30_000 })
}
