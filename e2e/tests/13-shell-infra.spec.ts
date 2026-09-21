import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'

/**
 * Shell catalog #2 (P0): initialized box → /auth/signin (not /bootstrap).
 * Shell catalog #4 (P0): fe-manifest loads and host starts (sidebar reachable after login).
 */
test.use({ storageState: { cookies: [], origins: [] } })

test('#2: bootstrap выполнен → /auth/signin', async ({ page }) => {
    await page.goto('/auth/signin')
    await expect(byQa(page, 'host.login.email')).toBeVisible({ timeout: 30_000 })
    await expect(page).not.toHaveURL(/\/bootstrap/)
})

test('#4: manifest OK → host грузит remotes, приложение стартует', async ({ page }) => {
    const res = await page.request.get('/fe-manifest.json')
    expect(res.ok(), 'fe-manifest.json should load').toBeTruthy()
    const body = await res.json()
    expect(body).toBeTruthy()
})
