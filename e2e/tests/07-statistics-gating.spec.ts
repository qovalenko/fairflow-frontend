import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    FEDERATED,
    STATISTICS_MODULES,
    clearProjectContext,
    omitPermissions,
} from '../support/statistics'

/**
 * Catalog #8–#11, #15–#16 — gating / предусловия.
 */
test.use({ forbiddenAllow: ['/v1/companies'] })

const modules = [...STATISTICS_MODULES]

test.describe('statistics gating', () => {
    test('#8 no statistics:read → ST-10, no API call', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-gate'), modules)
        await useProject(pid, modules)
        await omitPermissions(page, pid, ['statistics:read'])
        let dashboardHit = false
        page.on('request', (req) => {
            if (req.url().includes('/v1/dashboard')) dashboardHit = true
        })
        try {
            await page.goto(FEDERATED.dashboard)
            await expect(byQa(page, 'statistics.shared.noPermission')).toBeVisible({
                timeout: 30_000,
            })
            expect(dashboardHit).toBe(false)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#9 no project selected → ST-19', async ({ page }) => {
        await clearProjectContext(page)
        await page.goto(FEDERATED.dashboard)
        await expect(byQa(page, 'statistics.shared.noProject')).toBeVisible({
            timeout: 30_000,
        })
    })

    test('#10 statistics module disabled → fail-closed, no dashboard API', async ({
        page,
        api,
        useProject,
    }) => {
        const withoutStats = ['deals', 'contacts', 'activities']
        const pid = await api.createProject(uniqueName('stat-gate'), withoutStats)
        await useProject(pid, withoutStats)
        let dashboardHit = false
        page.on('request', (req) => {
            if (req.url().includes('/v1/dashboard')) dashboardHit = true
        })
        try {
            await page.goto(FEDERATED.dashboard)
            await expect(byQa(page, 'statistics.dashboard.screen')).toBeVisible({
                timeout: 30_000,
            })
            expect(dashboardHit).toBe(false)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#11 statistics:read without export → export disabled', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-gate'), modules)
        await useProject(pid, modules)
        await omitPermissions(page, pid, ['statistics:export'])
        try {
            await page.goto(FEDERATED.statistics)
            await expect(byQa(page, 'statistics.analytics.screen')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'statistics.analytics.export')).toBeDisabled()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#15 scope only_own hides team and departments tabs', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-scope'), modules)
        await useProject(pid, modules)
        await page.route('**/v1/statistics**', async (route) => {
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            body.scopeLevel = 'only_own'
            await route.fulfill({
                status: upstream.status(),
                headers: upstream.headers(),
                contentType: 'application/json',
                body: JSON.stringify(body),
            })
        })
        try {
            await page.goto(FEDERATED.statistics)
            await expect(byQa(page, 'statistics.analytics.screen')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'statistics.analytics.sliceTab', { slice: 'team' })).toHaveCount(
                0,
            )
            await expect(
                byQa(page, 'statistics.analytics.sliceTab', { slice: 'by_department' }),
            ).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#16 scope all shows stage_timing tab', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-scope'), modules)
        await useProject(pid, modules)
        await page.route('**/v1/statistics**', async (route) => {
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            body.scopeLevel = 'all'
            await route.fulfill({
                status: upstream.status(),
                headers: upstream.headers(),
                contentType: 'application/json',
                body: JSON.stringify(body),
            })
        })
        try {
            await page.goto(FEDERATED.statistics)
            await expect(byQa(page, 'statistics.analytics.screen')).toBeVisible({
                timeout: 30_000,
            })
            await expect(
                byQa(page, 'statistics.analytics.sliceTab', { slice: 'stage_timing' }),
            ).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })
})
