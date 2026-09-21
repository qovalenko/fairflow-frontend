import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEFAULT_MODULES, seedIndexedContact } from '../support/search'

test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products'],
})

test.describe('Search navigation & isolation P0', () => {
    test('catalog #1: sidebar search nav opens /search', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-nav'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            await page.goto('/contacts')
            await byQa(page, 'host.sidebar.item', { nav: 'portfolio.search' }).click({
                timeout: 30_000,
            })
            await expect(page).toHaveURL(/\/search/, { timeout: 15_000 })
            await expect(byQa(page, 'search.results.page')).toBeVisible({ timeout: 20_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #2: magnifier visible on project screen', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-icon'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            await page.goto('/contacts')
            await expect(byQa(page, 'host.search.trigger')).toBeVisible({ timeout: 20_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #7: results scoped to current project only', async ({ page, api, useProject }) => {
        const sharedName = uniqueName('iso').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
        const pidA = await api.createProject(uniqueName('search-iso-a'), DEFAULT_MODULES)
        const pidB = await api.createProject(uniqueName('search-iso-b'), DEFAULT_MODULES)
        let cA: string | undefined
        let cB: string | undefined
        try {
            cA = await seedIndexedContact(
                api,
                pidA,
                { firstName: sharedName, lastName: 'ProjectA' },
                sharedName,
            )
            cB = await seedIndexedContact(
                api,
                pidB,
                { firstName: sharedName, lastName: 'ProjectB' },
                sharedName,
            )

            await useProject(pidA, DEFAULT_MODULES)
            await page.goto(`/search?q=${sharedName}`)
            await expect(
                byQa(page, 'search.results.hit', { entityType: 'contact', entityId: cA }),
            ).toBeVisible({ timeout: 45_000 })
            await expect(
                byQa(page, 'search.results.hit', { entityType: 'contact', entityId: cB }),
            ).toHaveCount(0)

            await useProject(pidB, DEFAULT_MODULES)
            await page.goto(`/search?q=${sharedName}`)
            await expect(
                byQa(page, 'search.results.hit', { entityType: 'contact', entityId: cB }),
            ).toBeVisible({ timeout: 45_000 })
            await expect(
                byQa(page, 'search.results.hit', { entityType: 'contact', entityId: cA }),
            ).toHaveCount(0)
        } finally {
            if (cA) await api.deleteContact(pidA, cA)
            if (cB) await api.deleteContact(pidB, cB)
            await api.archiveProject(pidA)
            await api.archiveProject(pidB)
        }
    })
})
