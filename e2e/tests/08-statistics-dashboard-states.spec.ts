import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { FEDERATED, STATISTICS_MODULES, gotoDashboard } from '../support/statistics'

/**
 * Catalog #19, #24, #33, #39, #46, #49, #57, #58 — состояния дашборда (P0/P1).
 */
test.use({ forbiddenAllow: ['/v1/companies'] })

const modules = [...STATISTICS_MODULES]

test.describe('statistics dashboard states', () => {
    test('#19 ST-3 empty project → per-widget empty states', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-empty'), modules)
        await useProject(pid, modules)
        try {
            await gotoDashboard(page, pid)
            await expect(byQa(page, 'statistics.dashboard.funnel')).toBeVisible({
                timeout: 30_000,
            })
            await expect(
                byQa(page, 'statistics.shared.widgetEmpty', { state: 'funnel-empty' }),
            ).toBeVisible()
            await expect(
                byQa(page, 'statistics.shared.widgetEmpty', { state: 'overdue-empty' }),
            ).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#24 fully empty API arrays → per-widget empty, no crash', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-empty'), modules)
        await useProject(pid, modules)
        await page.route('**/v1/dashboard**', async (route) => {
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            Object.assign(body, {
                statistics: [],
                dealsByStage: [],
                dealsBySource: [],
                overdueActivities: [],
                upcomingActivities: [],
                stalledDeals: [],
            })
            await route.fulfill({
                status: upstream.status(),
                headers: upstream.headers(),
                contentType: 'application/json',
                body: JSON.stringify(body),
            })
        })
        try {
            await gotoDashboard(page, pid)
            await expect(byQa(page, 'statistics.dashboard.funnel')).toBeVisible({
                timeout: 30_000,
            })
            await expect(
                byQa(page, 'statistics.shared.widgetEmpty', { state: 'funnel-empty' }),
            ).toBeVisible()
            await expect(
                byQa(page, 'statistics.shared.widgetEmpty', { state: 'sources-empty' }),
            ).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#33 refresh keeps data visible and refetches', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-refresh'), modules)
        await useProject(pid, modules)
        try {
            await gotoDashboard(page, pid)
            await expect(byQa(page, 'statistics.dashboard.screen')).toBeVisible({
                timeout: 30_000,
            })
            const refreshPromise = page.waitForResponse(
                (r) => r.url().includes('/v1/dashboard') && r.request().method() === 'GET',
            )
            await byQa(page, 'statistics.header.refresh').click()
            await refreshPromise
            await expect(byQa(page, 'statistics.dashboard.screen')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#39 no deals/orders → KPI empty card', async ({ page, api, useProject }) => {
        const statsOnly = ['statistics']
        const pid = await api.createProject(uniqueName('stat-kpi'), statsOnly)
        await useProject(pid, statsOnly)
        try {
            await page.goto(FEDERATED.dashboard)
            await expect(byQa(page, 'statistics.dashboard.kpiEmpty')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#46 empty funnel → WidgetEmpty inside funnel card', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-funnel'), ['statistics', 'deals'])
        await useProject(pid, ['statistics', 'deals'])
        try {
            await gotoDashboard(page, pid)
            await expect(byQa(page, 'statistics.dashboard.funnel')).toBeVisible({
                timeout: 30_000,
            })
            await expect(
                byQa(page, 'statistics.shared.widgetEmpty', { state: 'funnel-empty' }),
            ).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#49 empty sources → honest empty state', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-sources'), ['statistics', 'deals'])
        await useProject(pid, ['statistics', 'deals'])
        try {
            await gotoDashboard(page, pid)
            await expect(byQa(page, 'statistics.dashboard.sources')).toBeVisible({
                timeout: 30_000,
            })
            await expect(
                byQa(page, 'statistics.shared.widgetEmpty', { state: 'sources-empty' }),
            ).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#57 stalled widget has no working show-all footer link', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-stalled'), ['statistics', 'deals'])
        await useProject(pid, ['statistics', 'deals'])
        let dealId = ''
        try {
            dealId = await api.createDeal(pid, { name: uniqueName('stalled') })
            await page.route('**/v1/dashboard**', async (route) => {
                const upstream = await route.fetch()
                const body = (await upstream.json()) as Record<string, unknown>
                body.stalledDeals = [
                    { id: dealId, name: 'stalled-deal', amount: 100000, daysOnStage: 30 },
                ]
                await route.fulfill({
                    status: upstream.status(),
                    headers: upstream.headers(),
                    contentType: 'application/json',
                    body: JSON.stringify(body),
                })
            })
            await gotoDashboard(page, pid)
            await expect(byQa(page, 'statistics.dashboard.stalledList')).toBeVisible({
                timeout: 30_000,
            })
            await expect(
                byQa(page, 'statistics.shared.listFooter', { kind: 'stalled' }),
            ).toHaveCount(0)
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId)
            await api.archiveProject(pid)
        }
    })

    test('#58 empty activity lists → per-widget WidgetEmpty, section not hidden', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-lists'), [
            'statistics',
            'deals',
            'activities',
        ])
        await useProject(pid, ['statistics', 'deals', 'activities'])
        let dealId = ''
        try {
            dealId = await api.createDeal(pid, { name: uniqueName('deal') })
            await gotoDashboard(page, pid)
            await expect(
                byQa(page, 'statistics.dashboard.activityList', { kind: 'overdue' }),
            ).toBeVisible({ timeout: 30_000 })
            await expect(
                byQa(page, 'statistics.dashboard.activityList', { kind: 'upcoming' }),
            ).toBeVisible()
            await expect(
                byQa(page, 'statistics.shared.widgetEmpty', { state: 'overdue-empty' }),
            ).toBeVisible()
            await expect(
                byQa(page, 'statistics.shared.widgetEmpty', { state: 'upcoming-empty' }),
            ).toBeVisible()
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId)
            await api.archiveProject(pid)
        }
    })
})
