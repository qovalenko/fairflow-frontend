import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName, DATA_PREFIX } from '../support/env'
import { DEALS_MODULES, gotoDealsList, openListCreateDrawer, pickSelectOption } from '../support/deals'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test('#36: quick-create contact mode posts deal and shows row', async ({ page, api, useProject }) => {
    const pid = await api.createProject(uniqueName('deals-create-contact'), [...DEALS_MODULES])
    await useProject(pid, [...DEALS_MODULES])

    const contactLast = uniqueName('dc').replace(/[^a-zA-Z0-9-]/g, '')
    let contactId: string | undefined
    let dealId: string | undefined

    try {
        contactId = await api.createContact(pid, {
            firstName: 'E2E',
            lastName: contactLast,
            email: `${contactLast}@example.test`,
        })

        await gotoDealsList(page)
        await openListCreateDrawer(page)
        await pickSelectOption(page, 'deals.create.contact', contactId!)
        await byQa(page, 'deals.create.name').fill(`${DATA_PREFIX}deal-contact-${Date.now()}`)
        await byQa(page, 'deals.create.amount').fill('5000')

        const post = page.waitForResponse(
            (r) => r.url().includes('/v1/deals') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'deals.create.submit').click()
        const res = await post
        expect(res.ok()).toBeTruthy()
        dealId = ((await res.json()) as { id?: string }).id
        expect(dealId).toBeTruthy()
        await expect(byQa(page, 'deals.list.row', { deal: dealId! })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        if (contactId) await api.deleteContact(pid, contactId)
        await api.archiveProject(pid)
    }
})

test('#37: quick-create light lead without contact posts deal', async ({ page, api, useProject }) => {
    const pid = await api.createProject(uniqueName('deals-create-lead'), [...DEALS_MODULES])
    await useProject(pid, [...DEALS_MODULES])
    let dealId: string | undefined

    try {
        await gotoDealsList(page)
        await openListCreateDrawer(page)
        await byQa(page, 'deals.create.leadMode.light').click()
        await byQa(page, 'deals.create.lightName').fill(`${DATA_PREFIX}lead-${Date.now()}`)
        await byQa(page, 'deals.create.lightPhone').fill('+79001112233')
        await byQa(page, 'deals.create.name').fill(`${DATA_PREFIX}deal-lead-${Date.now()}`)
        await byQa(page, 'deals.create.amount').fill('3000')

        const post = page.waitForResponse(
            (r) => r.url().includes('/v1/deals') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'deals.create.submit').click()
        const res = await post
        expect(res.ok()).toBeTruthy()
        dealId = ((await res.json()) as { id?: string }).id
        expect(dealId).toBeTruthy()
        await expect(byQa(page, 'deals.list.row', { deal: dealId! })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})
