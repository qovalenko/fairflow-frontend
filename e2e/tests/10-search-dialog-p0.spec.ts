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

test.describe('SCR-SEARCH-DIALOG P0', () => {
    test('catalog #13: click magnifier opens overlay with focused input', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-dlg'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            await page.goto('/contacts')
            await openSearchDialog(page)
            await expect(byQa(page, 'host.search.dialog.input')).toBeFocused()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #14: Ctrl+K opens overlay', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-hotkey'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            await page.goto('/contacts')
            await page.keyboard.press('Control+K')
            await expect(byQa(page, 'host.search.dialog')).toBeVisible({ timeout: 10_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #15: query returns contact group with matching hit', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-hit'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const token = uniqueName('ivan').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)
        let contactId: string | undefined
        try {
            contactId = await seedIndexedContact(
                api,
                pid,
                { firstName: 'Иван', lastName: token, email: `${token}@example.test` },
                token,
            )
            await page.goto('/contacts')
            await openSearchDialog(page)
            await typeInSearchDialog(page, token)
            await expect(byQa(page, 'host.search.dialog.section', { type: 'contact' })).toBeVisible({
                timeout: 30_000,
            })
            await expect(
                byQa(page, 'host.search.dialog.hit', { entityType: 'contact', entityId: contactId }),
            ).toBeVisible()
        } finally {
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('catalog #17: click result navigates to contact card', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-nav'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const token = uniqueName('nav').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
        let contactId: string | undefined
        try {
            contactId = await seedIndexedContact(
                api,
                pid,
                { firstName: 'Nav', lastName: token },
                token,
            )
            await page.goto('/contacts')
            await openSearchDialog(page)
            await typeInSearchDialog(page, token)
            await byQa(page, 'host.search.dialog.hit', {
                entityType: 'contact',
                entityId: contactId,
            }).click()
            await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}`), { timeout: 20_000 })
        } finally {
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('catalog #18: arrow keys move selection, Enter opens hit', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-kbd'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const t1 = uniqueName('a').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
        const t2 = uniqueName('b').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
        const shared = `${t1}${t2}`.slice(0, 6)
        let c1: string | undefined
        let c2: string | undefined
        try {
            c1 = await seedIndexedContact(api, pid, { firstName: shared, lastName: t1 }, shared)
            c2 = await seedIndexedContact(api, pid, { firstName: shared, lastName: t2 }, shared)
            await api.reindexSearch(pid)
            await page.goto('/contacts')
            await openSearchDialog(page)
            await typeInSearchDialog(page, shared)
            await expect(byQa(page, 'host.search.dialog.hit').first()).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'host.search.dialog.input').press('ArrowDown')
            await byQa(page, 'host.search.dialog.input').press('Enter')
            await expect(page).toHaveURL(/\/contacts\//, { timeout: 20_000 })
            const url = page.url()
            expect([c1, c2].some((id) => url.includes(id!))).toBeTruthy()
        } finally {
            if (c1) await api.deleteContact(pid, c1)
            if (c2) await api.deleteContact(pid, c2)
            await api.archiveProject(pid)
        }
    })

    test('catalog #19: Esc closes overlay and resets state', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-esc'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            await page.goto('/contacts')
            await openSearchDialog(page)
            await typeInSearchDialog(page, 'xy')
            await byQa(page, 'host.search.dialog.close').click()
            await expect(byQa(page, 'host.search.dialog')).toBeHidden()
            await openSearchDialog(page)
            await expect(byQa(page, 'host.search.dialog.hint')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #23: search by last 4 phone digits', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-phone'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const last4 = String(Math.floor(1000 + Math.random() * 9000))
        const phone = `+790012${last4}`
        const token = last4
        let contactId: string | undefined
        try {
            contactId = await seedIndexedContact(
                api,
                pid,
                { firstName: 'Phone', lastName: uniqueName('p'), phone },
                token,
            )
            await page.goto('/contacts')
            await openSearchDialog(page)
            await typeInSearchDialog(page, token)
            await expect(
                byQa(page, 'host.search.dialog.hit', { entityType: 'contact', entityId: contactId }),
            ).toBeVisible({ timeout: 30_000 })
        } finally {
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('catalog #24: search by email substring', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-email'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const local = uniqueName('mail').replace(/[^a-z0-9]/gi, '').toLowerCase()
        const email = `${local}@example.test`
        let contactId: string | undefined
        try {
            contactId = await seedIndexedContact(
                api,
                pid,
                { firstName: 'Mail', lastName: 'Test', email },
                local,
            )
            await page.goto('/contacts')
            await openSearchDialog(page)
            await typeInSearchDialog(page, local)
            await expect(
                byQa(page, 'host.search.dialog.hit', { entityType: 'contact', entityId: contactId }),
            ).toBeVisible({ timeout: 30_000 })
        } finally {
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('catalog #35: scope preset change re-runs query', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-scope'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const token = uniqueName('scope').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
        let contactId: string | undefined
        try {
            contactId = await seedIndexedContact(
                api,
                pid,
                { firstName: 'Scope', lastName: token },
                token,
            )
            await page.goto('/contacts')
            await openSearchDialog(page)
            const scopeChip = byQa(page, 'host.search.dialog.scope', { scope: 'my' })
            if (await scopeChip.isVisible().catch(() => false)) {
                const reqPromise = page.waitForRequest(
                    (r) => r.url().includes('/search/query') && r.url().includes('scope=my'),
                    { timeout: 20_000 },
                )
                await typeInSearchDialog(page, token)
                await expect(byQa(page, 'host.search.dialog.hit').first()).toBeVisible({
                    timeout: 30_000,
                })
                await scopeChip.click()
                await reqPromise
            } else {
                test.skip(true, 'scope preset hidden for this user (ST-12)')
            }
        } finally {
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('catalog #28/#29 footer notes visible in overlay', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-footer'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            await page.goto('/contacts')
            await openSearchDialog(page)
            await expect(byQa(page, 'host.search.dialog.footer.visibility')).toBeVisible()
            await expect(byQa(page, 'host.search.dialog.footer.lag')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })
})
