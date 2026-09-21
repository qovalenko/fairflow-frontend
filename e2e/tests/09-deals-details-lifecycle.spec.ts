import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    DEALS_MODULES,
    DEALS_WITH_ORDERS,
    acceptDialog,
    pickSelectOption,
} from '../support/deals'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/orders'] })

/** #71 card; #75 edit; #76 move stage; #77/#126 delete; #83; #96; #98; #100; #101; #106 reopen. */
test.describe('deals details lifecycle', () => {
    test('#71: open deal card shows header actions', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('det-view'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('view'))).id
            await page.goto(`/deals/${dealId}`)
            await expect(byQa(page, 'deals.details.edit')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'deals.details.closeWon')).toBeVisible()
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#75: edit navigates to edit form', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('det-edit'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('editnav'))).id
            await page.goto(`/deals/${dealId}`)
            await byQa(page, 'deals.details.edit').click()
            await expect(page).toHaveURL(new RegExp(`/deals/${dealId}/edit`))
            await expect(byQa(page, 'deals.edit.save')).toBeVisible({ timeout: 20_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#76: move stage on card via select', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('det-move'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        let targetStage: string | undefined
        try {
            const seeded = await api.seedOpenDeal(pid, uniqueName('movecard'))
            dealId = seeded.id
            const pipelines = await api.getPipelines(pid)
            const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
            targetStage = pipeline?.stages.find(
                (s) => s.id !== seeded.stageId && (!s.kind || s.kind === 'active'),
            )?.id
            test.skip(!targetStage, 'need alternate active stage')

            await page.goto(`/deals/${dealId}`)
            const moveResp = page.waitForResponse(
                (r) => r.url().includes(`/v1/deals/${dealId}/stage`) && r.request().method() === 'PUT',
                { timeout: 20_000 },
            )
            await pickSelectOption(page, 'deals.details.moveStage', targetStage!)
            expect((await moveResp).ok()).toBeTruthy()
            const updated = await api.getDeal(pid, dealId!)
            expect(updated.stageId).toBe(targetStage)
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#96: close won from card', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('det-won'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('closewon'))).id
            await page.goto(`/deals/${dealId}`)
            await byQa(page, 'deals.details.closeWon').click()
            await expect(byQa(page, 'deals.close.dialog')).toBeVisible()
            await byQa(page, 'deals.close.confirm').click()
            await expect(byQa(page, 'deals.details.createSale')).toBeVisible({ timeout: 20_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#98: close lost requires reason when dictionary non-empty', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('det-lost-reason'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            const reasons = await api.getLostReasons(pid)
            test.skip(reasons.length === 0, 'stand has no lost-reasons seed')
            dealId = (await api.seedOpenDeal(pid, uniqueName('lostreason'))).id
            await page.goto(`/deals/${dealId}`)
            await byQa(page, 'deals.details.closeLost').click()
            await expect(byQa(page, 'deals.close.dialog')).toBeVisible()
            await expect(byQa(page, 'deals.close.confirm')).toBeDisabled()
            await pickSelectOption(page, 'deals.close.reason', reasons[0]!.id)
            await expect(byQa(page, 'deals.close.confirm')).toBeEnabled()
            await byQa(page, 'deals.close.confirm').click()
            await expect(byQa(page, 'deals.details.reopen')).toBeVisible({ timeout: 20_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#101: close lost keeps pending orders', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('det-lost-keep'), [...DEALS_WITH_ORDERS])
        await useProject(pid, [...DEALS_WITH_ORDERS])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('lostkeep'))).id
            await api.createOrder(pid, {
                dealId,
                name: uniqueName('ord-keep'),
                status: 'IN_PROGRESS',
            })
            await page.goto(`/deals/${dealId}`)
            await byQa(page, 'deals.details.closeLost').click()
            await expect(byQa(page, 'deals.close.ordersKeep')).toBeVisible({ timeout: 15_000 })
            await byQa(page, 'deals.close.ordersKeep').click()
            const reasons = await api.getLostReasons(pid)
            if (reasons.length > 0) {
                await pickSelectOption(page, 'deals.close.reason', reasons[0]!.id)
            }
            await byQa(page, 'deals.close.confirm').click()
            await expect(byQa(page, 'deals.details.reopen')).toBeVisible({ timeout: 20_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#100: close lost cancels pending orders', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('det-lost-cancel'), [...DEALS_WITH_ORDERS])
        await useProject(pid, [...DEALS_WITH_ORDERS])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('lostcancel'))).id
            await api.createOrder(pid, {
                dealId,
                name: uniqueName('ord-cancel'),
                status: 'IN_PROGRESS',
            })
            await page.goto(`/deals/${dealId}`)
            await byQa(page, 'deals.details.closeLost').click()
            await expect(byQa(page, 'deals.close.ordersCancel')).toBeVisible({ timeout: 15_000 })
            await byQa(page, 'deals.close.ordersCancel').click()
            const reasons = await api.getLostReasons(pid)
            if (reasons.length > 0) {
                await pickSelectOption(page, 'deals.close.reason', reasons[0]!.id)
            }
            const cancelResp = page.waitForResponse(
                (r) => r.url().includes('/v1/orders/') && r.url().includes('/cancel') && r.request().method() === 'POST',
                { timeout: 20_000 },
            )
            await byQa(page, 'deals.close.confirm').click()
            await cancelResp
            await expect(byQa(page, 'deals.details.reopen')).toBeVisible({ timeout: 20_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#83: won deal shows create sale CTA', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('det-sale'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('salecta'))).id
            await api.closeDeal(pid, dealId, 'won')
            await page.goto(`/deals/${dealId}`)
            await expect(byQa(page, 'deals.details.createSale')).toBeVisible({ timeout: 30_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#77: delete from card redirects to deals list', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('det-del'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('delme'))).id
            await page.goto(`/deals/${dealId}`)
            acceptDialog(page)
            await byQa(page, 'deals.details.delete').click()
            await expect(page).toHaveURL(/\/deals\/?$/, { timeout: 20_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#126: soft delete from card removes deal from list', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('det-del-list'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('delme-list'))).id
            await page.goto(`/deals/${dealId}`)
            acceptDialog(page)
            await byQa(page, 'deals.details.delete').click()
            await expect(page).toHaveURL(/\/deals\/?$/, { timeout: 20_000 })
            await expect(byQa(page, 'deals.list.row', { deal: dealId! })).toHaveCount(0, {
                timeout: 20_000,
            })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#106: reopen closed deal (manager)', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('det-reopen'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        let targetStage: string | undefined
        try {
            const seeded = await api.seedOpenDeal(pid, uniqueName('reopen'))
            dealId = seeded.id
            targetStage = seeded.stageId
            await api.closeDeal(pid, dealId, 'lost')
            await page.goto(`/deals/${dealId}`)
            await byQa(page, 'deals.details.reopen').click()
            await byQa(page, 'deals.reopen.reason').fill('E2E reopen test')
            await pickSelectOption(page, 'deals.reopen.stage', targetStage!)
            await byQa(page, 'deals.reopen.submit').click()
            await expect(byQa(page, 'deals.details.closeWon')).toBeVisible({ timeout: 20_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
