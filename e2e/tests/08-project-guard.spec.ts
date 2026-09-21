import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { clearProjectContext } from '../support/projectContext'

/**
 * Shell catalog #41 (P0): without active project → minimal chrome (logo + user menu only).
 * Shell catalog #42 (P0): deep-link to CRM without project → guard → /account/projects.
 */
test('#41: без активного проекта SideNav/Create/Search скрыты, Logo + user-menu', async ({
    page,
}) => {
    await page.goto('/account/projects')
    await clearProjectContext(page)
    await page.reload()

    await expect(byQa(page, 'host.userMenu.trigger')).toBeVisible({ timeout: 30_000 })
    await expect(byQa(page, 'host.chrome.logo')).toBeVisible()
    await expect(byQa(page, 'host.createDropdown.trigger')).toHaveCount(0)
    await expect(byQa(page, 'host.search.trigger')).toHaveCount(0)
    await expect(byQa(page, 'host.projectSelector.trigger')).toHaveCount(0)
})

test('#42: deep-link CRM без проекта → guard → /account/projects', async ({ page }) => {
    await page.goto('/account/projects')
    await clearProjectContext(page)

    await page.goto('/deals')
    await expect(page).toHaveURL(/\/account\/projects/, { timeout: 20_000 })
})
