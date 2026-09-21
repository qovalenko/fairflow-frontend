import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEALS_MODULES } from '../support/deals'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test('#39: kanban create drawer posts deal and shows card', async ({ page, api, useProject }) => {
    const pid = await api.createProject(uniqueName('kanban-create'), [...DEALS_MODULES])
    await useProject(pid, [...DEALS_MODULES])
    const name = uniqueName('kcreate')
    let dealId: string | undefined
    try {
        await page.goto('/deals/kanban')
        await byQa(page, 'deals.kanban.create').click()
        await byQa(page, 'deals.create.name').fill(name)
        await byQa(page, 'deals.create.amount').fill('1500')
        const post = page.waitForResponse(
            (r) => r.url().includes('/v1/deals') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'deals.create.submit').click()
        const res = await post
        expect(res.ok()).toBeTruthy()
        dealId = ((await res.json()) as { id?: string }).id
        await expect(byQa(page, 'deals.kanban.card', { deal: dealId! })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})
