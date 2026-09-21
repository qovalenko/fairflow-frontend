import { randomUUID } from 'node:crypto'
import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    DEALS_MODULES,
    acceptDialog,
    defaultExtraPipeline,
    gotoDealsDashboard,
    gotoDealsList,
    gotoDealsTrash,
    openListCreateDrawer,
    pickSelectOption,
} from '../support/deals'

/**
 * Deals — P1 scenarios marked automatable:yes in `.e2e-scenario-catalog/deals.md`.
 */

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/orders'] })

async function seedProject(
    api: { createProject: (name: string, modules: string[]) => Promise<string> },
    useProject: (pid: string, modules?: string[]) => Promise<void>,
    label: string,
    modules: string[] = [...DEALS_MODULES],
): Promise<string> {
    const pid = await api.createProject(uniqueName(label), modules)
    await useProject(pid, modules)
    return pid
}

test('#32: stalled badge in list row when BE flags isStalled', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-stalled-list')
    let dealId: string | undefined
    try {
        const seeded = await api.seedStalledDeal(pid, uniqueName('stalled-list'))
        test.skip(!seeded, 'BE did not mark deal as stalled (rottingDays/isStalled)')
        dealId = seeded!.id
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.stalled', { deal: dealId! })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#38: create validation: empty name keeps submit disabled', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-create-valid')
    try {
        await gotoDealsList(page)
        await openListCreateDrawer(page)
        await byQa(page, 'deals.create.name').fill('')
        await expect(byQa(page, 'deals.create.submit')).toBeDisabled()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#41: create POST error keeps drawer open', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-create-err')
    try {
        await page.route(/\/v1\/deals(\?|$)/, async (route) => {
            if (route.request().method() !== 'POST') {
                await route.continue()
                return
            }
            await route.fulfill({ status: 500, body: 'fail' })
        })
        await gotoDealsList(page)
        await openListCreateDrawer(page)
        await byQa(page, 'deals.create.leadMode.light').click()
        await byQa(page, 'deals.create.lightName').fill(uniqueName('lead'))
        await byQa(page, 'deals.create.lightPhone').fill('+79005556677')
        await byQa(page, 'deals.create.name').fill(uniqueName('deal-err'))
        await byQa(page, 'deals.create.amount').fill('1000')
        await byQa(page, 'deals.create.submit').click()
        await expect(byQa(page, 'deals.create.submit')).toBeVisible({ timeout: 10_000 })
        await expect(byQa(page, 'deals.list.row')).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#46: bulk soft-delete removes rows from list', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-bulk-del')
    let id1: string | undefined
    let id2: string | undefined
    try {
        id1 = (await api.seedOpenDeal(pid, uniqueName('bulk-del-1'))).id
        id2 = (await api.seedOpenDeal(pid, uniqueName('bulk-del-2'))).id
        await gotoDealsList(page)
        await byQa(page, 'deals.list.select', { deal: id1! }).click()
        await byQa(page, 'deals.list.select', { deal: id2! }).click()
        acceptDialog(page)
        await byQa(page, 'deals.bulk.delete').click()
        await expect(byQa(page, 'deals.list.row', { deal: id1! })).toHaveCount(0, {
            timeout: 30_000,
        })
        await expect(byQa(page, 'deals.list.row', { deal: id2! })).toHaveCount(0)
    } finally {
        if (id1) await api.deleteDeal(pid, id1).catch(() => {})
        if (id2) await api.deleteDeal(pid, id2).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#65: stalled badge on kanban card when BE flags isStalled', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-stalled-k')
    let dealId: string | undefined
    try {
        const seeded = await api.seedStalledDeal(pid, uniqueName('stalled-k'))
        test.skip(!seeded, 'BE did not mark deal as stalled (rottingDays/isStalled)')
        dealId = seeded!.id
        await page.goto('/deals/kanban')
        await expect(byQa(page, 'deals.kanban.stalled', { deal: dealId! })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#72: deal card load error shows retry', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-det-err')
    let dealId: string | undefined
    let fail = true
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('det-err'))).id
        await page.route(new RegExp(`/v1/deals/${dealId}(\\?|$)`), async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            if (fail) {
                fail = false
                await route.fulfill({ status: 500, body: 'fail' })
                return
            }
            await route.continue()
        })
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.error')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'deals.details.errorRetry').click()
        await expect(byQa(page, 'deals.details.edit')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#73: unknown deal id shows not-found state', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-notfound')
    try {
        await page.goto(`/deals/${randomUUID()}`)
        await expect(byQa(page, 'deals.details.notFound')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#95: edit load error offers back to list', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-edit-err')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('edit-err'))).id
        await page.route(new RegExp(`/v1/deals/${dealId}(\\?|$)`), async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await route.fulfill({ status: 500, body: 'fail' })
        })
        await page.goto(`/deals/${dealId}/edit`)
        await expect(byQa(page, 'deals.edit.error')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'deals.edit.backToList').click()
        await expect(page).toHaveURL(/\/deals$/, { timeout: 20_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#99: close lost with empty reasons dictionary succeeds with comment', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'deals-lost-empty-reasons')
    let dealId: string | undefined
    try {
        const reasons = await api.getLostReasons(pid)
        test.skip(reasons.length > 0, 'stand has lost-reasons seed — use #98 instead')
        dealId = (await api.seedOpenDeal(pid, uniqueName('lost-empty-reasons'))).id
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.closeLost').click()
        await expect(byQa(page, 'deals.close.dialog')).toBeVisible()
        await byQa(page, 'deals.close.confirm').click()
        await expect(byQa(page, 'deals.details.reopen')).toBeVisible({ timeout: 20_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test.fixme('#103: BUG no UI path to retry close — buttons hidden when deal already closed', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'deals-double-close')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('double-close'))).id
        await api.closeDeal(pid, dealId, 'won')
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.closeWon').click()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#121: drift defer closes panel without accept API', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-drift-defer')
    let contactId: string | undefined
    let dealId: string | undefined
    const phone = `+7904${Date.now().toString().slice(-7)}`
    try {
        contactId = await api.createContact(pid, {
            firstName: 'Defer',
            lastName: uniqueName('drift'),
            phone,
        })
        dealId = await api.createDeal(pid, {
            name: uniqueName('drift-defer'),
            amount: 5000,
            contactId,
        })
        await api.updateContact(pid, contactId, { phone: `+7905${Date.now().toString().slice(-7)}` })
        await page.goto(`/deals/${dealId}`)
        await page.reload()
        const deal = await api.getDeal(pid, dealId)
        test.skip(!deal.driftFlag, 'driftFlag not set on the stand after contact update')
        await byQa(page, 'deals.details.drift').click()
        await expect(byQa(page, 'deals.drift.dialog')).toBeVisible()
        let acceptCalled = false
        page.on('request', (req) => {
            if (req.url().includes('/accept-drift') && req.method() === 'POST') acceptCalled = true
        })
        await byQa(page, 'deals.drift.defer').click()
        await expect(byQa(page, 'deals.drift.dialog')).toHaveCount(0)
        expect(acceptCalled).toBe(false)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        if (contactId) await api.deleteContact(pid, contactId)
        await api.archiveProject(pid)
    }
})

test('#130: empty trash shows empty state', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-trash-empty')
    try {
        await gotoDealsTrash(page)
        await expect(byQa(page, 'deals.trash.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#131: trash load error shows retry', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-trash-err')
    let fail = true
    try {
        await page.route(/\/v1\/deals.*deleted=true/, async (route) => {
            if (fail) {
                fail = false
                await route.fulfill({ status: 500, body: 'fail' })
                return
            }
            await route.continue()
        })
        await gotoDealsTrash(page)
        await expect(byQa(page, 'deals.trash.error')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'deals.trash.errorRetry').click()
        await expect(byQa(page, 'deals.trash.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#135: dashboard pipeline filter re-fetches aggregates', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-dash-pipe')
    try {
        const extra = await api.createPipeline(pid, defaultExtraPipeline(uniqueName('dash-pipe-b')))
        await gotoDealsDashboard(page)
        await expect(byQa(page, 'deals.dashboard.root')).toBeVisible({ timeout: 30_000 })
        const reload = page.waitForResponse(
            (r) => r.url().includes('/v1/deals/dashboard') && r.request().method() === 'GET',
            { timeout: 20_000 },
        )
        await pickSelectOption(page, 'deals.dashboard.filter.pipeline', extra.id)
        expect((await reload).ok()).toBeTruthy()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#134: dashboard period filter re-fetches aggregates', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-dash-period')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('dash-period'))).id
        await gotoDealsDashboard(page)
        await expect(byQa(page, 'deals.dashboard.root')).toBeVisible({ timeout: 30_000 })
        const reload = page.waitForResponse(
            (r) => r.url().includes('/v1/deals/dashboard') && r.request().method() === 'GET',
            { timeout: 20_000 },
        )
        await pickSelectOption(page, 'deals.dashboard.filter.period', '7')
        expect((await reload).ok()).toBeTruthy()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#138: KPI open deals navigates to list', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-dash-kpi')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('dash-kpi'))).id
        await gotoDealsDashboard(page)
        await byQa(page, 'deals.dashboard.kpiOpen').click()
        await expect(page).toHaveURL(/\/deals$/, { timeout: 20_000 })
        await expect(byQa(page, 'deals.list.row', { deal: dealId! })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#139: dashboard empty project shows empty state', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-dash-empty')
    try {
        await gotoDealsDashboard(page)
        await expect(byQa(page, 'deals.dashboard.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#141: dashboard load error shows retry', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-dash-err')
    let fail = true
    try {
        await page.route(/\/v1\/deals\/dashboard/, async (route) => {
            if (fail) {
                fail = false
                await route.fulfill({ status: 500, body: 'fail' })
                return
            }
            await route.continue()
        })
        await gotoDealsDashboard(page)
        await expect(byQa(page, 'deals.dashboard.error')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'deals.dashboard.errorRetry').click()
        await expect(byQa(page, 'deals.dashboard.empty').or(byQa(page, 'deals.dashboard.root'))).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#156: import URL shows unavailable stub', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-import-url')
    try {
        await page.goto('/deals/import')
        await expect(byQa(page, 'deals.import.unavailable')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#157: import button hidden in list toolbar', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-import-hidden')
    try {
        await gotoDealsList(page)
        await expect(page.locator('a[href="/deals/import"]')).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})
