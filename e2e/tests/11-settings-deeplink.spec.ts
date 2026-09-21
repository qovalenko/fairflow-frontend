import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'

/**
 * Shell catalog #97 (P0): deep-link /account/projects/:id/settings/modules opens Modules tab.
 */
test('#97: deep-link settings/modules открывает вкладку «Модули»', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('settings-link'), modules)
    await useProject(pid, modules)

    try {
        await page.goto(`/account/projects/${pid}/settings/modules`)
        await expect(
            byQa(page, 'host.projectSettings.tab', { tab: 'modules' }),
        ).toHaveClass(/tab-nav-active/, { timeout: 30_000 })
        await expect(
            byQa(page, 'host.projectSettings.moduleToggle', { module: 'deals' }),
        ).toBeAttached()
    } finally {
        await api.archiveProject(pid)
    }
})
