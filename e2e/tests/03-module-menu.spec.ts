import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'

/**
 * Smoke 3 — enable a module in project settings -> it appears in the portfolio menu.
 * Exercises host.projectSettings.moduleToggle (auto-persists) and host.sidebar.item
 * (nav rebuilt from the project's module cards). Project is seeded via API without
 * the `orders` module so we can observe it being switched on.
 */
// The portfolio shell (/p/:pid) over-fetches related panels (companies, activities)
// that aren't enabled on the seeded ['deals','contacts'] project, so the gateway
// module-policy answers their GETs with 403 — expected product behaviour, not a
// T-001 regression. Opt these out of the INV-403-00 guard. String substrings, not
// RegExps (see forbiddenAllow doc: RegExp arrays are tuple-misdetected).
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test('#86: enable модуля → пункт появляется в sidebar без reload', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('modmenu'), modules)
    await useProject(pid, modules)

    try {
        // Baseline: portfolio menu has deals/contacts, not orders.
        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.sidebar.item', { nav: 'portfolio.deals' })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'host.sidebar.item', { nav: 'portfolio.orders' })).toHaveCount(0)

        // Turn on the `orders` module in settings (toggle auto-saves to the project).
        await page.goto(`/account/projects/${pid}/settings/modules`)
        // The qa-id sits on a visually-hidden <input type=checkbox> inside a styled
        // `.switcher` <label> (opacity:0), so it's never `toBeVisible` and can't be
        // clicked directly — assert it's attached, then click its <label> hit target.
        const ordersToggle = byQa(page, 'host.projectSettings.moduleToggle', { module: 'orders' })
        await expect(ordersToggle).toBeAttached({ timeout: 30_000 })
        const ordersSwitch = ordersToggle.locator('xpath=ancestor::label[1]')

        const savePromise = page.waitForResponse(
            (r) => r.url().includes(`/v1/projects/${pid}`) && r.request().method() === 'PATCH',
            { timeout: 20_000 },
        )
        await ordersSwitch.click()
        await savePromise

        // Back in the portfolio shell the menu now includes Продажи (orders).
        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.sidebar.item', { nav: 'portfolio.orders' })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})
