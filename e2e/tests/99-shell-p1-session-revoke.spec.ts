import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { ADMIN_EMAIL, ADMIN_PASSWORD } from '../support/env'
import { clearSession, revokeCurrentPageSession } from '../support/shell'
import { signInViaApi, signInViaUi } from '../support/login'

/**
 * Session-scoped shell scenarios — MUST run last in the shell suite.
 * Any extra `/v1/auth/login` or session revoke invalidates auth.setup storageState
 * for subsequent specs on single-session stands.
 */
test.describe('Shell P1 session edge cases (run last)', () => {
    test.describe.configure({ mode: 'serial' })

    test('#14: сессия истекла на / → sign-in', async ({ page }) => {
        await page.goto('/account/projects')
        await clearSession(page)
        await page.goto('/')
        await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 20_000 })
    })

    test.fixme(
        '#26: BUG post-login redirectUrl=/account/projects игнорируется — Home уводит на /dashboard',
        async ({ page }) => {
            await signInViaUi(page)
            await clearSession(page)
            await page.goto('/account/projects')
            await expect(page).toHaveURL(/\/auth\/signin\?redirectUrl=/, { timeout: 20_000 })

            await byQa(page, 'host.login.email').fill(ADMIN_EMAIL)
            await byQa(page, 'host.login.password').fill(ADMIN_PASSWORD)
            await byQa(page, 'host.login.submit').click()
            await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 30_000 })
            await expect(page).toHaveURL(/\/account\/projects/, { timeout: 30_000 })
        },
    )

    test('#173: revoke текущей сессии → re-auth ST-21', async ({ page }) => {
        await signInViaApi(page)
        await expect
            .poll(async () => page.evaluate(() => localStorage.getItem('token')), {
                timeout: 30_000,
            })
            .not.toBeNull()
        await revokeCurrentPageSession(page)
        await page.goto('/account/profile')
        await expect(page).toHaveURL(/\/auth\/signin|\/account\/logout-forced/, {
            timeout: 30_000,
        })
    })
})
