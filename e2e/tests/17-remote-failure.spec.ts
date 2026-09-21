import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'

/**
 * Shell catalog #159 (P0): failing business remote shows fallback card; host chrome survives.
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test('#159: падение business-remote → fallback card, host chrome жив', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('remote-fail'), modules)
    await useProject(pid, modules)

    try {
        await page.route('**/frontend/deals/**', (route) =>
            route.fulfill({ status: 500, body: 'remote unavailable' }),
        )

        await page.goto(`/p/${pid}/deals`)
        await expect(
            byQa(page, 'host.remoteError.fallback', { module: 'deals' }),
        ).toBeVisible({ timeout: 45_000 })
        await expect(byQa(page, 'host.userMenu.trigger')).toBeVisible()
        await expect(byQa(page, 'host.remoteError.reload')).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})
