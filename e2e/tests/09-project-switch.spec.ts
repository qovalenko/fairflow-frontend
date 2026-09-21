import { test, expect } from '../fixtures/test'
import { uniqueName } from '../support/env'

/**
 * Shell catalog #58 (P0): deep-link /p/:validPid → redirect to first module.
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test('#58: deep-link /p/:validPid → redirect на firstPath меню', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('home-redirect'), modules)
    await useProject(pid, modules)

    try {
        await page.goto(`/p/${pid}`)
        await expect(page).toHaveURL(new RegExp(`/p/${pid}/`), { timeout: 45_000 })
        await expect(page).not.toHaveURL(new RegExp(`/p/${pid}$`))
    } finally {
        await api.archiveProject(pid)
    }
})
