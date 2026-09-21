import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEALS_MODULES } from '../support/deals'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

/** #161 contact deals widget; #162 click deal → /deals/:id. */
test.describe('contact deals widget', () => {
    test('#161: contact deals widget lists linked deal', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('contact-deals'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let contactId: string | undefined
        let dealId: string | undefined
        try {
            contactId = await api.createContact(pid, {
                firstName: 'Deal',
                lastName: uniqueName('widget'),
                email: `${uniqueName('w')}@example.test`,
            })
            dealId = await api.createDeal(pid, {
                    name: uniqueName('contact-deal'),
                    amount: 1000,
                    contactId,
                })
            await page.goto(`/contacts/${contactId}`)
            await expect(byQa(page, 'contacts.details.dealRow', { deal: dealId! })).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#162: contact widget deal click opens deal card', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('contact-deals-nav'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let contactId: string | undefined
        let dealId: string | undefined
        try {
            contactId = await api.createContact(pid, {
                firstName: 'Deal',
                lastName: uniqueName('nav'),
                email: `${uniqueName('n')}@example.test`,
            })
            dealId = await api.createDeal(pid, {
                    name: uniqueName('contact-deal-nav'),
                    amount: 1000,
                    contactId,
                })
            await page.goto(`/contacts/${contactId}`)
            await byQa(page, 'contacts.details.dealRow', { deal: dealId! }).click()
            await expect(page).toHaveURL(new RegExp(`/deals/${dealId}`))
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })
})
