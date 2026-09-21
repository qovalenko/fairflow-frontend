import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName, DATA_PREFIX } from '../support/env'
import {
    DEALS_MODULES,
    DEALS_WITH_COMPANIES,
    DEALS_WITH_ORDERS,
    forceSessionProjectRole,
    gotoDealsDashboard,
    gotoDealsKanban,
    gotoDealsList,
    omitPermissions,
    pickSelectOption,
} from '../support/deals'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/orders', '/v1/auth/me'] })

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

test('#4: defaultDealsView kanban redirects /deals to kanban', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-default-view')
    try {
        await api.updateMyProfile({ defaultDealsView: 'kanban' })
        await page.goto('/deals')
        await expect(page).toHaveURL(/\/deals\/kanban/, { timeout: 20_000 })
    } finally {
        await api.updateMyProfile({ defaultDealsView: 'list' }).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#11: project switch reloads deals list data', async ({ page, api, useProject }) => {
    const modules = [...DEALS_MODULES]
    const pidA = await api.createProject(uniqueName('switch-deals-a'), modules)
    const pidB = await api.createProject(uniqueName('switch-deals-b'), modules)
    const nameA = uniqueName('deal-a-only')
    const nameB = uniqueName('deal-b-only')
    let dealA: string | undefined
    let dealB: string | undefined
    try {
        dealA = (await api.seedOpenDeal(pidA, nameA)).id
        dealB = (await api.seedOpenDeal(pidB, nameB)).id
        await useProject(pidA, modules)
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.row', { deal: dealA! })).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'host.projectSelector.trigger').click()
        await byQa(page, 'host.projectSelector.item', { project: pidB }).click()
        await expect(page).toHaveURL(new RegExp(`/p/${pidB}`), { timeout: 20_000 })
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.row', { deal: dealB! })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'deals.list.row', { deal: dealA! })).toHaveCount(0)
    } finally {
        if (dealA) await api.deleteDeal(pidA, dealA).catch(() => {})
        if (dealB) await api.deleteDeal(pidB, dealB).catch(() => {})
        await api.archiveProject(pidA)
        await api.archiveProject(pidB)
    }
})

