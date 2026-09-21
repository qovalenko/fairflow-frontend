import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEALS_MODULES } from '../support/deals'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

/** #88 edit save; #89 closed deal notes editable. */
test.describe('deals edit', () => {
    test('#88: load edit form and save notes', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('edit-save'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        const note = `e2e-note-${Date.now()}`
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('editsave'))).id
            await page.goto(`/deals/${dealId}/edit`)
            await expect(byQa(page, 'deals.edit.save')).toBeVisible({ timeout: 30_000 })
            await byQa(page, 'deals.edit.notes').fill(note)
            const put = page.waitForResponse(
                (r) => r.url().includes(`/v1/deals/${dealId}`) && r.request().method() === 'PUT',
                { timeout: 20_000 },
            )
            await byQa(page, 'deals.edit.save').click()
            expect((await put).ok()).toBeTruthy()
            await expect(page).toHaveURL(new RegExp(`/deals/${dealId}$`))
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#89: closed deal: funnel fields disabled, notes editable', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('edit-closed'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('closededit'))).id
            await api.closeDeal(pid, dealId, 'won')
            await page.goto(`/deals/${dealId}/edit`)
            await expect(byQa(page, 'deals.edit.pipeline')).toBeDisabled()
            await expect(byQa(page, 'deals.edit.stage')).toBeDisabled()
            await expect(byQa(page, 'deals.edit.amount')).toBeDisabled()
            await byQa(page, 'deals.edit.notes').fill('closed-note')
            await byQa(page, 'deals.edit.save').click()
            await expect(page).toHaveURL(new RegExp(`/deals/${dealId}$`), { timeout: 20_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
