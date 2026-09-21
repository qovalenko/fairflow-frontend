import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { FEDERATED, STATISTICS_MODULES } from '../support/statistics'

/**
 * Catalog P0 analytics slices (#72, #74, #75, #76, #78, #79) + #74 funnel on analytics.
 */
test.use({ forbiddenAllow: ['/v1/companies'] })

const modules = [...STATISTICS_MODULES]

test.describe('statistics analytics slices', () => {
    test('#72 sales slice shows chart region', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-slice'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(FEDERATED.statistics)
            await expect(byQa(page, 'statistics.analytics.salesChart')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#74 funnel slice reuses funnel widget', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-slice'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(`${FEDERATED.statistics}?slice=funnel`)
            await expect(byQa(page, 'statistics.dashboard.funnel')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#75 sources slice shows sources widget', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-slice'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(`${FEDERATED.statistics}?slice=sources`)
            await expect(byQa(page, 'statistics.dashboard.sources')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#76 team slice shows managers table for wide scope', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-slice'), modules)
        await useProject(pid, modules)
        await page.route('**/v1/statistics**', async (route) => {
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            body.scopeLevel = 'all'
            body.topManagers = [
                {
                    ownerId: 'mgr-1',
                    name: 'Manager One',
                    deals: 5,
                    amount: 500000,
                    conversion: 20,
                },
            ]
            await route.fulfill({
                status: upstream.status(),
                headers: upstream.headers(),
                contentType: 'application/json',
                body: JSON.stringify(body),
            })
        })
        try {
            await page.goto(`${FEDERATED.statistics}?slice=team`)
            await expect(byQa(page, 'statistics.analytics.teamTable')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#77 team row drill navigates to /deals?assigneeId=', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-slice'), modules)
        await useProject(pid, modules)
        const ownerId = 'mgr-drill-1'
        await page.route('**/v1/statistics**', async (route) => {
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            body.scopeLevel = 'all'
            body.topManagers = [
                {
                    ownerId,
                    name: 'Drill Manager',
                    deals: 2,
                    amount: 200000,
                    conversion: 10,
                },
            ]
            await route.fulfill({
                status: upstream.status(),
                headers: upstream.headers(),
                contentType: 'application/json',
                body: JSON.stringify(body),
            })
        })
        try {
            await page.goto(`${FEDERATED.statistics}?slice=team`)
            await byQa(page, 'statistics.analytics.teamRow', { owner: ownerId }).click()
            await expect(page).toHaveURL(new RegExp(`assigneeId=${ownerId}`))
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#78 departments slice shows table', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-slice'), modules)
        await useProject(pid, modules)
        await page.route('**/v1/statistics**', async (route) => {
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            body.scopeLevel = 'all'
            body.byDepartment = [
                {
                    departmentId: 'dep-1',
                    departmentName: 'North',
                    deals: 4,
                    amount: 400000,
                    avgCheck: 100000,
                    managersCount: 1,
                },
            ]
            await route.fulfill({
                status: upstream.status(),
                headers: upstream.headers(),
                contentType: 'application/json',
                body: JSON.stringify(body),
            })
        })
        try {
            await page.goto(`${FEDERATED.statistics}?slice=by_department`)
            await expect(byQa(page, 'statistics.analytics.departmentsTable')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#79 order_types slice shows bar chart region', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-slice'), modules)
        await useProject(pid, modules)
        await page.route('**/v1/statistics**', async (route) => {
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            body.orderTypes = [
                { orderTypeId: 'ot-1', orderTypeName: 'Retail', count: 3 },
            ]
            await route.fulfill({
                status: upstream.status(),
                headers: upstream.headers(),
                contentType: 'application/json',
                body: JSON.stringify(body),
            })
        })
        try {
            await page.goto(`${FEDERATED.statistics}?slice=order_types`)
            await expect(byQa(page, 'statistics.analytics.orderTypesChart')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })
})
