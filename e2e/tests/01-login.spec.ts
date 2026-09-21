import { test, expect } from '../fixtures/test'
import { signInViaUi } from '../support/login'

/**
 * Smoke 1 — login. Runs a CLEAN login (no reused storageState) to exercise the
 * real auth flow end-to-end (host.login.* -> gateway /v1/auth/login -> token).
 * signInViaUi retries the submit to absorb the stand's transient login 401.
 */
test.use({ storageState: { cookies: [], origins: [] } })

test('#21: успешный вход email+password → JWT в localStorage → редирект через Home', async ({
    page,
}) => {
    await signInViaUi(page)

    const token = await page.evaluate(() => localStorage.getItem('token'))
    expect(token, 'JWT persisted to localStorage after login').toBeTruthy()
})