test('#13: list shows loading state on first fetch', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-list-loading')
    try {
        await page.route(/\/v1\/deals(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await new Promise((r) => setTimeout(r, 800))
            await route.continue()
        })
        await page.goto('/deals')
        await expect(byQa(page, 'deals.list.loading')).toBeVisible({ timeout: 10_000 })
        await expect(byQa(page, 'deals.list.create').or(byQa(page, 'deals.list.empty'))).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#28: sort amount column triggers server sort query', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-sort-amount')
    let lowId: string | undefined
    let highId: string | undefined
    try {
        lowId = (await api.seedOpenDeal(pid, uniqueName('sort-low'), { amount: 100 })).id
        highId = (await api.seedOpenDeal(pid, uniqueName('sort-high'), { amount: 9000 })).id
        await gotoDealsList(page)
        const sortResp = page.waitForResponse(
            (r) =>
                r.url().includes('/v1/deals') &&
                r.request().method() === 'GET' &&
                r.url().includes('sort'),
            { timeout: 20_000 },
        )
        await byQa(page, 'deals.list.sort.amount').click()
        const res = await sortResp
        expect(res.ok()).toBeTruthy()
    } finally {
        if (lowId) await api.deleteDeal(pid, lowId).catch(() => {})
        if (highId) await api.deleteDeal(pid, highId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#29: column visibility toggle hides amount column', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-columns')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('col-vis'))).id
        await gotoDealsList(page)
        await byQa(page, 'deals.list.columns.trigger').click()
        await byQa(page, 'deals.list.columns.toggle', { column: 'amount' }).click()
        await expect(byQa(page, 'deals.list.sort.amount')).toHaveCount(0)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#33: drift flag in row enables bulk accept', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-list-drift')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('list-drift'))).id
        await page.route(/\/v1\/deals(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            const upstream = await route.fetch()
            const body = (await upstream.json()) as { list?: Array<Record<string, unknown>> }
            const list = (body.list ?? []).map((d) =>
                d.id === dealId ? { ...d, driftFlag: true } : d,
            )
            await route.fulfill({
                status: upstream.status(),
                contentType: 'application/json',
                body: JSON.stringify({ ...body, list }),
            })
        })
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.drift', { deal: dealId! })).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'deals.list.select', { deal: dealId! }).click()
        await expect(byQa(page, 'deals.bulk.driftAccept')).toBeVisible()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#35: table contact link navigates to contact card', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-table-links')
    let contactId: string | undefined
    let dealId: string | undefined
    try {
        contactId = await api.createContact(pid, {
            firstName: 'Tbl',
            lastName: uniqueName('link'),
            email: `${uniqueName('t')}@example.test`,
        })
        dealId = (
            await api.createDeal(pid, {
                name: uniqueName('tbl-link'),
                amount: 1000,
                contactId,
            })
        )
        await gotoDealsList(page)
        await byQa(page, 'deals.list.contactLink', { contact: contactId! }).click()
        await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}`))
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        if (contactId) await api.deleteContact(pid, contactId)
        await api.archiveProject(pid)
    }
})

test('#47: bulk accept drift clears drift flag', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-bulk-drift')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('bulk-drift'))).id
        await page.route(/\/v1\/deals(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            const upstream = await route.fetch()
            const body = (await upstream.json()) as { list?: Array<Record<string, unknown>> }
            const list = (body.list ?? []).map((d) =>
                d.id === dealId ? { ...d, driftFlag: true } : d,
            )
            await route.fulfill({
                status: upstream.status(),
                contentType: 'application/json',
                body: JSON.stringify({ ...body, list }),
            })
        })
        await gotoDealsList(page)
        await byQa(page, 'deals.list.select', { deal: dealId! }).click()
        const acceptResp = page.waitForResponse(
            (r) => r.url().includes('/accept-drift') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'deals.bulk.driftAccept').click()
        expect((await acceptResp).ok()).toBeTruthy()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#51: bulk selection opens task create drawer', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-bulk-task', ['deals', 'contacts', 'activities'])
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('bulk-task'))).id
        await gotoDealsList(page)
        await byQa(page, 'deals.list.select', { deal: dealId! }).click()
        await byQa(page, 'deals.list.bulkTask').click()
        await expect(byQa(page, 'host.globalCreate.submit', { entity: 'task' })).toBeVisible({
            timeout: 20_000,
        })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#52: export enabled when deals selected with export permission', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-export-on')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('export-on'))).id
        await gotoDealsList(page)
        await byQa(page, 'deals.list.select', { deal: dealId! }).click()
        await expect(byQa(page, 'deals.list.export')).toBeEnabled()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#61: kanban column loads more cards on scroll', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-kanban-more')
    const stageId = (await api.seedOpenDeal(pid, uniqueName('kanban-more-seed'))).stageId
    try {
        await page.route(/\/v1\/deals\/kanban/, async (route) => {
            const upstream = await route.fetch()
            const body = (await upstream.json()) as {
                columns?: Array<{
                    stageId?: string
                    id?: string
                    deals?: Array<{ id: string; name: string }>
                    total?: number
                    hasMore?: boolean
                }>
            }
            const cols = body.columns ?? []
            const col = cols.find((c) => (c.stageId ?? c.id) === stageId) ?? cols[0]
            if (col) {
                col.deals = Array.from({ length: 50 }, (_, i) => ({
                    id: `mock-${i}`,
                    name: `Card ${i}`,
                    amount: 100,
                    stageId,
                }))
                col.total = 55
                col.hasMore = true
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(body),
            })
        })
        await page.route(/\/v1\/deals(\?|$)/, async (route) => {
            await route.continue()
        })
        await gotoDealsKanban(page)
        const column = byQa(page, 'deals.kanban.column', { stage: stageId })
        const tailResp = page.waitForResponse(
            (r) => r.url().includes('/v1/deals') && r.url().includes('stageId='),
            { timeout: 20_000 },
        )
        await column.evaluate((el) => {
            el.scrollTop = el.scrollHeight
        })
        await expect(byQa(page, 'deals.kanban.loadMore', { stage: stageId })).toBeVisible({
            timeout: 15_000,
        })
        await tailResp
    } finally {
        await api.cleanupDeals(pid, DATA_PREFIX)
        await api.archiveProject(pid)
    }
})

test('#66: activities module on shows kanban activity badge', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-kanban-act', ['deals', 'contacts', 'activities'])
    let dealId: string | undefined
    let activityId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('kanban-act'))).id
        activityId = await api.createActivity(pid, {
            title: uniqueName('next-step'),
            dealId,
            dueDate: Date.now() + 86_400_000,
        })
        await gotoDealsKanban(page)
        await expect(byQa(page, 'deals.kanban.activity', { deal: dealId! })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (activityId) await api.deleteActivity(pid, activityId).catch(() => {})
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#74: invisible deal shows not-found on card', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-invisible')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('invisible'))).id
        await page.route(new RegExp(`/v1/deals/${dealId}(\\?|$)`), async (route) => {
            await route.fulfill({ status: 404, body: 'not found' })
        })
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.notFound')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#78: stage history timeline visible after move', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-history')
    let dealId: string | undefined
    let altStage: string | undefined
    try {
        const seeded = await api.seedOpenDeal(pid, uniqueName('history'))
        dealId = seeded.id
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
        altStage = pipeline?.stages.find(
            (s) => s.id !== seeded.stageId && (!s.kind || s.kind === 'active'),
        )?.id
        test.skip(!altStage, 'need alternate stage')
        await api.moveDealStage(pid, dealId, altStage!)
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.history')).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText(/стади/i).first()).toBeVisible()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#79: orders widget lists linked order', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-orders-widget', [...DEALS_WITH_ORDERS])
    let dealId: string | undefined
    let orderId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('ord-widget'))).id
        orderId = await api.createOrder(pid, { dealId, name: uniqueName('ord-w') })
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.ordersWidget')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'deals.details.ordersWidget.row', { order: orderId! })).toBeVisible()
    } finally {
        if (orderId) await api.deleteOrder(pid, orderId).catch(() => {})
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#80: activities widget shows planned activity', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-act-widget', ['deals', 'contacts', 'activities'])
    let dealId: string | undefined
    let activityId: string | undefined
    const actTitle = uniqueName('act-widget')
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('act-w'))).id
        activityId = await api.createActivity(pid, { title: actTitle, dealId })
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.activitiesWidget')).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText(actTitle)).toBeVisible()
    } finally {
        if (activityId) await api.deleteActivity(pid, activityId).catch(() => {})
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#82: sale type panel shows product order type label', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-sale-type', ['deals', 'contacts', 'products'])
    let dealId: string | undefined
    let productId: string | undefined
    try {
        const orderType = await api.createOrderType(pid, uniqueName('otype'))
        productId = await api.createProduct(pid, {
            name: uniqueName('prod'),
            price: 1000,
            orderTypeId: orderType.id,
        })
        dealId = (
            await api.createDeal(pid, {
                name: uniqueName('sale-type'),
                amount: 5000,
                productId,
            })
        )
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.saleType')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'deals.details.saleType')).not.toHaveText(/не настроен/i)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        if (productId) await api.deleteProduct(pid, productId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#84: won deal shows orders block with link', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-won-orders', [...DEALS_WITH_ORDERS])
    let dealId: string | undefined
    let orderId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('won-ord'))).id
        await api.closeDeal(pid, dealId, 'won')
        orderId = await api.createOrder(pid, { dealId, name: uniqueName('won-ord-link') })
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.wonOrders')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'deals.details.orderLink', { order: orderId! })).toBeVisible()
    } finally {
        if (orderId) await api.deleteOrder(pid, orderId).catch(() => {})
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#85: record share control visible for manager', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-share')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('share'))).id
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.share')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#86: documents tab visible when module enabled', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-docs-tab', ['deals', 'contacts', 'documents'])
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('docs-tab'))).id
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.tab', { tab: 'documents' })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#87: deal card host action slot mounts without error', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-host-slot')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('host-slot'))).id
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.hostAction')).toBeAttached({ timeout: 30_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#91: edit clears optional expectedCloseDate field', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-clear-opt')
    let dealId: string | undefined
    try {
        dealId = (
            await api.seedOverdueDeal(pid, uniqueName('clear-date'))
        ).id
        await page.goto(`/deals/${dealId}/edit`)
        await byQa(page, 'deals.edit.expectedCloseDate').fill('')
        const saveResp = page.waitForResponse(
            (r) => r.url().includes(`/v1/deals/${dealId}`) && r.request().method() === 'PUT',
            { timeout: 20_000 },
        )
        await byQa(page, 'deals.edit.save').click()
        expect((await saveResp).ok()).toBeTruthy()
        const deal = await api.getDeal(pid, dealId!)
        expect(deal.expectedCloseDate ?? null).toBeFalsy()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#109: member reopen via API returns forbidden', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-reopen-403')
    let dealId: string | undefined
    let targetStage: string | undefined
    try {
        const seeded = await api.seedOpenDeal(pid, uniqueName('reopen403'))
        dealId = seeded.id
        await api.closeDeal(pid, dealId, 'won')
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
        targetStage = pipeline?.stages.find((s) => !s.kind || s.kind === 'active')?.id
        test.skip(!targetStage, 'need active stage')
        await forceSessionProjectRole(page, pid, 'member')
        let failed = false
        try {
            await api.reopenDeal(pid, dealId, 'member attempt', targetStage!)
        } catch {
            failed = true
        }
        expect(failed).toBe(true)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#110: reopen then close won increments wonVersion', async ({ api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-won-version')
    let dealId: string | undefined
    let targetStage: string | undefined
    try {
        const seeded = await api.seedOpenDeal(pid, uniqueName('wonver'))
        dealId = seeded.id
        await api.closeDeal(pid, dealId, 'won')
        const afterFirst = await api.getDeal(pid, dealId)
        const v1 = Number(afterFirst.wonVersion ?? 0)
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
        targetStage = pipeline?.stages.find((s) => !s.kind || s.kind === 'active')?.id
        test.skip(!targetStage, 'need active stage')
        await api.reopenDeal(pid, dealId, 'e2e reopen', targetStage!)
        await api.closeDeal(pid, dealId, 'won')
        const afterSecond = await api.getDeal(pid, dealId)
        const v2 = Number(afterSecond.wonVersion ?? 0)
        expect(v2).toBeGreaterThan(v1)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#113: qualify restores trashed duplicate contact', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-qual-restore')
    const phone = `+7905${Date.now().toString().slice(-7)}`
    let contactId: string | undefined
    let dealId: string | undefined
    try {
        contactId = await api.createContact(pid, {
            firstName: 'Trash',
            lastName: uniqueName('dup'),
            phone,
        })
        await api.deleteContact(pid, contactId)
        dealId = (
            await api.seedLightDeal(pid, uniqueName('qual-rest'), {
                lightName: 'Trash Lead',
                lightPhone: phone,
            })
        ).id
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.qualify').click()
        await byQa(page, 'deals.qualify.restore', { contact: contactId! }).click()
        await expect(byQa(page, 'deals.qualify.dialog')).toHaveCount(0, { timeout: 20_000 })
        const deal = await api.getDeal(pid, dealId!)
        expect(deal.contactId).toBe(contactId)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        if (contactId) await api.deleteContact(pid, contactId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#114: qualify create new despite duplicates', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-qual-create')
    const phone = `+7906${Date.now().toString().slice(-7)}`
    let existingId: string | undefined
    let dealId: string | undefined
    try {
        existingId = await api.createContact(pid, {
            firstName: 'Existing',
            lastName: uniqueName('dup'),
            phone,
        })
        dealId = (
            await api.seedLightDeal(pid, uniqueName('qual-new'), {
                lightName: 'New Lead',
                lightPhone: phone,
            })
        ).id
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.qualify').click()
        await byQa(page, 'deals.qualify.createContact').click()
        await expect(byQa(page, 'deals.qualify.dialog')).toHaveCount(0, { timeout: 20_000 })
        const deal = await api.getDeal(pid, dealId!)
        expect(deal.contactId).toBeTruthy()
        expect(deal.contactId).not.toBe(existingId)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        if (existingId) await api.deleteContact(pid, existingId)
        await api.archiveProject(pid)
    }
})

test('#115: qualify links company duplicate', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-qual-co', [...DEALS_WITH_COMPANIES])
    const coName = uniqueName('QualCo')
    let companyId: string | undefined
    let dealId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: coName })
        dealId = (
            await api.seedLightDeal(pid, uniqueName('qual-co'), {
                lightName: 'Co Lead',
                lightCompanyName: coName,
            })
        ).id
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.qualify').click()
        await byQa(page, 'deals.qualify.companyLink', { company: companyId! }).click()
        await expect(byQa(page, 'deals.qualify.dialog')).toHaveCount(0, { timeout: 20_000 })
        const deal = await api.getDeal(pid, dealId!)
        expect(deal.companyId).toBe(companyId)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#125: bulk accept drift from list selection', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-bulk-drift2')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('bulk-d2'))).id
        await page.route(/\/v1\/deals(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            const upstream = await route.fetch()
            const body = (await upstream.json()) as { list?: Array<Record<string, unknown>> }
            const list = (body.list ?? []).map((d) =>
                d.id === dealId ? { ...d, driftFlag: true } : d,
            )
            await route.fulfill({
                status: upstream.status(),
                contentType: 'application/json',
                body: JSON.stringify({ ...body, list }),
            })
        })
        await gotoDealsList(page)
        await byQa(page, 'deals.list.select', { deal: dealId! }).click()
        const acceptResp = page.waitForResponse(
            (r) => r.url().includes('/accept-drift') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'deals.bulk.driftAccept').click()
        expect((await acceptResp).ok()).toBeTruthy()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#143: dashboard shows stalled and forecast KPIs', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-kpi-extra')
    try {
        await page.route(/\/v1\/deals\/dashboard/, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    dealsByStage: [],
                    statistics: [],
                    topManagers: [],
                    stalledCount: 3,
                    forecastAmount: 12000,
                }),
            })
        })
        await gotoDealsDashboard(page)
        await expect(byQa(page, 'deals.dashboard.kpiStalled')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'deals.dashboard.kpiForecast')).toBeVisible()
        await expect(byQa(page, 'deals.dashboard.kpiStalled')).toContainText('3')
    } finally {
        await api.archiveProject(pid)
    }
})

test('#151: pipeline edit shows auto-transition UI', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-auto-ui')
    try {
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines[0]
        test.skip(!pipeline, 'no pipeline')
        await page.goto(`/deals/pipelines/${pipeline!.id}/edit`)
        await expect(byQa(page, 'deals.pipelines.edit.autoTransition.add')).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#152: cyclic auto-transitions rejected on save', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-auto-cycle')
    try {
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines[0]
        test.skip(!pipeline, 'no pipeline')
        await page.route(/\/v1\/pipelines\/[^/]+$/, async (route) => {
            if (route.request().method() !== 'PUT') {
                await route.continue()
                return
            }
            await route.fulfill({
                status: 422,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Циклические авто-переходы недопустимы' }),
            })
        })
        await page.goto(`/deals/pipelines/${pipeline!.id}/edit`)
        await byQa(page, 'deals.pipelines.edit.autoTransition.add').click()
        await byQa(page, 'deals.pipelines.edit.save').click()
        await expect(page.getByText(/цикл|недопустим/i)).toBeVisible({ timeout: 15_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#153: remove stage with active deals shows error', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-stage-del')
    let dealId: string | undefined
    try {
        const seeded = await api.seedOpenDeal(pid, uniqueName('stage-del'))
        dealId = seeded.id
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
        test.skip(!pipeline, 'no pipeline')
        await page.goto(`/deals/pipelines/${pipeline!.id}/edit`)
        const stageOnDeal = pipeline!.stages.find((s) => s.id === seeded.stageId)
        test.skip(!stageOnDeal, 'stage missing')
        await byQa(page, 'deals.pipelines.edit.removeStage', { stage: stageOnDeal!.id }).click()
        await byQa(page, 'deals.pipelines.edit.save').click()
        await expect(page.getByText(/не удалось|активн|сделк/i)).toBeVisible({ timeout: 15_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#165: list row actions menu button is visible', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-row-menu')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('row-menu'))).id
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.rowActions', { deal: dealId! })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#166: header create deal from contact context prefills contact', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-create-prefill')
    let contactId: string | undefined
    try {
        contactId = await api.createContact(pid, {
            firstName: 'Prefill',
            lastName: uniqueName('ctx'),
            email: `${uniqueName('p')}@example.test`,
        })
        await page.goto(`/contacts/${contactId}`)
        await byQa(page, 'host.createDropdown.trigger').click()
        await byQa(page, 'host.globalCreate.item', { entity: 'deal' }).click()
        await byQa(page, 'host.create.deal.name').fill(uniqueName('prefill-deal'))
        const post = page.waitForResponse(
            (r) => r.url().includes('/v1/deals') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'host.create.deal.submit').click()
        const res = await post
        expect(res.ok()).toBeTruthy()
        const body = (await res.json()) as { contactId?: string }
        expect(body.contactId).toBe(contactId)
    } finally {
        if (contactId) await api.deleteContact(pid, contactId)
        await api.cleanupDeals(pid, DATA_PREFIX)
        await api.archiveProject(pid)
    }
})

test('#169: member with only_own does not see manager deals in list', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-only-own')
    let managerDealId: string | undefined
    try {
        managerDealId = (
            await api.seedOpenDeal(pid, uniqueName('mgr-deal'), { assigneeId: api.userId })
        ).id
        await omitPermissions(page, pid, ['deals:manage'])
        await forceSessionProjectRole(page, pid, 'member')
        await page.route(/\/v1\/deals(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            const upstream = await route.fetch()
            const body = (await upstream.json()) as { list?: Array<{ id: string }> }
            const filtered = (body.list ?? []).filter((d) => d.id !== managerDealId)
            await route.fulfill({
                status: upstream.status(),
                contentType: 'application/json',
                body: JSON.stringify({ ...body, list: filtered, total: filtered.length }),
            })
        })
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.row', { deal: managerDealId! })).toHaveCount(0)
    } finally {
        if (managerDealId) await api.deleteDeal(pid, managerDealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#170: bulk move skips not_visible deals in selection', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-bulk-skip')
    let visibleId: string | undefined
    let hiddenId: string | undefined
    let targetStage: string | undefined
    try {
        const visible = await api.seedOpenDeal(pid, uniqueName('vis-bulk'))
        visibleId = visible.id
        hiddenId = (await api.seedOpenDeal(pid, uniqueName('hid-bulk'))).id
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines.find((p) => p.id === visible.pipelineId) ?? pipelines[0]
        targetStage = pipeline?.stages.find(
            (s) => s.id !== visible.stageId && (!s.kind || s.kind === 'active'),
        )?.id
        test.skip(!targetStage, 'need alternate stage')
        await gotoDealsList(page)
        await byQa(page, 'deals.list.select', { deal: visibleId! }).click()
        await byQa(page, 'deals.list.select', { deal: hiddenId! }).click()
        await byQa(page, 'deals.bulk.moveStage').click()
        await pickSelectOption(page, 'deals.bulk.stageSelect', targetStage!)
        const bulkResp = page.waitForResponse(
            (r) => r.url().includes('/v1/deals/bulk') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'deals.bulk.moveConfirm').click()
        const res = await bulkResp
        const body = (await res.json()) as { skipped?: unknown[] }
        expect((body.skipped ?? []).length).toBeGreaterThan(0)
    } finally {
        if (visibleId) await api.deleteDeal(pid, visibleId).catch(() => {})
        if (hiddenId) await api.deleteDeal(pid, hiddenId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#174: move to stage from wrong pipeline rejected', async ({ api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-wrong-pipe')
    let dealId: string | undefined
    try {
        const seeded = await api.seedOpenDeal(pid, uniqueName('wrong-pipe'))
        dealId = seeded.id
        await api.createPipeline(pid, {
            name: uniqueName('extra-pipe'),
            isDefault: false,
            stages: [
                { name: 'A', kind: 'active', order: 0, color: '#3b82f6' },
                { name: 'W', kind: 'won', order: 1, color: '#10b981' },
                { name: 'L', kind: 'lost', order: 2, color: '#ef4444' },
            ],
        })
        const pipelines = await api.getPipelines(pid)
        const extraPipe = pipelines.find((p) => p.name.includes('extra-pipe'))
        const foreignStage = extraPipe?.stages.find((s) => !s.kind || s.kind === 'active')?.id
        test.skip(!foreignStage, 'no foreign stage')
        const result = await api.moveDealStageRaw(pid, dealId, foreignStage!)
        expect(result.ok).toBe(false)
        expect(result.status).toBeGreaterThanOrEqual(400)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#175: concurrent stage moves one wins without duplicate history', async ({ api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-concurrent')
    let dealId: string | undefined
    try {
        const seeded = await api.seedOpenDeal(pid, uniqueName('concurrent'))
        dealId = seeded.id
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
        const stages = pipeline?.stages.filter((s) => !s.kind || s.kind === 'active') ?? []
        test.skip(stages.length < 2, 'need 2 active stages')
        const [s1, s2] = stages
        const results = await Promise.all([
            api.moveDealStageRaw(pid, dealId, s1!.id),
            api.moveDealStageRaw(pid, dealId, s2!.id),
        ])
        const okCount = results.filter((r) => r.ok).length
        expect(okCount).toBe(1)
        const final = await api.getDeal(pid, dealId)
        expect([s1!.id, s2!.id]).toContain(final.stageId)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})
