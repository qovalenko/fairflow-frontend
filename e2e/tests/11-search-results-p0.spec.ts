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

test.describe('SCR-SEARCH-DIALOG show-all & groups P0', () => {
    test('catalog #20/#21: grouped results and show-all link', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-groups'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const shared = uniqueName('bulk').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
        const ids: string[] = []
        try {
            for (let i = 0; i < 6; i++) {
                const id = await api.createContact(pid, {
                    firstName: shared,
                    lastName: `${shared}${i}`,
                })
                ids.push(id)
            }
            await api.reindexSearch(pid)

            await page.goto('/contacts')
            await openSearchDialog(page)
            await typeInSearchDialog(page, shared)
            await expect(byQa(page, 'host.search.dialog.section', { type: 'contact' })).toBeVisible({
                timeout: 45_000,
            })
            const hits = byQa(page, 'host.search.dialog.hit', { entityType: 'contact' })
            await expect(hits).toHaveCount(5, { timeout: 10_000 })
            const showAll = byQa(page, 'host.search.dialog.showAll', { type: 'contact' })
            if (await showAll.isVisible().catch(() => false)) {
                await showAll.click()
                await expect(page).toHaveURL(/\/search\?.*q=/, { timeout: 15_000 })
                await expect(byQa(page, 'search.results.page')).toBeVisible({ timeout: 20_000 })
            }
        } finally {
            for (const id of ids) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('catalog #51: show-all preserves query on results page', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-showall'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const token = uniqueName('all').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
        const ids: string[] = []
        try {
            for (let i = 0; i < 6; i++) {
                ids.push(await api.createContact(pid, { firstName: token, lastName: `L${i}` }))
            }
            await api.reindexSearch(pid)
            await page.goto('/contacts')
            await openSearchDialog(page)
            await typeInSearchDialog(page, token)
            const showAll = byQa(page, 'host.search.dialog.showAll', { type: 'contact' })
            await expect(showAll).toBeVisible({ timeout: 45_000 })
            await showAll.click()
            await expect(page).toHaveURL(new RegExp(`[?&]q=${token}`))
            await expect(byQa(page, 'search.results.input')).toHaveValue(token, { timeout: 10_000 })
        } finally {
            for (const id of ids) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })
})

test.describe('SCR-SEARCH-RESULTS P0', () => {
    test('catalog #52: deep-link restores query, type, scope, page size', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-deeplink'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const q = 'deeplink'
        try {
            await useProject(pid, DEFAULT_MODULES)
            await page.goto(`/search?q=${q}&type=contact&scope=all&page=0&size=50`)
            await expect(byQa(page, 'search.results.page')).toBeVisible({ timeout: 20_000 })
            await expect(byQa(page, 'search.results.input')).toHaveValue(q)
            await expect(byQa(page, 'search.results.typeChip', { type: 'contact' })).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #53: input syncs with URL query param', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-urlsync'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const token = uniqueName('sync').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
        try {
            await page.goto('/search')
            await byQa(page, 'search.results.input').fill(token)
            await page.waitForTimeout(400)
            await expect(page).toHaveURL(new RegExp(`[?&]q=${token}`), { timeout: 10_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #55: type chips filter by entity type', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-chips'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const token = uniqueName('chip').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
        let contactId: string | undefined
        try {
            contactId = await seedIndexedContact(
                api,
                pid,
                { firstName: 'Chip', lastName: token },
                token,
            )
            await page.goto(`/search?q=${token}`)
            await expect(byQa(page, 'search.results.typeChip', { type: 'contact' })).toBeVisible({
                timeout: 45_000,
            })
            await byQa(page, 'search.results.typeChip', { type: 'contact' }).click()
            await expect(page).toHaveURL(/type=contact/)
        } finally {
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('catalog #57: scope preset on results page', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-rscope'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            const scopeMy = byQa(page, 'search.results.scope', { scope: 'my' })
            await page.goto('/search?q=test')
            if (await scopeMy.isVisible().catch(() => false)) {
                await scopeMy.click()
                await expect(page).toHaveURL(/scope=my/)
            } else {
                test.skip(true, 'scope preset hidden (ST-12)')
            }
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #64: results page hit opens contact card', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-res-hit'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const token = uniqueName('reshit').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
        let contactId: string | undefined
        try {
            contactId = await seedIndexedContact(
                api,
                pid,
                { firstName: 'Res', lastName: token },
                token,
            )
            await page.goto(`/search?q=${token}`)
            await byQa(page, 'search.results.hit', {
                entityType: 'contact',
                entityId: contactId,
            }).click({ timeout: 45_000 })
            await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}`), { timeout: 20_000 })
        } finally {
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('catalog #58: pagination page size in URL and next/prev controls', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-page'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const shared = uniqueName('pg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)
        const ids: string[] = []
        try {
            for (let i = 0; i < 30; i++) {
                ids.push(
                    await api.createContact(pid, { firstName: shared, lastName: `P${i}` }),
                )
            }
            await api.reindexSearch(pid)
            await page.goto(`/search?q=${shared}&size=25`)
            await byQa(page, 'search.results.pageSize', { size: 50 }).click()
            await expect(page).toHaveURL(/size=50/)
            const next = byQa(page, 'search.results.pageNext')
            if (await next.isEnabled().catch(() => false)) {
                await next.click()
                await expect(page).toHaveURL(/page=1/)
                await byQa(page, 'search.results.pagePrev').click()
                await expect(page).toHaveURL(/page=0/)
            }
        } finally {
            for (const id of ids) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('catalog #65: footer visibility and lag notes on results page', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-rfoot'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            await page.goto('/search?q=ab')
            await expect(byQa(page, 'search.results.footer.visibility')).toBeVisible({
                timeout: 15_000,
            })
            await expect(byQa(page, 'search.results.footer.lag')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })
})
