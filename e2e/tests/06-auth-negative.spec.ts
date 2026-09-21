import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { ADMIN_EMAIL } from '../support/env'

/**
 * Shell catalog #22 (P0): wrong credentials → danger alert (ST-7).
 */
test.use({ storageState: { cookies: [], origins: [] } })

test('#22: E1 неверные credentials → Alert danger', async ({ page }) => {
    await page.goto('/auth/signin')
    await expect(byQa(page, 'host.login.email')).toBeVisible({ timeout: 30_000 })

    await byQa(page, 'host.login.email').fill(ADMIN_EMAIL)
    await byQa(page, 'host.login.password').fill('definitely-wrong-password')
    await byQa(page, 'host.login.submit').click()

    await expect(byQa(page, 'host.login.error')).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/auth\/signin/)
})
