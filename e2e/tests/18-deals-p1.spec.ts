import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { toggleSwitcher } from '../support/ui'
import {
    DEALS_MODULES,
    acceptDialog,
    defaultExtraPipeline,
    gotoDealsKanban,
    gotoDealsList,
    pickSelectOption,
} from '../support/deals'

/**
 * Deals — P1 scenarios (catalog `.e2e-scenario-catalog/deals.md`).
 * Focus: list/kanban filters, close/reopen, stage transitions.
 */

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/orders'] })

async function seedProject(
    api: { createProject: (name: string, modules: string[]) => Promise<string> },
    useProject: (pid: string, modules?: string[]) => Promise<void>,
    label: string,
): Promise<string> {
    const pid = await api.createProject(uniqueName(label), [...DEALS_MODULES])
    await useProject(pid, [...DEALS_MODULES])
    return pid
}

test('#6: trash icon navigates to /deals/trash', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-trash-nav')
    try {
        await gotoDealsList(page)
        await byQa(page, 'deals.list.trash').click()
        await expect(page).toHaveURL(/\/deals\/trash/)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#14: list GET error shows retry', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-list-err')
    let fail = true
    try {
        await page.route(/\/v1\/deals(\?|$)/, async (route) => {
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
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.error')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'deals.list.errorRetry').click()
        await expect(byQa(page, 'deals.list.empty').or(byQa(page, 'deals.list.table'))).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#15: active filters with zero rows offer reset', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-filter-empty')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('visible'))).id
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.row', { deal: dealId })).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'deals.list.search').fill(uniqueName('no-such-deal'))
        await expect(byQa(page, 'deals.list.filteredEmpty')).toBeVisible({ timeout: 20_000 })
        await byQa(page, 'deals.list.resetFilters').click()
        await expect(byQa(page, 'deals.list.row', { deal: dealId })).toBeVisible({ timeout: 20_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#17: pipeline filter narrows list when 2+ pipelines', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-pipe-filter')
    let defaultDealId: string | undefined
    let extraDealId: string | undefined
    try {
        const extra = await api.createPipeline(pid, defaultExtraPipeline(uniqueName('pipe-b')))
        const pipelines = await api.getPipelines(pid)
        const defaultPipe = pipelines.find((p) => p.isDefault) ?? pipelines[0]
        const extraPipe = pipelines.find((p) => p.id === extra.id)
        test.skip(!defaultPipe || !extraPipe, 'need default + extra pipeline')
        const defaultStage =
            defaultPipe!.stages.find((s) => !s.kind || s.kind === 'active') ?? defaultPipe!.stages[0]
        const extraStage =
            extraPipe!.stages.find((s) => !s.kind || s.kind === 'active') ?? extraPipe!.stages[0]
        defaultDealId = (
            await api.seedOpenDeal(pid, uniqueName('in-default'), {
                pipelineId: defaultPipe!.id,
                stageId: defaultStage!.id,
            })
        ).id
        extraDealId = (
            await api.seedOpenDeal(pid, uniqueName('in-extra'), {
                pipelineId: extraPipe!.id,
                stageId: extraStage!.id,
            })
        ).id
        await gotoDealsList(page)
        await pickSelectOption(page, 'deals.list.filter.pipeline', extraPipe!.id)
        await expect(byQa(page, 'deals.list.row', { deal: extraDealId! })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'deals.list.row', { deal: defaultDealId! })).toHaveCount(0)
    } finally {
        if (defaultDealId) await api.deleteDeal(pid, defaultDealId).catch(() => {})
        if (extraDealId) await api.deleteDeal(pid, extraDealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#18: stage filter narrows list', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-stage-filter')
    let onStageA: string | undefined
    let onStageB: string | undefined
    let stageB: string | undefined
    try {
        const seeded = await api.seedOpenDeal(pid, uniqueName('stage-a'))
        onStageA = seeded.id
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
        stageB = pipeline?.stages.find(
            (s) => s.id !== seeded.stageId && (!s.kind || s.kind === 'active'),
        )?.id
        test.skip(!stageB, 'pipeline needs 2+ active stages')
        onStageB = (
            await api.seedOpenDeal(pid, uniqueName('stage-b'), {
                pipelineId: seeded.pipelineId,
                stageId: stageB!,
            })
        ).id
        await gotoDealsList(page)
        await pickSelectOption(page, 'deals.list.filter.stage', stageB!)
        await expect(byQa(page, 'deals.list.row', { deal: onStageB! })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'deals.list.row', { deal: onStageA! })).toHaveCount(0)
    } finally {
        if (onStageA) await api.deleteDeal(pid, onStageA).catch(() => {})
        if (onStageB) await api.deleteDeal(pid, onStageB).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#19: assignee filter narrows list', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-assignee-filter')
    let mineId: string | undefined
    let otherId: string | undefined
    try {
        mineId = (await api.seedOpenDeal(pid, uniqueName('assigned'), { assigneeId: api.userId })).id
        otherId = (await api.seedOpenDeal(pid, uniqueName('unassigned'))).id
        await gotoDealsList(page)
        await pickSelectOption(page, 'deals.list.filter.assignee', api.userId)
        await expect(byQa(page, 'deals.list.row', { deal: mineId! })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'deals.list.row', { deal: otherId! })).toHaveCount(0)
    } finally {
        if (mineId) await api.deleteDeal(pid, mineId).catch(() => {})
        if (otherId) await api.deleteDeal(pid, otherId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#20: source filter narrows list', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-source-filter')
    const sources = await api.listDealSources()
    test.skip(sources.length === 0, 'stand has no deal-sources')
    const sourceName = sources[0]!.name
    let taggedId: string | undefined
    let plainId: string | undefined
    try {
        taggedId = (await api.seedOpenDeal(pid, uniqueName('with-src'), { source: sourceName })).id
        plainId = (await api.seedOpenDeal(pid, uniqueName('no-src'))).id
        await gotoDealsList(page)
        await pickSelectOption(page, 'deals.list.filter.source', sourceName)
        await expect(byQa(page, 'deals.list.row', { deal: taggedId! })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'deals.list.row', { deal: plainId! })).toHaveCount(0)
    } finally {
        if (taggedId) await api.deleteDeal(pid, taggedId).catch(() => {})
        if (plainId) await api.deleteDeal(pid, plainId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#22: stage-days filter sends server query and narrows list', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-days-filter')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('fresh-deal'))).id
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.row', { deal: dealId! })).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'deals.list.filter.stageDays').fill('99999')
        await expect(byQa(page, 'deals.list.row', { deal: dealId! })).toHaveCount(0, {
            timeout: 20_000,
        })
        await byQa(page, 'deals.list.resetFilters').click()
        await expect(byQa(page, 'deals.list.row', { deal: dealId! })).toBeVisible({ timeout: 20_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#23: without-assignee toggle shows ownerless deals only', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-no-owner')
    let ownedId: string | undefined
    let ownerlessId: string | undefined
    try {
        ownedId = (await api.seedOpenDeal(pid, uniqueName('owned'), { assigneeId: api.userId })).id
        ownerlessId = (await api.seedOpenDeal(pid, uniqueName('ownerless'))).id
        await gotoDealsList(page)
        await byQa(page, 'deals.list.without-assignee').click()
        await expect(byQa(page, 'deals.list.row', { deal: ownerlessId! })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'deals.list.row', { deal: ownedId! })).toHaveCount(0)
    } finally {
        if (ownedId) await api.deleteDeal(pid, ownedId).catch(() => {})
        if (ownerlessId) await api.deleteDeal(pid, ownerlessId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#25: only-mine and without-assignee are mutually exclusive', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-mine-excl')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('mine-excl'))).id
        await gotoDealsList(page)
        await byQa(page, 'deals.list.without-assignee').click()
        await expect(byQa(page, 'deals.list.without-assignee', { active: 'true' })).toBeVisible()
        await toggleSwitcher(byQa(page, 'deals.list.only-mine'))
        await expect(byQa(page, 'deals.list.without-assignee', { active: 'false' })).toBeVisible()
        await expect(byQa(page, 'deals.list.without-assignee')).toBeDisabled()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#26: deep-link ?stageId= seeds stage filter on open', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-deeplink-stage')
    let onTarget: string | undefined
    let other: string | undefined
    let targetStage: string | undefined
    try {
        const seeded = await api.seedOpenDeal(pid, uniqueName('other-stage'))
        other = seeded.id
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
        targetStage = pipeline?.stages.find(
            (s) => s.id !== seeded.stageId && (!s.kind || s.kind === 'active'),
        )?.id
        test.skip(!targetStage, 'need alternate stage')
        onTarget = (
            await api.seedOpenDeal(pid, uniqueName('target-stage'), {
                pipelineId: seeded.pipelineId,
                stageId: targetStage!,
            })
        ).id
        await page.goto(`/deals?stageId=${targetStage}`)
        await expect(byQa(page, 'deals.list.row', { deal: onTarget! })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'deals.list.row', { deal: other! })).toHaveCount(0)
    } finally {
        if (onTarget) await api.deleteDeal(pid, onTarget).catch(() => {})
        if (other) await api.deleteDeal(pid, other).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#31: overdue badge in list row', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-overdue-list')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOverdueDeal(pid, uniqueName('overdue'))).id
        await gotoDealsList(page)
        await expect(byQa(page, 'deals.list.overdue', { deal: dealId! })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#59: closed deal drag does not change stage', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-closed-dnd')
    let dealId: string | undefined
    let wonStageId: string | undefined
    let activeStageId: string | undefined
    try {
        const seeded = await api.seedOpenDeal(pid, uniqueName('closed-dnd'))
        dealId = seeded.id
        const pipelines = await api.getPipelines(pid)
        const pipeline = pipelines.find((p) => p.id === seeded.pipelineId) ?? pipelines[0]
        wonStageId = pipeline?.stages.find((s) => s.kind === 'won')?.id
        activeStageId = pipeline?.stages.find(
            (s) => s.id !== wonStageId && (!s.kind || s.kind === 'active'),
        )?.id
        test.skip(!wonStageId || !activeStageId, 'pipeline needs won + active stages')
        await api.closeDeal(pid, dealId, 'won')
        await gotoDealsKanban(page)
        const card = byQa(page, 'deals.kanban.card', { deal: dealId! })
        const targetCol = byQa(page, 'deals.kanban.column', { stage: activeStageId! })
        await expect(card).toBeVisible({ timeout: 30_000 })
        await card.dragTo(targetCol)
        const after = await api.getDeal(pid, dealId!)
        expect(after.stageId).toBe(wonStageId)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#62: kanban client search filters cards', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-k-search')
    let visibleId: string | undefined
    let hiddenId: string | undefined
    const needle = uniqueName('kanban-needle')
    try {
        visibleId = (await api.seedOpenDeal(pid, needle)).id
        hiddenId = (await api.seedOpenDeal(pid, uniqueName('kanban-other'))).id
        await gotoDealsKanban(page)
        await byQa(page, 'deals.kanban.search').fill(needle)
        await expect(byQa(page, 'deals.kanban.card', { deal: visibleId! })).toBeVisible({
            timeout: 20_000,
        })
        await expect(byQa(page, 'deals.kanban.card', { deal: hiddenId! })).toHaveCount(0)
    } finally {
        if (visibleId) await api.deleteDeal(pid, visibleId).catch(() => {})
        if (hiddenId) await api.deleteDeal(pid, hiddenId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#63: kanban assignee filter hides non-matching cards', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-k-assignee')
    let mineId: string | undefined
    let otherId: string | undefined
    try {
        mineId = (await api.seedOpenDeal(pid, uniqueName('k-mine'), { assigneeId: api.userId })).id
        otherId = (await api.seedOpenDeal(pid, uniqueName('k-other'))).id
        await gotoDealsKanban(page)
        await pickSelectOption(page, 'deals.kanban.filter.assignee', api.userId)
        await expect(byQa(page, 'deals.kanban.card', { deal: mineId! })).toBeVisible({
            timeout: 20_000,
        })
        await expect(byQa(page, 'deals.kanban.card', { deal: otherId! })).toHaveCount(0)
    } finally {
        if (mineId) await api.deleteDeal(pid, mineId).catch(() => {})
        if (otherId) await api.deleteDeal(pid, otherId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#64: overdue badge on kanban card', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-k-overdue')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOverdueDeal(pid, uniqueName('k-overdue'))).id
        await gotoDealsKanban(page)
        await expect(byQa(page, 'deals.kanban.overdue', { deal: dealId! })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#68: empty project kanban shows empty state', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-k-empty')
    try {
        await gotoDealsKanban(page)
        await expect(byQa(page, 'deals.kanban.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#69: kanban search hides all cards in columns', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-k-filtered')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('k-visible'))).id
        await gotoDealsKanban(page)
        await expect(byQa(page, 'deals.kanban.card', { deal: dealId! })).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'deals.kanban.search').fill(uniqueName('absent-kanban'))
        await expect(byQa(page, 'deals.kanban.card', { deal: dealId! })).toHaveCount(0, {
            timeout: 20_000,
        })
        await expect(byQa(page, 'deals.kanban.column').first()).toBeVisible()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#70: kanban load error shows retry', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-k-err')
    let fail = true
    try {
        await page.route(/\/v1\/deals\/kanban/, async (route) => {
            if (fail) {
                fail = false
                await route.fulfill({ status: 500, body: 'fail' })
                return
            }
            await route.continue()
        })
        await gotoDealsKanban(page)
        await expect(byQa(page, 'deals.kanban.error')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'deals.kanban.errorRetry').click()
        await expect(byQa(page, 'deals.kanban.empty').or(byQa(page, 'deals.kanban.column'))).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#90: edit form: change pipeline on open deal', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-edit-pipe')
    let dealId: string | undefined
    try {
        const extra = await api.createPipeline(pid, defaultExtraPipeline(uniqueName('pipe-edit')))
        const seeded = await api.seedOpenDeal(pid, uniqueName('pipe-change'))
        dealId = seeded.id
        const pipelines = await api.getPipelines(pid)
        const target = pipelines.find((p) => p.id === extra.id)
        test.skip(!target, 'extra pipeline missing')
        const targetStage = target!.stages.find((s) => !s.kind || s.kind === 'active')
        test.skip(!targetStage, 'extra pipeline has no active stage')
        await page.goto(`/deals/${dealId}/edit`)
        await expect(byQa(page, 'deals.edit.pipeline')).toBeVisible({ timeout: 30_000 })
        await pickSelectOption(page, 'deals.edit.pipeline', target!.id)
        await pickSelectOption(page, 'deals.edit.stage', targetStage!.id)
        const put = page.waitForResponse(
            (r) => r.url().includes(`/v1/deals/${dealId}`) && r.request().method() === 'PUT',
            { timeout: 20_000 },
        )
        await byQa(page, 'deals.edit.save').click()
        expect((await put).ok()).toBeTruthy()
        const updated = await api.getDeal(pid, dealId!)
        expect(updated.pipelineId).toBe(target!.id)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#93: dirty guard on edit cancel', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-edit-dirty')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('dirty-cancel'))).id
        await page.goto(`/deals/${dealId}/edit`)
        await expect(byQa(page, 'deals.edit.notes')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'deals.edit.notes').fill('unsaved note')
        acceptDialog(page)
        await byQa(page, 'deals.edit.cancel').click()
        await expect(page).toHaveURL(new RegExp(`/deals/${dealId}$`), { timeout: 20_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#97: close won without productId is valid', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-won-noproduct')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('won-noprod'))).id
        const before = await api.getDeal(pid, dealId)
        expect(before.productId).toBeFalsy()
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.closeWon').click()
        await byQa(page, 'deals.close.confirm').click()
        await expect(byQa(page, 'deals.details.createSale')).toBeVisible({ timeout: 20_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#102: close lost cancel leaves deal open', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-lost-cancel')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('lost-cancel'))).id
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.closeLost').click()
        await expect(byQa(page, 'deals.close.dialog')).toBeVisible()
        await byQa(page, 'deals.close.cancel').click()
        await expect(byQa(page, 'deals.close.dialog')).toHaveCount(0)
        await expect(byQa(page, 'deals.details.closeWon')).toBeVisible()
        const after = await api.getDeal(pid, dealId!)
        expect(after.status ?? after.result).not.toBe('lost')
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#108: reopen submit disabled without reason and stage', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-reopen-valid')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('reopen-valid'))).id
        await api.closeDeal(pid, dealId, 'lost')
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.reopen').click()
        await expect(byQa(page, 'deals.reopen.dialog')).toBeVisible()
        await expect(byQa(page, 'deals.reopen.submit')).toBeDisabled()
        await byQa(page, 'deals.reopen.reason').fill('valid reason')
        await expect(byQa(page, 'deals.reopen.submit')).toBeDisabled()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#171: closed deal hides move-stage select on card', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'deals-closed-move')
    let dealId: string | undefined
    try {
        dealId = (await api.seedOpenDeal(pid, uniqueName('closed-move'))).id
        await api.closeDeal(pid, dealId, 'won')
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.reopen')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'deals.details.moveStage')).toHaveCount(0)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})
