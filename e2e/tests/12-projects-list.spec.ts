import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'

/**
 * Shell catalog #178 (P0): «Создать» on /account/projects opens the create-project wizard.
 */
test('#178: «Создать» на списке проектов → wizard', async ({ page }) => {
    await page.goto('/account/projects')
    await expect(byQa(page, 'host.projectsList.create')).toBeVisible({ timeout: 30_000 })
    await byQa(page, 'host.projectsList.create').click()
    await expect(page).toHaveURL(/\/account\/projects\/new/, { timeout: 15_000 })
    await expect(byQa(page, 'host.createProject.template').first()).toBeVisible({
        timeout: 30_000,
    })
})
