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

test.describe('SCR-SEARCH-SETTINGS P0', () => {
    test('catalog #74: search settings tab loads current settings', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-set'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            await page.goto(`/account/projects/${pid}/settings?tab=module:search`)
            await expect(byQa(page, 'search.settings.page')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'search.settings.form')).toBeVisible({ timeout: 20_000 })
            await expect(byQa(page, 'search.settings.minQueryChars')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #77: change minQueryChars, save shows success toast', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-minq'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            const before = await api.getSearchSettings(pid)
            await page.goto(`/account/projects/${pid}/settings?tab=module:search`)
            await expect(byQa(page, 'search.settings.minQueryChars')).toBeVisible({
                timeout: 30_000,
            })
            const current = Number(before.minQueryChars ?? 2)
            const next = current === 2 ? 3 : 2
            await byQa(page, 'search.settings.minQueryChars').fill(String(next))
            await byQa(page, 'search.settings.save').click()
            await expect(byQa(page, 'search.settings.toast.saved')).toBeVisible({
                timeout: 15_000,
            })
            await api.putSearchSettings(pid, { ...before, minQueryChars: current })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #78: perTypeLimit affects overlay row count', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-ptl'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const shared = uniqueName('lim').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
        const ids: string[] = []
        try {
            for (let i = 0; i < 4; i++) {
                ids.push(
                    await api.createContact(pid, { firstName: shared, lastName: `L${i}` }),
                )
            }
            await api.reindexSearch(pid)
            const settings = await api.getSearchSettings(pid)
            await api.putSearchSettings(pid, { ...settings, perTypeLimit: 2 })
            await page.goto('/contacts')
            await openSearchDialog(page)
            await typeInSearchDialog(page, shared)
            await expect(byQa(page, 'host.search.dialog.hit', { entityType: 'contact' })).toHaveCount(
                2,
                { timeout: 45_000 },
            )
            await api.putSearchSettings(pid, { ...settings, perTypeLimit: settings.perTypeLimit ?? 5 })
        } finally {
            for (const id of ids) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('catalog #87: index status shows count, last event, lag and SLA', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-status'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            await page.goto(`/account/projects/${pid}/settings?tab=module:search`)
            await expect(byQa(page, 'search.settings.status')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'search.settings.status.indexedCount')).toBeVisible({
                timeout: 20_000,
            })
            await expect(byQa(page, 'search.settings.status.lastEvent')).toBeVisible()
            await expect(byQa(page, 'search.settings.status.lagMs')).toBeVisible()
            await expect(byQa(page, 'search.settings.status.freshnessSla')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #92/#98: reindex success toast and search finds records', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-reidx'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const token = uniqueName('reidx').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
        let contactId: string | undefined
        try {
            contactId = await api.createContact(pid, {
                firstName: 'Reidx',
                lastName: token,
            })
            await page.goto(`/account/projects/${pid}/settings?tab=module:search`)
            await expect(byQa(page, 'search.settings.reindex')).toBeVisible({ timeout: 30_000 })
            await byQa(page, 'search.settings.reindex').click()
            await expect(byQa(page, 'search.settings.toast.reindexOk')).toBeVisible({
                timeout: 60_000,
            })
            await page.goto(`/search?q=${token}`)
            await expect(
                byQa(page, 'search.results.hit', { entityType: 'contact', entityId: contactId }),
            ).toBeVisible({ timeout: 45_000 })
        } finally {
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })
})
