import { test, expect, catalogTest } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { openDocumentsDept, seedDocumentsProject, setOnlyOwnVisibility } from '../support/documents'

/** Documents — P1 department journal scenarios. */
test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

test('#119 department list error shows retry', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-dept-err')
    try {
        await page.route(/\/v1\/documents(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await route.fulfill({ status: 503, body: 'dept down' })
        })
        await openDocumentsDept(page, pid)
        await expect(byQa(page, 'documents.state.error')).toBeVisible({ timeout: 30_000 })
        await page.unroute(/\/v1\/documents(\?|$)/)
        const retry = page.waitForResponse(
            (r) => r.url().includes('/v1/documents') && r.request().method() === 'GET' && r.ok(),
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.state.retry').click()
        await retry
        await expect(byQa(page, 'documents.dept.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#112 member only_own scope sees dept no-permission message', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-dept-scope')
    try {
        await setOnlyOwnVisibility(page, pid, api.userId)
        await openDocumentsDept(page, pid)
        await expect(byQa(page, 'documents.dept.noPermission')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(118, 'department row view opens document detail', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-dept-open')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'), {
            name: uniqueName('dept-doc'),
        })
        groupId = up.groupId
        await openDocumentsDept(page, pid)
        await expect(byQa(page, 'documents.dept.table')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'documents.dept.open', { group: groupId }).click()
        await expect(page).toHaveURL(new RegExp(`/documents/${groupId}`))
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})
