import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEALS_MODULES } from '../support/deals'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

/** #55 kanban load; #56 drag stage; #57 drop won; #58 drop lost; #67 card click. */
test.describe('deals kanban', () => {
    test('#55: kanban loads columns and cards', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('kanban-load'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('kcard'))).id
            await page.goto('/deals/kanban')
            await expect(byQa(page, 'deals.kanban.card', { deal: dealId! })).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'deals.kanban.column').first()).toBeVisible()
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#67: card click opens deal details', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('kanban-click'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('kclick'))).id
            await page.goto('/deals/kanban')
            await byQa(page, 'deals.kanban.card', { deal: dealId! }).click()
            await expect(page).toHaveURL(new RegExp(`/deals/${dealId}`))
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#56: drag between active stages moves deal', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('kanban-dnd'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        let fromStage: string | undefined
        let toStage: string | undefined
        try {
            const seeded = await api.seedOpenDeal(pid, uniqueName('drag'))
            dealId = seeded.id
            fromStage = seeded.stageId
            const pipelines = await api.getPipelines(pid)
            const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
            const active = (pipeline?.stages ?? []).filter(
                (s) => !s.kind || s.kind === 'active',
            )
            toStage = active.find((s) => s.id !== fromStage)?.id
            test.skip(!toStage, 'pipeline needs 2+ active stages')

            await page.goto('/deals/kanban')
            const card = byQa(page, 'deals.kanban.card', { deal: dealId! })
            const targetCol = byQa(page, 'deals.kanban.column', { stage: toStage! })
            await expect(card).toBeVisible({ timeout: 30_000 })
            const moveResp = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/deals/${dealId}/stage`) &&
                    r.request().method() === 'PUT',
                { timeout: 20_000 },
            )
            await card.dragTo(targetCol)
            expect((await moveResp).ok()).toBeTruthy()
            const moved = await api.getDeal(pid, dealId!)
            expect(moved.stageId).toBe(toStage)
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#57: drop on won column opens close-won dialog', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('kanban-won'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        let wonStageId: string | undefined
        try {
            const seeded = await api.seedOpenDeal(pid, uniqueName('woncol'))
            dealId = seeded.id
            const pipelines = await api.getPipelines(pid)
            const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
            wonStageId = pipeline?.stages.find((s) => s.kind === 'won')?.id
            test.skip(!wonStageId, 'pipeline has no won terminal stage')

            await page.goto('/deals/kanban')
            const card = byQa(page, 'deals.kanban.card', { deal: dealId! })
            const wonCol = byQa(page, 'deals.kanban.column', { stage: wonStageId! })
            await card.dragTo(wonCol)
            await expect(byQa(page, 'deals.close.dialog')).toBeVisible({ timeout: 15_000 })
            await byQa(page, 'deals.close.confirm').click()
            await expect(page).toHaveURL(new RegExp(`/deals/${dealId}`), { timeout: 20_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#58: drop on lost column opens close-lost dialog', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('kanban-lost'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        let lostStageId: string | undefined
        try {
            const seeded = await api.seedOpenDeal(pid, uniqueName('lostcol'))
            dealId = seeded.id
            const pipelines = await api.getPipelines(pid)
            const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
            lostStageId = pipeline?.stages.find((s) => s.kind === 'lost')?.id
            test.skip(!lostStageId, 'pipeline has no lost terminal stage')

            await page.goto('/deals/kanban')
            const card = byQa(page, 'deals.kanban.card', { deal: dealId! })
            const lostCol = byQa(page, 'deals.kanban.column', { stage: lostStageId! })
            await card.dragTo(lostCol)
            await expect(byQa(page, 'deals.close.dialog')).toBeVisible({ timeout: 15_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
