import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { openDocumentsSettings } from '../support/documents'
import { ApiClient } from '../fixtures/api'

/** P0 #121 — admin changes documents module settings and saves. */
test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

test('#121 project settings documents tab — change TTL and save', async ({ page, api, useProject }) => {
    const modules = ApiClient.documentsModules()
    const pid = await api.createDocumentsProject(uniqueName('docs-settings'))
    await useProject(pid, modules)

    try {
        await openDocumentsSettings(page, pid)
        const field = byQa(page, 'documents.settings.personal.field', { key: 'downloadTtlSec' })
        await expect(field).toBeVisible({ timeout: 30_000 })
        await field.fill('1200')
        const save = page.waitForResponse(
            (r) =>
                r.url().includes(`/modules/documents/settings`) &&
                r.request().method() === 'PUT',
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.settings.save').click()
        expect((await save).ok()).toBeTruthy()
    } finally {
        await api.archiveProject(pid)
    }
})
