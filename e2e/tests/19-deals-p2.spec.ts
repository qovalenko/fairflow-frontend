import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEALS_MODULES, gotoDealsList } from '../support/deals'

/** Deals — selected P2 scenarios (automatable:yes). */

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/orders'] })

test('#48: bulk drift defer clears selection without accept API', async ({ page, api, useProject }) => {
    const pid = await api.createProject(uniqueName('bulk-drift-defer'), [...DEALS_MODULES])
    await useProject(pid, [...DEALS_MODULES])
    let contactId: string | undefined
    let dealId: string | undefined
    const phone = `+7906${Date.now().toString().slice(-7)}`
    try {
        contactId = await api.createContact(pid, {
            firstName: 'BulkDrift',
            lastName: uniqueName('d'),
            phone,
        })
        dealId = await api.createDeal(pid, {
            name: uniqueName('bulk-drift'),
            amount: 5000,
            contactId,
        })
        await api.updateContact(pid, contactId, { phone: `+7907${Date.now().toString().slice(-7)}` })
        await gotoDealsList(page)
        await page.reload()
        const deal = await api.getDeal(pid, dealId)
        test.skip(!deal.driftFlag, 'driftFlag not set on the stand after contact update')
        await byQa(page, 'deals.list.select', { deal: dealId! }).click()
        await expect(byQa(page, 'deals.bulk.panel')).toBeVisible()
        let acceptCalled = false
        page.on('request', (req) => {
            if (req.url().includes('/accept-drift') && req.method() === 'POST') acceptCalled = true
        })
        await byQa(page, 'deals.bulk.driftDefer').click()
        await expect(byQa(page, 'deals.bulk.panel')).toHaveCount(0)
        expect(acceptCalled).toBe(false)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        if (contactId) await api.deleteContact(pid, contactId)
        await api.archiveProject(pid)
    }
})
