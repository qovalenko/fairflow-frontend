import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { ApiClient } from '../fixtures/api'

/** P0 #111 — manager opens department journal with table. */
test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

test('#111 department journal shows documents table', async ({ page, api, useProject }) => {
    const modules = ApiClient.documentsModules()
    const pid = await api.createDocumentsProject(uniqueName('docs-dept'))
    let groupId: string | undefined
    await useProject(pid, modules)

    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await page.goto(`/p/${pid}/documents/department`)
        await expect(byQa(page, 'documents.dept.root')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'documents.dept.table')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})
