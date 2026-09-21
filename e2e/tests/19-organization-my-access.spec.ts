import { test, expect } from '../fixtures/test'

/**
 * Organization — self-service access view (SCR-MPROF-MY-ACCESS / FR-PROFILE-280).
 */

test.fixme('#102: BUG GET /v1/profile/my-access 404 on stand — user sees system roles and project list', async () => {
    /* Box my-access BFF not deployed on the stand yet. */
})

test.fixme('#103: BUG my-access empty projects — GET /v1/profile/my-access 404 on stand', async () => {
    /* Box my-access BFF not deployed on the stand yet. */
})

test('#104: load error 5xx on my-access', async ({ page }) => {
    await page.route('**/v1/profile/my-access**', (route) =>
        route.fulfill({ status: 500, body: '{}' }),
    )
    await page.goto('/account/access')
    await expect(page.getByText(/Не удалось загрузить доступы/i)).toBeVisible({
        timeout: 30_000,
    })
})
