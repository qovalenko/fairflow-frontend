import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { STORAGE_KEYS } from '../support/env'

/**
 * Shell catalog #27 (P0): user-menu sign-out clears session → sign-in.
 */
test('#27: FLOW-SHELL-SIGNOUT «Выйти» → очистка сессии → sign-in', async ({ page }) => {
    await page.goto('/account/projects')
    await expect(byQa(page, 'host.userMenu.trigger')).toBeVisible({ timeout: 30_000 })

    await byQa(page, 'host.userMenu.trigger').click()
    await byQa(page, 'host.userMenu.signOut').click()

    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 20_000 })

    const token = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.token)
    expect(token, 'JWT cleared after sign-out').toBeFalsy()
})
