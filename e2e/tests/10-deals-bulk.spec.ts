import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEALS_MODULES, pickSelectOption } from '../support/deals'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/orders'] })

/** #43 bulk panel; #44 bulk move stage; #45 bulk assign. */
test.describe('deals bulk', () => {
    test('#43: selection shows bulk panel', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('bulk-panel'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let id1: string | undefined
        try {
            id1 = (await api.seedOpenDeal(pid, uniqueName('bulk1'))).id
            await page.goto('/deals')
            await byQa(page, 'deals.list.select', { deal: id1! }).click()
            await expect(byQa(page, 'deals.bulk.panel')).toBeVisible({ timeout: 10_000 })
        } finally {
            if (id1) await api.deleteDeal(pid, id1).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#44: bulk move stage updates deals', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('bulk-move'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let id1: string | undefined
        let id2: string | undefined
        let targetStage: string | undefined
        try {
            const s1 = await api.seedOpenDeal(pid, uniqueName('bm1'))
            const s2 = await api.seedOpenDeal(pid, uniqueName('bm2'))
            id1 = s1.id
            id2 = s2.id
            const pipelines = await api.getPipelines(pid)
            const pipeline = pipelines.find((p) => p.id === s1.pipelineId) ?? pipelines[0]
            targetStage =
                pipeline?.stages.find((s) => s.id !== s1.stageId && (!s.kind || s.kind === 'active'))
                    ?.id ?? pipeline?.stages[1]?.id
            test.skip(!targetStage, 'need alternate stage')

            await page.goto('/deals')
            await byQa(page, 'deals.list.select', { deal: id1! }).click()
            await byQa(page, 'deals.list.select', { deal: id2! }).click()
            await byQa(page, 'deals.bulk.moveStage').click()
            await pickSelectOption(page, 'deals.bulk.stageSelect', targetStage!)
            const bulkResp = page.waitForResponse(
                (r) => r.url().includes('/v1/deals/bulk') && r.request().method() === 'POST',
                { timeout: 20_000 },
            )
            await byQa(page, 'deals.bulk.moveConfirm').click()
            expect((await bulkResp).ok()).toBeTruthy()

            const d1 = await api.getDeal(pid, id1!)
            const d2 = await api.getDeal(pid, id2!)
            expect(d1.stageId).toBe(targetStage)
            expect(d2.stageId).toBe(targetStage)
        } finally {
            if (id1) await api.deleteDeal(pid, id1).catch(() => {})
            if (id2) await api.deleteDeal(pid, id2).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#45: bulk assign sets assignee', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('bulk-assign'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('bassign'))).id
            await page.goto('/deals')
            await byQa(page, 'deals.list.select', { deal: dealId! }).click()
            await byQa(page, 'deals.bulk.assign').click()
            await pickSelectOption(page, 'deals.bulk.assignSelect', api.userId)
            const bulkResp = page.waitForResponse(
                (r) => r.url().includes('/v1/deals/bulk') && r.request().method() === 'POST',
                { timeout: 20_000 },
            )
            await byQa(page, 'deals.bulk.assignConfirm').click()
            expect((await bulkResp).ok()).toBeTruthy()
            const deal = await api.getDeal(pid, dealId!)
            expect(deal.assigneeId).toBe(api.userId)
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
