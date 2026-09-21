import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { FEDERATED, STATISTICS_MODULES, gotoDashboard, waitForDashboard } from '../support/statistics'

/**
 * Catalog #1–#6 — навигация и точки входа (P0: 1–4, P1: 5–6).
 */
test.use({ forbiddenAllow: ['/v1/companies'] })

const modules = [...STATISTICS_MODULES]

test.describe('statistics navigation', () => {
    test('#1 open operational dashboard via sidebar «Дашборд»', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-nav'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(FEDERATED.statistics)
            const dashPromise = waitForDashboard(page, pid)
            await byQa(page, 'host.sidebar.item', { nav: 'portfolio.dashboard' }).click()
            await dashPromise
            await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
            await expect(byQa(page, 'statistics.dashboard.screen')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#2 open analytics via sidebar «Статистика»', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-nav'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(FEDERATED.dashboard)
            await byQa(page, 'host.sidebar.item', { nav: 'portfolio.statistics' }).click()
            await expect(page).toHaveURL(/\/statistics(?:\?|$)/)
            await expect(byQa(page, 'statistics.analytics.screen')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#3 direct URL /dashboard without redirect to /statistics', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-nav'), modules)
        await useProject(pid, modules)
        try {
            await gotoDashboard(page, pid)
            await expect(page).toHaveURL(/\/dashboard(?:\?|$)/)
            await expect(page.url()).not.toMatch(/\/statistics(?:\?|$)/)
            await expect(byQa(page, 'statistics.dashboard.screen')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#4 direct URL /statistics', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('stat-nav'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(FEDERATED.statistics)
            await expect(page).toHaveURL(/\/statistics(?:\?|$)/)
            await expect(byQa(page, 'statistics.analytics.screen')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#5 first navigable menu item is /dashboard when statistics enabled', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('stat-nav'), modules)
        await useProject(pid, modules)
        try {
            await page.goto(`/p/${pid}`)
            await expect(page).toHaveURL(/\/dashboard(?:\?|$)/, { timeout: 30_000 })
            await expect(byQa(page, 'statistics.dashboard.screen')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#6 statistics off → no /dashboard or /statistics in sidebar', async ({
        page,
        api,
        useProject,
    }) => {
        const withoutStats = ['deals', 'contacts']
        const pid = await api.createProject(uniqueName('stat-nav'), withoutStats)
        await useProject(pid, withoutStats)
        try {
            await page.goto(`/p/${pid}`)
            await expect(byQa(page, 'host.sidebar.item', { nav: 'portfolio.dashboard' })).toHaveCount(
                0,
            )
            await expect(
                byQa(page, 'host.sidebar.item', { nav: 'portfolio.statistics' }),
            ).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })
})
