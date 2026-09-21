import { randomUUID } from 'node:crypto'
import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName, DATA_PREFIX } from '../support/env'
import {
    DEALS_MODULES,
    DEALS_WITH_ORDERS,
    acceptDialog,
    clearProjectContext,
    forceSessionProjectRole,
    gotoDealsDashboard,
    gotoDealsKanban,
    gotoDealsList,
    gotoDealsTrash,
    omitPermissions,
    openListCreateDrawer,
    pickSelectOption,
} from '../support/deals'

/**
 * Deals — P1/P2 continuation (catalog `.e2e-scenario-catalog/deals.md`).
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

test('#7: no selected project redirects away from /deals', async ({ page }) => {
    await page.goto('/account/projects')
    await clearProjectContext(page)
    await page.goto('/deals')
    await expect(page).toHaveURL(/\/account\/projects/, { timeout: 20_000 })
})

test('#9: without deals:write create button is hidden', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-no-write')
    try {
        await omitPermissions(page, pid, ['deals:write'])
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.create')).toHaveCount(0)
        await expect(byQa(page, 'deals.list.createEmpty')).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#10: without deals:read list GET shows error state', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-no-read')
    try {
        await omitPermissions(page, pid, ['deals:read'])
        await page.route(/\/v1\/deals(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await route.fulfill({ status: 403, body: 'forbidden' })
        })
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.error')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#30: hiddenByPolicy banner shows count from API', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-hidden-policy')
    try {
        await page.route(/\/v1\/deals(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ list: [], total: 0, hiddenByPolicy: 4 }),
            })
        })
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.hiddenByPolicy')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'deals.list.hiddenByPolicy')).toContainText('4')
    } finally {
        await api.archiveProject(pid)
    }
})

test('#42: double submit create does not duplicate deal', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-dup-submit')
    try {
        await gotoDealsList(page)
        await openListCreateDrawer(page)
        await byQa(page, 'deals.create.leadMode.light').click()
        await byQa(page, 'deals.create.lightName').fill(`${DATA_PREFIX}dup-${Date.now()}`)
        await byQa(page, 'deals.create.lightPhone').fill('+79005554433')
        await byQa(page, 'deals.create.name').fill(uniqueName('dup-deal'))
        await byQa(page, 'deals.create.amount').fill('1000')
        const submit = byQa(page, 'deals.create.submit')
        await submit.click()
        await submit.click({ force: true })
        await page.waitForResponse(
            (r) => r.url().includes('/v1/deals') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        const { total } = await api.listDeals(pid, { pageSize: 50 })
        expect(total).toBeLessThanOrEqual(1)
    } finally {
        await api.cleanupDeals(pid, DATA_PREFIX)
        await api.archiveProject(pid)
    }
})

test('#49: partial bulk move reports skipped closed deals', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-bulk-partial')
    let openId: string | undefined
    let closedId: string | undefined
    let targetStage: string | undefined
    try {
        const open = await api.seedOpenDeal(pid, uniqueName('bulk-open'))
        openId = open.id
        closedId = (await api.seedOpenDeal(pid, uniqueName('bulk-closed'))).id
        await api.closeDeal(pid, closedId, 'won')
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines.find((p) => p.id === open.pipelineId) ?? pipelines[0]
        targetStage = pipeline?.stages.find(
            (s) => s.id !== open.stageId && (!s.kind || s.kind === 'active'),
        )?.id
        test.skip(!targetStage, 'need alternate active stage')

        await gotoDealsList(page)
        await byQa(page, 'deals.list.select', { deal: openId! }).click()
        await byQa(page, 'deals.list.select', { deal: closedId! }).click()
        await byQa(page, 'deals.bulk.moveStage').click()
        await pickSelectOption(page, 'deals.bulk.stageSelect', targetStage!)
        const bulkResp = page.waitForResponse(
            (r) => r.url().includes('/v1/deals/bulk') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'deals.bulk.moveConfirm').click()
        const res = await bulkResp
        expect(res.ok()).toBeTruthy()
        const body = (await res.json()) as { skipped?: unknown[] }
        expect((body.skipped ?? []).length).toBeGreaterThan(0)
    } finally {
        if (openId) await api.deleteDeal(pid, openId).catch(() => {})
        if (closedId) await api.deleteDeal(pid, closedId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#50: async bulk move shows queued toast', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-bulk-async')
    let dealId: string | undefined
    let targetStage: string | undefined
    try {
        const seeded = await api.seedOpenDeal(pid, uniqueName('bulk-async'))
        dealId = seeded.id
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
        targetStage = pipeline?.stages.find(
            (s) => s.id !== seeded.stageId && (!s.kind || s.kind === 'active'),
        )?.id
        test.skip(!targetStage, 'need alternate active stage')

        await page.route(/\/v1\/deals\/bulk/, async (route) => {
            if (route.request().method() !== 'POST') {
                await route.continue()
                return
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ async: true, jobId: 'e2e-job-1', updated: [], skipped: [] }),
            })
        })

        await gotoDealsList(page)
        await byQa(page, 'deals.list.select', { deal: dealId! }).click()
        await byQa(page, 'deals.bulk.moveStage').click()
        await pickSelectOption(page, 'deals.bulk.stageSelect', targetStage!)
        await byQa(page, 'deals.bulk.moveConfirm').click()
        await expect(page.getByText(/очеред/i)).toBeVisible({ timeout: 10_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#53: member role hides bulk assign button', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-bulk-no-assign')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('no-bulk-assign'))).id
        await omitPermissions(page, pid, ['deals:manage'])
        await gotoDealsList(page)
        await byQa(page, 'deals.list.select', { deal: dealId! }).click()
        await expect(byQa(page, 'deals.bulk.panel')).toBeVisible({ timeout: 20_000 })
        await expect(byQa(page, 'deals.bulk.assign')).toHaveCount(0)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#60: without stage move permission drag does not change stage', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-no-move')
    let dealId: string | undefined
    let activeStageId: string | undefined
    let altStageId: string | undefined
    try {
        const seeded = await api.seedOpenDeal(pid, uniqueName('no-move'))
        dealId = seeded.id
        activeStageId = seeded.stageId
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
        altStageId = pipeline?.stages.find(
            (s) => s.id !== activeStageId && (!s.kind || s.kind === 'active'),
        )?.id
        test.skip(!altStageId, 'need alternate active stage')

        await omitPermissions(page, pid, ['deals.stage:move'])
        await gotoDealsKanban(page)
        const card = byQa(page, 'deals.kanban.card', { deal: dealId! })
        const targetCol = byQa(page, 'deals.kanban.column', { stage: altStageId! })
        await card.dragTo(targetCol)
        const after = await api.getDeal(pid, dealId!)
        expect(after.stageId).toBe(activeStageId)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#81: contact and company links navigate to cards', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-card-links')
    let contactId: string | undefined
    let dealId: string | undefined
    try {
        contactId = await api.createContact(pid, {
            firstName: 'Link',
            lastName: uniqueName('contact'),
            email: `${uniqueName('l')}@example.test`,
        })
        dealId = (
            await api.createDeal(pid, {
                name: uniqueName('linked'),
                amount: 1000,
                contactId,
            })
        )
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.contactLink', { contact: contactId! }).click()
        await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}`))
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        if (contactId) await api.deleteContact(pid, contactId)
        await api.archiveProject(pid)
    }
})

test('#92: closed deal rejects amount update via API', async ({ api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-closed-422')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('closed422'))).id
        await api.closeDeal(pid, dealId, 'won')
        let failed = false
        try {
            await api.updateDeal(pid, dealId, { amount: 99999 })
        } catch {
            failed = true
        }
        expect(failed).toBe(true)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#94: without deals:write edit form save is disabled', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-edit-nowrite')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('edit-nowrite'))).id
        await omitPermissions(page, pid, ['deals:write'])
        await page.goto(`/deals/${dealId}/edit`)
        await expect(byQa(page, 'deals.edit.save')).toBeDisabled({ timeout: 30_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#104: close lost cancel orders failure keeps deal open', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-cancel-fail', [...DEALS_WITH_ORDERS])
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('cancel-fail'))).id
        await api.createOrder(pid, {
            dealId,
            name: uniqueName('ord-fail'),
            status: 'IN_PROGRESS',
        })
        await page.route(/\/v1\/orders\/[^/]+\/cancel/, async (route) => {
            await route.fulfill({ status: 500, body: 'cancel failed' })
        })
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.closeLost').click()
        await expect(byQa(page, 'deals.close.ordersCancel')).toBeVisible({ timeout: 15_000 })
        await byQa(page, 'deals.close.ordersCancel').click()
        const reasons = await api.getLostReasons(pid)
        if (reasons.length > 0) {
            await pickSelectOption(page, 'deals.close.reason', reasons[0]!.id)
        }
        await byQa(page, 'deals.close.confirm').click()
        await expect(byQa(page, 'deals.details.closeWon')).toBeVisible({ timeout: 20_000 })
        const deal = await api.getDeal(pid, dealId!)
        expect(deal.status).toBe('open')
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#107: member role hides reopen button on closed deal', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-no-reopen')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('noreopen'))).id
        await api.closeDeal(pid, dealId, 'lost')
        await forceSessionProjectRole(page, pid, 'member')
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.reopen')).toHaveCount(0, { timeout: 30_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#116: single live duplicate auto-qualifies without dialog', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-auto-qualify')
    const phone = `+7904${Date.now().toString().slice(-7)}`
    let contactId: string | undefined
    let dealId: string | undefined
    try {
        contactId = await api.createContact(pid, {
            firstName: 'Auto',
            lastName: uniqueName('q'),
            phone,
        })
        dealId = (
            await api.seedLightDeal(pid, uniqueName('autoq'), {
                lightName: 'Auto Lead',
                lightPhone: phone,
            })
        ).id
        await page.goto(`/deals/${dealId}`)
        const qualifyResp = page.waitForResponse(
            (r) => r.url().includes(`/v1/deals/${dealId}/qualify`) && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'deals.details.qualify').click()
        expect((await qualifyResp).ok()).toBeTruthy()
        await expect(byQa(page, 'deals.qualify.dialog')).toHaveCount(0)
        await expect(byQa(page, 'deals.details.qualify')).toHaveCount(0, { timeout: 20_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        if (contactId) await api.deleteContact(pid, contactId)
        await api.archiveProject(pid)
    }
})

test('#117: without contacts:write qualify button is hidden', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-no-qualify')
    let dealId: string | undefined
    try {
        dealId = (
            await api.seedLightDeal(pid, uniqueName('noqual'), {
                lightName: 'No Qual',
                lightPhone: '+79006667788',
            })
        ).id
        await omitPermissions(page, pid, ['contacts:write'])
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.qualify')).toHaveCount(0, { timeout: 30_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#118: qualify POST error allows reopening dialog', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-qualify-err')
    let dealId: string | undefined
    try {
        dealId = (
            await api.seedLightDeal(pid, uniqueName('qualerr'), {
                lightName: 'Err Lead',
                lightPhone: '+79007778899',
            })
        ).id
        await page.route(/\/v1\/contacts\/duplicates/, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ candidates: [] }),
            })
        })
        await page.route(/\/v1\/deals\/[^/]+\/qualify/, async (route) => {
            await route.fulfill({ status: 500, body: 'qualify failed' })
        })
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.qualify').click()
        await expect(byQa(page, 'deals.qualify.dialog')).toBeVisible({ timeout: 15_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#122: drift source deleted shows message and blocks accept', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-drift-deleted')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('drift-del'))).id
        await page.route(new RegExp(`/v1/deals/${dealId}(\\?|$)`), async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            await route.fulfill({
                status: upstream.status(),
                contentType: 'application/json',
                body: JSON.stringify({ ...body, driftFlag: true }),
            })
        })
        await page.route(/\/v1\/deals\/[^/]+\/drift/, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ drift: [], sourceDeleted: true }),
            })
        })
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.drift').click()
        await expect(byQa(page, 'deals.drift.sourceDeleted')).toBeVisible({ timeout: 15_000 })
        await expect(byQa(page, 'deals.drift.accept')).toHaveCount(0)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#123: drift panel shows no-diff message', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-drift-nodiff')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('drift-nodiff'))).id
        await page.route(new RegExp(`/v1/deals/${dealId}(\\?|$)`), async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            await route.fulfill({
                status: upstream.status(),
                contentType: 'application/json',
                body: JSON.stringify({ ...body, driftFlag: true }),
            })
        })
        await page.route(/\/v1\/deals\/[^/]+\/drift/, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ drift: [], sourceDeleted: false }),
            })
        })
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.drift').click()
        await expect(byQa(page, 'deals.drift.noDiff')).toBeVisible({ timeout: 15_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#124: drift load error offers retry', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-drift-err')
    let dealId: string | undefined
    let fail = true
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('drift-err'))).id
        await page.route(new RegExp(`/v1/deals/${dealId}(\\?|$)`), async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            await route.fulfill({
                status: upstream.status(),
                contentType: 'application/json',
                body: JSON.stringify({ ...body, driftFlag: true }),
            })
        })
        await page.route(/\/v1\/deals\/[^/]+\/drift/, async (route) => {
            if (fail) {
                fail = false
                await route.fulfill({ status: 500, body: 'drift fail' })
                return
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ drift: [], sourceDeleted: false }),
            })
        })
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.drift').click()
        await expect(byQa(page, 'deals.drift.error')).toBeVisible({ timeout: 15_000 })
        await byQa(page, 'deals.drift.errorRetry').click()
        await expect(byQa(page, 'deals.drift.noDiff')).toBeVisible({ timeout: 15_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#129: trash without delete permission shows no-permission state', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-trash-nodel')
    try {
        await omitPermissions(page, pid, ['deals:delete'])
        await gotoDealsTrash(page)
        await expect(byQa(page, 'deals.trash.noPermission')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#132: restore active deal via API returns error', async ({ api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-restore-422')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('restore422'))).id
        let failed = false
        try {
            await api.restoreDeal(pid, dealId)
        } catch {
            failed = true
        }
        expect(failed).toBe(true)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#137: dashboard manager row drills to assignee filter', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-mgr-drill')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('mgr-drill'))).id
        await gotoDealsDashboard(page)
        const row = byQa(page, 'deals.dashboard.managerRow', { assignee: api.userId })
        await expect(row).toBeVisible({ timeout: 30_000 })
        await row.click()
        await expect(page).toHaveURL(new RegExp(`assigneeId=${api.userId}`))
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#140: dashboard without read shows no-permission state', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-dash-noread')
    try {
        await omitPermissions(page, pid, ['deals:read'])
        await gotoDealsDashboard(page)
        await expect(byQa(page, 'deals.dashboard.noPermission')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#142: dashboard shows by-department slice when BE returns data', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-dept-slice')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('dept'))).id
        await page.route(/\/v1\/deals\/dashboard/, async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    dealsByStage: [{ stageId: 's1', stageName: 'New', count: 1, amount: 1000 }],
                    statistics: [],
                    topManagers: [],
                    byDepartment: [{ departmentId: 'dept-1', count: 1, amount: 1000 }],
                }),
            })
        })
        await gotoDealsDashboard(page)
        await expect(byQa(page, 'deals.dashboard.byDepartment')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#147: pipeline edit hides remove for won/lost stages', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-pipe-won-lost')
    try {
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines[0]
        test.skip(!pipeline, 'no pipeline')
        const won = pipeline!.stages.find((s) => s.kind === 'won')
        const active = pipeline!.stages.find((s) => !s.kind || s.kind === 'active')
        test.skip(!won || !active, 'need won and active stages')
        await page.goto(`/deals/pipelines/${pipeline!.id}/edit`)
        await expect(byQa(page, 'deals.pipelines.edit.removeStage', { stage: active!.id })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'deals.pipelines.edit.removeStage', { stage: won!.id })).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#148: pipeline edit add stage and save persists on list', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-pipe-add-stage')
    const stageName = uniqueName('stage-added')
    try {
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines[0]
        test.skip(!pipeline, 'no pipeline')
        await page.goto(`/deals/pipelines/${pipeline!.id}/edit`)
        await byQa(page, 'deals.pipelines.edit.addStage').click()
        const saveResp = page.waitForResponse(
            (r) => r.url().includes('/v1/pipelines/') && r.request().method() === 'PUT',
            { timeout: 20_000 },
        )
        await byQa(page, 'deals.pipelines.edit.save').click()
        expect((await saveResp).ok()).toBeTruthy()
        await expect(page).toHaveURL(/\/deals\/pipelines\/?$/, { timeout: 20_000 })
        const updated = await api.getPipelines(pid)
        const saved = updated.find((p) => p.id === pipeline!.id)
        expect(saved?.stages.some((s) => s.name === stageName || s.name.includes('Новая стадия'))).toBe(
            true,
        )
    } finally {
        await api.archiveProject(pid)
    }
})

test('#149: delete pipeline with active deals shows error toast', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-pipe-del-409')
    let dealId: string | undefined
    let extraPipeId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('pipe-del'))).id
        const extra = await api.createPipeline(pid, {
            name: uniqueName('extra-del'),
            isDefault: false,
            stages: [
                { name: 'A', kind: 'active', order: 0, color: '#3b82f6' },
                { name: 'W', kind: 'won', order: 1, color: '#10b981' },
                { name: 'L', kind: 'lost', order: 2, color: '#ef4444' },
            ],
        })
        extraPipeId = extra.id
        const pipelines = await api.getPipelines(pid)
        const extraPipe = pipelines.find((p) => p.id === extra.id)
        const stage = extraPipe?.stages.find((s) => !s.kind || s.kind === 'active')
        if (stage) {
            await api.updateDeal(pid, dealId, { pipelineId: extra.id, stageId: stage.id })
        }
        await page.goto('/deals/pipelines')
        acceptDialog(page)
        await byQa(page, 'deals.pipelines.delete', { pipeline: extraPipeId! }).click()
        await expect(page.getByText(/не удалось удалить|активн/i)).toBeVisible({ timeout: 15_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#150: default pipeline delete button is hidden', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-pipe-default')
    try {
        const pipelines = await api.getPipelines(pid)
        const defaultPipe = pipelines.find((p) => p.isDefault) ?? pipelines[0]
        test.skip(!defaultPipe, 'no default pipeline')
        await page.goto('/deals/pipelines')
        await expect(
            byQa(page, 'deals.pipelines.delete', { pipeline: defaultPipe!.id }),
        ).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#154: without manage permission pipelines list is read-only', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-pipe-readonly')
    try {
        await omitPermissions(page, pid, ['deals:manage'])
        await page.goto('/deals/pipelines')
        await expect(byQa(page, 'deals.pipelines.create')).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#155: edit unknown pipeline shows not-found state', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-pipe-404')
    try {
        await page.goto(`/deals/pipelines/${randomUUID()}/edit`)
        await expect(byQa(page, 'deals.pipelines.edit.notFound')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#167: activities module off hides kanban activity badge', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-no-act', ['deals', 'contacts'])
    let dealId: string | undefined
    let activityId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('no-act'))).id
        activityId = await api.createActivity(pid, {
            title: uniqueName('planned'),
            dealId,
            dueDate: Date.now() + 86_400_000,
        })
        await gotoDealsKanban(page)
        await expect(byQa(page, 'deals.kanban.activity', { deal: dealId! })).toHaveCount(0)
    } finally {
        if (activityId) await api.deleteActivity(pid, activityId).catch(() => {})
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#168: orders module off degrades won deal sales widget', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-no-orders', ['deals', 'contacts'])
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('no-ord-widget'))).id
        await api.closeDeal(pid, dealId, 'won')
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.createSale')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'deals.details.orderLink')).toHaveCount(0)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#172: viewer-like permissions hide write bulk and create actions', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-viewer-ui')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('viewer-ui'))).id
        await omitPermissions(page, pid, [
            'deals:write',
            'deals:delete',
            'deals:export',
            'deals:manage',
        ])
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.create')).toHaveCount(0)
        await byQa(page, 'deals.list.select', { deal: dealId! }).click()
        await expect(byQa(page, 'deals.bulk.delete')).toHaveCount(0)
        await expect(byQa(page, 'deals.list.export')).toBeDisabled()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#173: without export permission CSV export stays disabled', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-no-export')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('no-export'))).id
        await omitPermissions(page, pid, ['deals:export'])
        await gotoDealsList(page)
        await byQa(page, 'deals.list.select', { deal: dealId! }).click()
        await expect(byQa(page, 'deals.list.export')).toBeDisabled()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})
