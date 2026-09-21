import { test, expect } from '../fixtures/test'
import { FALLBACK_SYSTEM_ID, expectEventuallyUrl } from '../support/onboarding'

/**
 * Onboarding — unauthenticated redirect chains (catalog #47, #146, #32).
 */
test.use({ storageState: { cookies: [], origins: [] } })

test('#47: unauthenticated legacy create-project URL stores redirectUrl on sign-in', async ({
    page,
}) => {
    await page.goto(`/onboarding/create-project?owner=${FALLBACK_SYSTEM_ID}`)
    await expectEventuallyUrl(page, /\/auth\/signin/)
    expect(page.url()).toContain('redirectUrl=')
})

test.fixme(
    '#146: BUG unauth /bootstrap stays on bootstrap on initialized box: repeat bootstrap redirects to sign-in',
    async ({ page }) => {
        await page.goto('/bootstrap')
        await expectEventuallyUrl(page, /\/auth\/signin/)
    },
)

test('#32: expired session on protected / redirects to sign-in with redirectUrl', async ({
    page,
}) => {
    await page.goto('/dashboard')
    await expectEventuallyUrl(page, /\/auth\/signin/)
    expect(page.url()).toMatch(/redirectUrl=/)
})
