import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName, DATA_PREFIX } from '../support/env'
import { DEALS_MODULES } from '../support/deals'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test('#40: global CreateDropdown opens deal drawer and posts deal', async ({ page, api, useProject }) => {
    const pid = await api.createProject(uniqueName('host-create-deal'), [...DEALS_MODULES])
    await useProject(pid, [...DEALS_MODULES])
    let dealId: string | undefined
    try {
        await page.goto('/deals')
        await byQa(page, 'host.createDropdown.trigger').click()
        await byQa(page, 'host.createDropdown.item', { entity: 'deal' }).click()
        const dealName = `${DATA_PREFIX}header-deal-${Date.now()}`
        await byQa(page, 'host.create.deal.name').fill(dealName)
        await byQa(page, 'host.create.deal.amount').fill('7500')
        const post = page.waitForResponse(
            (r) => r.url().includes('/v1/deals') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'host.create.deal.submit').click()
        const res = await post
        expect(res.ok()).toBeTruthy()
        dealId = ((await res.json()) as { id?: string }).id
        expect(dealId).toBeTruthy()
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})
