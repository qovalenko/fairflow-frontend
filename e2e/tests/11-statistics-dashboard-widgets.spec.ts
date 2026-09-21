import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { STATISTICS_MODULES, gotoDashboard } from '../support/statistics'

/**
 * Catalog P0 widget/drill scenarios (#17, #37, #40, #44, #50, #51, #52, #54, #55, #56, #61).
 */
test.use({ forbiddenAllow: ['/v1/companies'] })

const modules = [...STATISTICS_MODULES]

test.describe('statistics dashboard widgets', () => {
    test('#17 happy path dashboard loads KPI and widget regions', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-dash'), modules)
        await useProject(pid, modules)
        const dealName = uniqueName('deal')
        let dealId = ''
        let activityId = ''
        try {
            dealId = await api.createDeal(pid, { name: dealName })
            activityId = await api.createActivity(pid, {
                title: uniqueName('overdue'),
                dueDate: '2020-01-01T12:00:00.000Z',
            })
            await gotoDashboard(page, pid)
            await expect(byQa(page, 'statistics.dashboard.screen')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'statistics.dashboard.kpiRow')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'statistics.dashboard.funnel')).toBeVisible()
            await expect(byQa(page, 'statistics.dashboard.sources')).toBeVisible()
            await expect(
                byQa(page, 'statistics.dashboard.activityList', { kind: 'overdue' }),
            ).toBeVisible()
        } finally {
            if (activityId) await api.deleteActivity(pid, activityId)
            if (dealId) await api.deleteDeal(pid, dealId)
            await api.archiveProject(pid)
        }
    })

    test('#37 KPI row visible when deals module enabled', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-kpi'), ['statistics', 'deals'])
        await useProject(pid, ['statistics', 'deals'])
        let dealId = ''
        try {
            dealId = await api.createDeal(pid, { name: uniqueName('deal') })
            await gotoDashboard(page, pid)
            await expect(byQa(page, 'statistics.dashboard.kpiRow')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId)
            await api.archiveProject(pid)
        }
    })

    test('#40 KPI deals cell drill navigates to /deals', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-drill'), ['statistics', 'deals'])
        await useProject(pid, ['statistics', 'deals'])
        let dealId = ''
        try {
            dealId = await api.createDeal(pid, { name: uniqueName('deal') })
            await gotoDashboard(page, pid)
            const kpi = byQa(page, 'statistics.dashboard.kpiCell').first()
            await expect(kpi).toBeVisible({ timeout: 30_000 })
            await kpi.click()
            await expect(page).toHaveURL(/\/deals(?:\?|$|\/)/)
            await expect(page.url()).not.toMatch(/\/p\/[^/]+\/deals/)
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId)
            await api.archiveProject(pid)
        }
    })

    test('#44 funnel widget mounts when deals enabled', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-funnel'), ['statistics', 'deals'])
        await useProject(pid, ['statistics', 'deals'])
        let dealId = ''
        try {
            dealId = await api.createDeal(pid, { name: uniqueName('deal') })
            await gotoDashboard(page, pid)
            await expect(byQa(page, 'statistics.dashboard.funnel')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId)
            await api.archiveProject(pid)
        }
    })

    test('#50 overdue list widget when activities seeded', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-overdue'), [
            'statistics',
            'deals',
            'activities',
        ])
        await useProject(pid, ['statistics', 'deals', 'activities'])
        let activityId = ''
        try {
            activityId = await api.createActivity(pid, {
                title: uniqueName('overdue'),
                dueDate: '2020-01-01T12:00:00.000Z',
            })
            await gotoDashboard(page, pid)
            await expect(
                byQa(page, 'statistics.dashboard.activityList', { kind: 'overdue' }),
            ).toBeVisible({ timeout: 30_000 })
        } finally {
            if (activityId) await api.deleteActivity(pid, activityId)
            await api.archiveProject(pid)
        }
    })

    test('#51 overdue row drill navigates to activity card', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-overdue'), [
            'statistics',
            'deals',
            'activities',
        ])
        await useProject(pid, ['statistics', 'deals', 'activities'])
        let activityId = ''
        try {
            activityId = await api.createActivity(pid, {
                title: uniqueName('overdue'),
                dueDate: '2020-01-01T12:00:00.000Z',
            })
            await page.route('**/v1/dashboard**', async (route) => {
                const upstream = await route.fetch()
                const body = (await upstream.json()) as Record<string, unknown>
                body.overdueActivities = [
                    {
                        id: activityId,
                        type: 'task',
                        title: 'overdue-row',
                        status: 'planned',
                        priority: 'medium',
                        dueDate: Date.parse('2020-01-01T12:00:00.000Z'),
                    },
                ]
                await route.fulfill({
                    status: upstream.status(),
                    headers: upstream.headers(),
                    contentType: 'application/json',
                    body: JSON.stringify(body),
                })
            })
            await gotoDashboard(page, pid)
            const row = byQa(page, 'statistics.dashboard.activityRow', {
                activity: activityId,
                kind: 'overdue',
            })
            await expect(row).toBeVisible({ timeout: 30_000 })
            await row.click()
            await expect(page).toHaveURL(new RegExp(`/activities/${activityId}`))
            await expect(page.url()).not.toMatch(/\/p\/[^/]+\/activities/)
        } finally {
            if (activityId) await api.deleteActivity(pid, activityId)
            await api.archiveProject(pid)
        }
    })

    test('#52 overdue show-all navigates to ?overdue=1', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-overdue'), [
            'statistics',
            'deals',
            'activities',
        ])
        await useProject(pid, ['statistics', 'deals', 'activities'])
        let activityId = ''
        try {
            activityId = await api.createActivity(pid, {
                title: uniqueName('overdue'),
                dueDate: '2020-01-01T12:00:00.000Z',
            })
            await gotoDashboard(page, pid)
            const footer = byQa(page, 'statistics.shared.listFooter', { kind: 'overdue' })
            await expect(footer).toBeVisible({ timeout: 30_000 })
            await footer.click()
            await expect(page).toHaveURL(/\/activities\?overdue=1/)
        } finally {
            if (activityId) await api.deleteActivity(pid, activityId)
            await api.archiveProject(pid)
        }
    })

    test('#54 upcoming list and show-all ?upcoming=1', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-upcoming'), [
            'statistics',
            'deals',
            'activities',
        ])
        await useProject(pid, ['statistics', 'deals', 'activities'])
        let activityId = ''
        try {
            const tomorrow = new Date(Date.now() + 86_400_000).toISOString()
            activityId = await api.createActivity(pid, {
                title: uniqueName('upcoming'),
                dueDate: tomorrow,
            })
            await gotoDashboard(page, pid)
            await expect(
                byQa(page, 'statistics.dashboard.activityList', { kind: 'upcoming' }),
            ).toBeVisible({ timeout: 30_000 })
            const footer = byQa(page, 'statistics.shared.listFooter', { kind: 'upcoming' })
            await expect(footer).toBeVisible({ timeout: 30_000 })
            await footer.click()
            await expect(page).toHaveURL(/\/activities\?upcoming=1/)
        } finally {
            if (activityId) await api.deleteActivity(pid, activityId)
            await api.archiveProject(pid)
        }
    })

    test('#55/#56 stalled deals list and row drill to deal card', async ({
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
            await byQa(page, 'statistics.dashboard.stalledRow', { deal: dealId }).click()
            await expect(page).toHaveURL(new RegExp(`/deals/${dealId}`))
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId)
            await api.archiveProject(pid)
        }
    })

    test('#61 federated drill URLs omit /p/:pid prefix', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-drill'), [
            'statistics',
            'deals',
            'activities',
        ])
        await useProject(pid, ['statistics', 'deals', 'activities'])
        let activityId = ''
        try {
            activityId = await api.createActivity(pid, {
                title: uniqueName('overdue'),
                dueDate: '2020-01-01T12:00:00.000Z',
            })
            await gotoDashboard(page, pid)
            const footer = byQa(page, 'statistics.shared.listFooter', { kind: 'overdue' })
            await expect(footer).toBeVisible({ timeout: 30_000 })
            await footer.click()
            await expect(page).toHaveURL(/\/activities\?overdue=1/)
            await expect(page.url()).not.toMatch(/\/p\/[^/]+\/activities/)
        } finally {
            if (activityId) await api.deleteActivity(pid, activityId)
            await api.archiveProject(pid)
        }
    })
})
