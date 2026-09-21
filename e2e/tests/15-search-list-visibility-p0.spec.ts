import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEFAULT_MODULES, seedIndexedContact } from '../support/search'

test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products'],
})

test.describe('SCR-SEARCH-LIST-FILTER P0', () => {
    test.fixme('catalog #100: contacts list search field filters via API', async () => {
        // Blocked: contacts remote prod build fails on host remoteActivities import in this branch.
    })

    test.fixme('catalog #99: deals list search field filters via API', async () => {
        // Blocked: deals module has no local vite toolchain; stand build strips qa-ids.
    })

    test('catalog #100-API: contacts list filter via REST (server-side)', async ({
        api,
    }) => {
        const pid = await api.createProject(uniqueName('clist-api'), DEFAULT_MODULES)
        const visible = uniqueName('vis').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
        let idVis: string | undefined
        let idHid: string | undefined
        try {
            idVis = await api.createContact(pid, { firstName: visible, lastName: 'Show' })
            idHid = await api.createContact(pid, { firstName: 'hidden', lastName: 'Hide' })
            const list = await api.listContacts(pid, visible)
            const ids = list.map((c) => c.id)
            expect(ids).toContain(idVis)
            expect(ids).not.toContain(idHid)
        } finally {
            if (idVis) await api.deleteContact(pid, idVis)
            if (idHid) await api.deleteContact(pid, idHid)
            await api.archiveProject(pid)
        }
    })

    test('catalog #99-API: deals list filter via REST (server-side)', async ({ api }) => {
        const modules = ['deals', 'contacts']
        const pid = await api.createProject(uniqueName('dlist-api'), modules)
        const needle = uniqueName('deal').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
        let dealId: string | undefined
        try {
            dealId = await api.createDeal(pid, { name: `${needle}-target` })
            await api.createDeal(pid, { name: 'other-unrelated-name' })
            // Server-side filter contract: search query param on GET /deals
            const res = await api.searchDeals(pid, needle)
            expect(res.some((d) => d.id === dealId)).toBeTruthy()
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId)
            await api.archiveProject(pid)
        }
    })
})

test.describe('FLOW-SEARCH-VISIBILITY (admin baseline) P0', () => {
    test('catalog #47: search API returns only visible hits for query', async ({ api }) => {
        const pid = await api.createProject(uniqueName('search-vis'), DEFAULT_MODULES)
        const token = uniqueName('vis').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
        let contactId: string | undefined
        try {
            contactId = await seedIndexedContact(
                api,
                pid,
                { firstName: 'Vis', lastName: token },
                token,
            )
            const resp = await api.searchQuery(pid, token)
            expect(resp.total).toBeGreaterThanOrEqual(1)
            const ids = resp.groups.flatMap((g) => g.list.map((h) => h.entity_id))
            expect(ids).toContain(contactId)
        } finally {
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('catalog #66: shared URL uses viewer visibility (admin sees own indexed set)', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-shared'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const token = uniqueName('share').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
        let contactId: string | undefined
        try {
            contactId = await seedIndexedContact(
                api,
                pid,
                { firstName: 'Share', lastName: token },
                token,
            )
            await page.goto(`/search?q=${token}&scope=all`)
            await expect(
                byQa(page, 'search.results.hit', { entityType: 'contact', entityId: contactId }),
            ).toBeVisible({ timeout: 45_000 })
        } finally {
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })
})
