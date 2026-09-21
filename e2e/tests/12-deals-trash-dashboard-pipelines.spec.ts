import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEALS_MODULES, gotoDealsList, acceptDialog } from '../support/deals'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

/** #127 trash list; #128 restore; #133 dashboard; #136 drill-down; #144–#146 pipelines. */
test.describe('deals trash dashboard pipelines', () => {
    test('#127: trash lists soft-deleted deal', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('trash-list'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('trashme'))).id
            await page.goto(`/deals/${dealId}`)
            acceptDialog(page)
            await byQa(page, 'deals.details.delete').click()
            await expect(page).toHaveURL(/\/deals\/?$/, { timeout: 20_000 })

            await page.goto('/deals/trash')
            await expect(byQa(page, 'deals.trash.row', { deal: dealId! })).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#128: restore from trash returns deal to list', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('trash-restore'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('restoreme'))).id
            await page.goto(`/deals/${dealId}`)
            acceptDialog(page)
            await byQa(page, 'deals.details.delete').click()
            await page.goto('/deals/trash')
            await expect(byQa(page, 'deals.trash.row', { deal: dealId! })).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'deals.trash.restore', { deal: dealId! }).click()
            await gotoDealsList(page)
            await expect(byQa(page, 'deals.list.row', { deal: dealId! })).toBeVisible({
                timeout: 20_000,
            })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#133: dashboard loads KPI block', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('dash-load'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('dashdeal'))).id
            await page.goto('/deals/dashboard')
            await expect(byQa(page, 'deals.dashboard.root')).toBeVisible({ timeout: 30_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#136: drill-down stage navigates to filtered list', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('dash-drill'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        let stageId: string | undefined
        try {
            const seeded = await api.seedOpenDeal(pid, uniqueName('drill'))
            dealId = seeded.id
            stageId = seeded.stageId
            await page.goto('/deals/dashboard')
            await expect(byQa(page, 'deals.dashboard.root')).toBeVisible({ timeout: 30_000 })
            const stageRow = byQa(page, 'deals.dashboard.stageRow', { stage: stageId! })
            await expect(stageRow).toBeVisible({ timeout: 20_000 })
            await stageRow.click()
            await expect(page).toHaveURL(new RegExp(`stageId=${stageId}`))
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#144: pipelines list shows stage dots', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('pipe-list'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        try {
            const pipelines = await api.getPipelines(pid)
            const pipeline = pipelines[0]
            test.skip(!pipeline, 'no pipeline in project')
            await page.goto('/deals/pipelines')
            await expect(byQa(page, 'deals.pipelines.create')).toBeVisible({ timeout: 30_000 })
            await expect(
                byQa(page, 'deals.pipelines.stages', { pipeline: pipeline!.id }),
            ).toBeVisible()
            await expect(
                byQa(page, 'deals.pipelines.stageDot', {
                    pipeline: pipeline!.id,
                    stage: pipeline!.stages[0]!.id,
                }),
            ).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#145: create pipeline via UI', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('pipe-create'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        const pipeName = uniqueName('pipe-new')
        try {
            await page.goto('/deals/pipelines')
            await byQa(page, 'deals.pipelines.create').click()
            await expect(byQa(page, 'deals.pipelines.edit.root')).toBeVisible({ timeout: 20_000 })
            await byQa(page, 'deals.pipelines.edit.name').fill(pipeName)
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/pipelines') && r.request().method() === 'POST',
                { timeout: 20_000 },
            )
            await byQa(page, 'deals.pipelines.edit.save').click()
            expect((await post).ok()).toBeTruthy()
            await expect(page).toHaveURL(/\/deals\/pipelines\/?$/, { timeout: 20_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#146: edit pipeline loads form by id', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('pipe-edit'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let pipelineId: string | undefined
        try {
            const pipelines = await api.getPipelines(pid)
            pipelineId = pipelines[0]?.id
            test.skip(!pipelineId, 'no pipeline')
            await page.goto(`/deals/pipelines/${pipelineId}/edit`)
            await expect(byQa(page, 'deals.pipelines.edit.root')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'deals.pipelines.edit.name')).not.toHaveValue('')
        } finally {
            await api.archiveProject(pid)
        }
    })
})
