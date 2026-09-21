import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEFAULT_MODULES } from '../support/search'

test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products'],
})

/** P1 scenarios with automatable: yes — quick coverage after P0. */
test.describe('Search P1 (automatable yes)', () => {
    test('catalog #16: query shorter than minQueryChars shows hint, no search', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('search-p1-min'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            await page.goto('/contacts')
            await byQa(page, 'host.search.trigger').click()
            await byQa(page, 'host.search.dialog.input').fill('x')
            await page.waitForTimeout(400)
            await expect(byQa(page, 'host.search.dialog.hint')).toBeVisible()
            await expect(byQa(page, 'host.search.dialog.loading')).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #27: empty search shows ST-4 message', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-p1-empty'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const nonsense = uniqueName('nohit').replace(/[^a-zA-Z0-9]/g, '')
        try {
            await page.goto('/contacts')
            await byQa(page, 'host.search.trigger').click()
            await byQa(page, 'host.search.dialog.input').fill(nonsense)
            await page.waitForTimeout(800)
            await expect(byQa(page, 'host.search.dialog.empty')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #62: empty q on results page shows ST-3 hint', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-p1-st3'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            await page.goto('/search')
            await expect(byQa(page, 'search.results.hint')).toBeVisible({ timeout: 15_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #63: no hits shows ST-4 on results page', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-p1-st4'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        const q = uniqueName('empty').replace(/[^a-zA-Z0-9]/g, '')
        try {
            await page.goto(`/search?q=${q}`)
            await expect(byQa(page, 'search.results.empty')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('catalog #71: first overlay open shows ST-3 hint', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search-p1-first'), DEFAULT_MODULES)
        await useProject(pid, DEFAULT_MODULES)
        try {
            await page.goto('/contacts')
            await byQa(page, 'host.search.trigger').click()
            await expect(byQa(page, 'host.search.dialog.hint')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })
})
