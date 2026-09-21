import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    DEFAULT_MODULES,
    openSearchDialog,
    typeInSearchDialog,
    seedIndexedContact,
} from '../support/search'

test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products'],
})

test.describe('FLOW-SEARCH-STALE-HIT P0', () => {
    test('catalog #43: deleted hit shows toast and stays in search', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-stale'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const token = uniqueName('stale').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
        let contactId: string | undefined
        try {
            contactId = await seedIndexedContact(
                api,
                pid,
                { firstName: 'Stale', lastName: token },
                token,
            )
            await api.deleteContact(pid, contactId)
            contactId = undefined

            await page.goto('/contacts')
            await openSearchDialog(page)
            await typeInSearchDialog(page, token)
            await byQa(page, 'host.search.dialog.hit', { entityType: 'contact' })
                .first()
                .click({ timeout: 45_000 })
            await expect(byQa(page, 'host.search.toast.hitUnavailable')).toBeVisible({
                timeout: 15_000,
            })
            await expect(page).toHaveURL(/\/contacts/)
        } finally {
            await api.archiveProject(pid)
        }
    })
})
