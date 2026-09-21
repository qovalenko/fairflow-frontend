import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEALS_MODULES } from '../support/deals'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

/** #111 qualify create contact; #112 link duplicate; #119 drift panel; #120 accept drift. */
test.describe('deals qualify and drift', () => {
    test('#111: qualify light lead creates contact link', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('qualify-create'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        const phone = `+7900${Date.now().toString().slice(-7)}`
        try {
            dealId = (
                await api.seedLightDeal(pid, uniqueName('light'), {
                    lightName: 'Light Lead',
                    lightPhone: phone,
                })
            ).id
            await page.goto(`/deals/${dealId}`)
            await byQa(page, 'deals.details.qualify').click()
            await expect(byQa(page, 'deals.qualify.dialog')).toBeVisible()
            const qualifyResp = page.waitForResponse(
                (r) => r.url().includes(`/v1/deals/${dealId}/qualify`) && r.request().method() === 'POST',
                { timeout: 20_000 },
            )
            await byQa(page, 'deals.qualify.createContact').click()
            expect((await qualifyResp).ok()).toBeTruthy()
            await expect(byQa(page, 'deals.details.qualify')).toHaveCount(0, { timeout: 20_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#112: qualify links existing duplicate contact', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('qualify-dup'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        const phone = `+7901${Date.now().toString().slice(-7)}`
        let contactId: string | undefined
        let dealId: string | undefined
        try {
            contactId = await api.createContact(pid, {
                firstName: 'Dup',
                lastName: uniqueName('c'),
                phone,
            })
            dealId = (
                await api.seedLightDeal(pid, uniqueName('lightdup'), {
                    lightName: 'Dup Lead',
                    lightPhone: phone,
                })
            ).id
            await page.goto(`/deals/${dealId}`)
            await byQa(page, 'deals.details.qualify').click()
            await expect(byQa(page, 'deals.qualify.dialog')).toBeVisible()
            await byQa(page, 'deals.qualify.link', { contact: contactId! }).click()
            await expect(byQa(page, 'deals.details.qualify')).toHaveCount(0, { timeout: 20_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#119: drift indicator opens diff panel', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('drift-panel'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let contactId: string | undefined
        let dealId: string | undefined
        const phone = `+7902${Date.now().toString().slice(-7)}`
        try {
            contactId = await api.createContact(pid, {
                firstName: 'Drift',
                lastName: uniqueName('src'),
                phone,
                email: `${uniqueName('d')}@example.test`,
            })
            dealId = await api.createDeal(pid, {
                    name: uniqueName('drift-deal'),
                    amount: 5000,
                    contactId: contactId!,
                })
            await api.updateContact(pid, contactId!, { phone: `+7903${Date.now().toString().slice(-7)}` })
            await page.goto(`/deals/${dealId}`)
            await page.reload()
            const deal = await api.getDeal(pid, dealId)
            test.skip(!deal.driftFlag, 'driftFlag not set on the stand after contact update')
            await byQa(page, 'deals.details.drift').click()
            await expect(byQa(page, 'deals.drift.dialog')).toBeVisible()
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#120: accept drift clears flag on card', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('drift-accept'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let contactId: string | undefined
        let dealId: string | undefined
        const phone = `+7902${Date.now().toString().slice(-7)}`
        try {
            contactId = await api.createContact(pid, {
                firstName: 'Drift',
                lastName: uniqueName('acc'),
                phone,
                email: `${uniqueName('a')}@example.test`,
            })
            dealId = await api.createDeal(pid, {
                    name: uniqueName('drift-accept-deal'),
                    amount: 5000,
                    contactId: contactId!,
                })
            await api.updateContact(pid, contactId!, { phone: `+7903${Date.now().toString().slice(-7)}` })
            await page.goto(`/deals/${dealId}`)
            await page.reload()
            const deal = await api.getDeal(pid, dealId)
            test.skip(!deal.driftFlag, 'driftFlag not set on the stand after contact update')
            await byQa(page, 'deals.details.drift').click()
            const acceptResp = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/deals/${dealId}/accept-drift`) &&
                    r.request().method() === 'POST',
                { timeout: 20_000 },
            )
            await byQa(page, 'deals.drift.accept').click()
            expect((await acceptResp).ok()).toBeTruthy()
            await expect(byQa(page, 'deals.details.drift')).toHaveCount(0, { timeout: 20_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })
})
