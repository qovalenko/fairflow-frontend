import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEALS_MODULES, gotoDealsList, switchDealsView, openDealsFromSidebar } from '../support/deals'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

/** #1 sidebar → list; #2 segment preserves project; #3 deep-link kanban; #5 dashboard; #8 empty ST-3. */
test.describe('deals navigation', () => {
    test('#1: open deals from sidebar', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('deals-nav'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        try {
            await openDealsFromSidebar(page)
            expect(page.url()).toMatch(/\/deals\/?$/)
            await expect(byQa(page, 'deals.list.create').or(byQa(page, 'deals.list.empty'))).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#3: deep-link /deals/kanban opens kanban', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('deals-kanban-link'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        try {
            await page.goto('/deals/kanban')
            await expect(byQa(page, 'deals.kanban.create').or(byQa(page, 'deals.view.segment.kanban'))).toBeVisible({
                timeout: 30_000,
            })
            expect(page.url()).toContain('/deals/kanban')
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#2: list ↔ kanban segment keeps project context', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('deals-segment'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        try {
            await gotoDealsList(page)
            await switchDealsView(page, 'kanban')
            await expect(page).toHaveURL(/\/deals\/kanban/)
            await switchDealsView(page, 'list')
            await expect(page).toHaveURL(/\/deals\/?$/)
            await expect(byQa(page, 'deals.list.table').or(byQa(page, 'deals.list.empty'))).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#5: toolbar dashboard link → /deals/dashboard', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('deals-dash-nav'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        try {
            await gotoDealsList(page)
            await byQa(page, 'deals.list.dashboard').click()
            await expect(page).toHaveURL(/\/deals\/dashboard/)
            await expect(byQa(page, 'deals.dashboard.root')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#8: empty project ST-3 + create CTA', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('deals-empty'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        try {
            await gotoDealsList(page)
            await expect(byQa(page, 'deals.list.empty')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'deals.list.createEmpty')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })
})
