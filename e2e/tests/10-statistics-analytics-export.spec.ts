import { test, expect } from '../fixtures/test'
import { byQa, byQaActive } from '../support/qa'
import { uniqueName } from '../support/env'
import { FEDERATED, STATISTICS_MODULES } from '../support/statistics'

/**
 * Catalog #69–#71, #73, #87–#88, #90–#91, #94 — аналитика, экспорт (P0/P1).
 */
test.use({ forbiddenAllow: ['/v1/companies'] })

const modules = [...STATISTICS_MODULES]

test.describe('statistics analytics and export', () => {
    test('#67 analytics happy path loads default sales slice', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-anl'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(FEDERATED.statistics)
            await expect(byQa(page, 'statistics.analytics.screen')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQaActive(page, 'statistics.analytics.sliceTab', { slice: 'sales' })).toBeVisible()
            await expect(byQa(page, 'statistics.analytics.salesChart')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#69 analytics load error → retry screen', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-anl'), modules)
        await useProject(pid, modules)
        let failOnce = true
        await page.route('**/v1/statistics**', async (route) => {
            if (failOnce) {
                failOnce = false
                await route.fulfill({ status: 500, body: 'error' })
                return
            }
            await route.continue()
        })
        try {
            await page.goto(FEDERATED.statistics)
            await expect(byQa(page, 'statistics.shared.error')).toBeVisible({ timeout: 30_000 })
            await byQa(page, 'statistics.shared.errorRetry').click()
            await expect(byQa(page, 'statistics.analytics.screen')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#70 no available slices → empty state', async ({ page, api, useProject }) => {
        const statsOnly = ['statistics']
        const pid = await api.createProject(uniqueName('stat-anl'), statsOnly)
        await useProject(pid, statsOnly)
        try {
            await page.goto(FEDERATED.statistics)
            await expect(
                byQa(page, 'statistics.shared.widgetEmpty', { state: 'no-slices' }),
            ).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#71 export format selector visible for admin', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-anl'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(FEDERATED.statistics)
            await expect(byQa(page, 'statistics.analytics.exportFormat')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#73 sales slice empty period → slice-empty widget', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-anl'), modules)
        await useProject(pid, modules)
        await page.route('**/v1/statistics**', async (route) => {
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            body.sales = []
            await route.fulfill({
                status: upstream.status(),
                headers: upstream.headers(),
                contentType: 'application/json',
                body: JSON.stringify(body),
            })
        })
        try {
            await page.goto(FEDERATED.statistics)
            await expect(
                byQa(page, 'statistics.shared.widgetEmpty', { state: 'slice-empty' }),
            ).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#87 export CSV → success banner', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-export'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(FEDERATED.statistics)
            await expect(byQa(page, 'statistics.analytics.export')).toBeVisible({ timeout: 30_000 })
            const downloadPromise = page.waitForEvent('download')
            await byQa(page, 'statistics.analytics.export').click()
            const download = await downloadPromise
            expect(download.suggestedFilename()).toMatch(/statistics-month\.csv$/)
            await expect(byQa(page, 'statistics.analytics.exportSuccess')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#88 export JSON via format selector', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-export'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(FEDERATED.statistics)
            await byQa(page, 'statistics.analytics.exportFormat').selectOption('json')
            const downloadPromise = page.waitForEvent('download')
            await byQa(page, 'statistics.analytics.export').click()
            const download = await downloadPromise
            expect(download.suggestedFilename()).toMatch(/statistics-month\.json$/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#90 export API 403 shows permission error banner', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-export'), modules)
        await useProject(pid, modules)
        await page.route('**/v1/statistics/export**', async (route) => {
            await route.fulfill({ status: 403, body: 'forbidden' })
        })
        try {
            await page.goto(FEDERATED.statistics)
            await expect(byQa(page, 'statistics.analytics.export')).toBeEnabled({
                timeout: 30_000,
            })
            await byQa(page, 'statistics.analytics.export').click()
            await expect(byQa(page, 'statistics.analytics.exportError')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#91 export blocked for custom period without dates', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-export'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(`${FEDERATED.statistics}?period=custom`)
            await expect(byQa(page, 'statistics.shared.rangePrompt')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'statistics.shared.rangePromptHint')).toBeVisible()
            await expect(byQa(page, 'statistics.analytics.export')).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#94 departments slice is read-only (no drill rows)', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-anl'), modules)
        await useProject(pid, modules)
        await page.route('**/v1/statistics**', async (route) => {
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            body.scopeLevel = 'all'
            body.byDepartment = [
                {
                    departmentId: 'd1',
                    departmentName: 'Sales',
                    deals: 3,
                    amount: 300000,
                    avgCheck: 100000,
                    managersCount: 2,
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
            await expect(byQa(page, 'statistics.analytics.teamRow')).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })
})
