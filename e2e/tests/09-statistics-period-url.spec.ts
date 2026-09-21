import { test, expect } from '../fixtures/test'
import { byQa, byQaActive } from '../support/qa'
import { uniqueName } from '../support/env'
import { FEDERATED, STATISTICS_MODULES, gotoDashboard } from '../support/statistics'

/**
 * Catalog #26–#30, #28, #82–#84, #95, #106 — период/срез в URL (P0/P1).
 */
test.use({ forbiddenAllow: ['/v1/companies'] })

const modules = [...STATISTICS_MODULES]

test.describe('statistics period and URL', () => {
    test('#26 period change writes ?period= to URL', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-period'), modules)
        await useProject(pid, modules)
        try {
            await gotoDashboard(page, pid)
            await expect(byQa(page, 'statistics.header.period')).toBeVisible({ timeout: 30_000 })
            await byQa(page, 'statistics.header.period').selectOption('quarter')
            await expect(page).toHaveURL(/period=quarter/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#27 clean URL without period defaults to month', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-period'), modules)
        await useProject(pid, modules)
        try {
            await gotoDashboard(page, pid)
            await expect(byQa(page, 'statistics.header.period')).toHaveValue('month')
            await expect(page.url()).not.toMatch(/[?&]period=/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#28 custom period with two dates writes from/to to URL and refetches', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-period'), modules)
        await useProject(pid, modules)
        try {
            await gotoDashboard(page, pid)
            await expect(byQa(page, 'statistics.header.period')).toBeVisible({ timeout: 30_000 })
            await byQa(page, 'statistics.header.period').selectOption('custom')
            await byQa(page, 'statistics.header.rangeFrom').fill('2026-08-01')
            const dashPromise = page.waitForResponse(
                (r) =>
                    r.url().includes('/v1/dashboard') &&
                    r.url().includes('from=') &&
                    r.url().includes('to=') &&
                    r.ok(),
            )
            await byQa(page, 'statistics.header.rangeTo').fill('2026-08-15')
            await dashPromise
            await expect(page).toHaveURL(/period=custom/)
            await expect(page).toHaveURL(/from=2026-08-01/)
            await expect(page).toHaveURL(/to=2026-08-15/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#29 period=custom without dates → range prompt, no statistics API', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-period'), modules)
        await useProject(pid, modules)
        let statsHit = false
        page.on('request', (req) => {
            if (req.url().includes('/v1/dashboard') || req.url().includes('/v1/statistics')) {
                statsHit = true
            }
        })
        try {
            await page.goto(`${FEDERATED.statistics}?period=custom`)
            await expect(byQa(page, 'statistics.shared.rangePrompt')).toBeVisible({
                timeout: 30_000,
            })
            expect(statsHit).toBe(false)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#30 invalid custom range shows incomplete hint', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-period'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(FEDERATED.statistics)
            await byQa(page, 'statistics.header.period').selectOption('custom')
            await byQa(page, 'statistics.header.rangeFrom').fill('2026-08-20')
            await byQa(page, 'statistics.header.rangeTo').fill('2026-08-01')
            await expect(byQa(page, 'statistics.header.rangeIncomplete')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#82 slice switch writes ?slice= to URL', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-slice'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(FEDERATED.statistics)
            await expect(byQa(page, 'statistics.analytics.sliceTab', { slice: 'funnel' })).toBeVisible(
                { timeout: 30_000 },
            )
            await byQa(page, 'statistics.analytics.sliceTab', { slice: 'funnel' }).click()
            await expect(page).toHaveURL(/slice=funnel/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#83 deep-link ?slice=funnel survives reload', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-slice'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(`${FEDERATED.statistics}?slice=funnel`)
            await expect(byQaActive(page, 'statistics.analytics.sliceTab', { slice: 'funnel' })).toBeVisible()
            await page.reload()
            await expect(page).toHaveURL(/slice=funnel/)
            await expect(byQaActive(page, 'statistics.analytics.sliceTab', { slice: 'funnel' })).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#84 unavailable slice in URL normalizes to first available', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-slice'), modules)
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
            await page.goto(`${FEDERATED.statistics}?slice=team`)
            await expect(byQa(page, 'statistics.analytics.sliceTab', { slice: 'team' })).toHaveCount(
                0,
            )
            await expect(byQaActive(page, 'statistics.analytics.sliceTab', { slice: 'sales' })).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#95 sharable URL period+slice opens same view', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-share'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(`${FEDERATED.statistics}?period=quarter&slice=sources`)
            await expect(byQa(page, 'statistics.header.period')).toHaveValue('quarter')
            await expect(byQaActive(page, 'statistics.analytics.sliceTab', { slice: 'sources' })).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#106 period change on analytics keeps active slice in URL', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-period'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(`${FEDERATED.statistics}?slice=funnel`)
            await byQa(page, 'statistics.header.period').selectOption('week')
            await expect(page).toHaveURL(/slice=funnel/)
            await expect(page).toHaveURL(/period=week/)
        } finally {
            await api.archiveProject(pid)
        }
    })
})
