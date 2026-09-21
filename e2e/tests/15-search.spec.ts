import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'

/**
 * Shell catalog #125 (P0): open search overlay, type query, see results or empty state.
 * Shell catalog #128 (P1): no results message (ST-4) — covered here with nonsense query.
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test('#125: overlay поиска → ввод → ST-4 empty «нет результатов»', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('search'), modules)
    await useProject(pid, modules)

    try {
        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.search.trigger')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'host.search.trigger').click()
        await expect(byQa(page, 'host.search.dialog')).toBeVisible()

        await byQa(page, 'host.search.input').fill('zzzznotfound99999')
        await expect(byQa(page, 'host.search.empty')).toBeVisible({ timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#128: ST-4 overlay поиска — отдельное сообщение «нет результатов»', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('search-empty-msg'), modules)
    await useProject(pid, modules)

    try {
        await page.goto(`/p/${pid}`)
        await byQa(page, 'host.search.trigger').click()
        await byQa(page, 'host.search.input').fill('zzznoresult888')
        await expect(byQa(page, 'host.search.empty')).toBeVisible({ timeout: 20_000 })
        await expect(byQa(page, 'host.search.empty')).not.toBeEmpty()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#126: Cmd/Ctrl+K открывает overlay поиска', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('search-hotkey'), modules)
    await useProject(pid, modules)

    try {
        await page.goto(`/p/${pid}`)
        await page.keyboard.press('Control+K')
        await expect(byQa(page, 'host.search.dialog')).toBeVisible({ timeout: 10_000 })
    } finally {
        await api.archiveProject(pid)
    }
})
