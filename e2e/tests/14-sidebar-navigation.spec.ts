import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'

/**
 * Shell catalog #71 (P0): sidebar built from manifest; click navigates to remote screen.
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test('#71: sidebar manifest item → remote-экран', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('sidebar-nav'), modules)
    await useProject(pid, modules)

    try {
        await page.goto(`/p/${pid}`)
        const contactsItem = byQa(page, 'host.sidebar.item', { nav: 'portfolio.contacts' })
        await expect(contactsItem).toBeVisible({ timeout: 30_000 })
        await contactsItem.click()
        await expect(page).toHaveURL(new RegExp(`/p/${pid}/contacts`), { timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})
