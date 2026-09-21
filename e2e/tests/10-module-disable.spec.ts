import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'

/**
 * Shell catalog #72 (P0): disabled module disappears from sidebar without reload.
 * Shell catalog #87 (P0): disable module removes sidebar item; open module route redirects.
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/orders'] })

test('#72: модуль выключен → пункт исчезает без reload', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts', 'orders']
    const pid = await api.createProject(uniqueName('mod-off'), modules)
    await useProject(pid, modules)

    try {
        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.sidebar.item', { nav: 'portfolio.orders' })).toBeVisible({
            timeout: 30_000,
        })

        await page.goto(`/account/projects/${pid}/settings/modules`)
        const ordersToggle = byQa(page, 'host.projectSettings.moduleToggle', { module: 'orders' })
        await expect(ordersToggle).toBeAttached({ timeout: 30_000 })
        const ordersSwitch = ordersToggle.locator('xpath=ancestor::label[1]')

        const savePromise = page.waitForResponse(
            (r) => r.url().includes(`/v1/projects/${pid}`) && r.request().method() === 'PATCH',
            { timeout: 20_000 },
        )
        await ordersSwitch.click()
        await savePromise

        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.sidebar.item', { nav: 'portfolio.orders' })).toHaveCount(0, {
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#87: disable модуля + открытый экран → redirect с модуля', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts', 'orders']
    const pid = await api.createProject(uniqueName('mod-off-redirect'), modules)
    await useProject(pid, modules)

    try {
        await api.updateProjectModules(pid, ['deals', 'contacts'])
        await page.goto(`/p/${pid}/orders`)
        await expect(page).not.toHaveURL(/\/orders/, { timeout: 30_000 })
        await expect(byQa(page, 'host.sidebar.item', { nav: 'portfolio.orders' })).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})
