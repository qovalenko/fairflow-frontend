import { test, expect, catalogTest } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    openDocumentsList,
    seedDocumentsProject,
    switchProjectContext,
    DOCUMENTS_MODULES,
} from '../support/documents'

test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

catalogTest(15, 'filter change shows refreshing indicator without clearing table', { needsUpload: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p2-refresh')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.list.rowName', { group: groupId })).toBeVisible({
            timeout: 30_000,
        })

        await page.route(/\/v1\/documents(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await new Promise((r) => setTimeout(r, 800))
            await route.continue()
        })
        const refetch = page.waitForResponse(
            (r) => r.url().includes('/v1/documents') && r.request().method() === 'GET',
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.list.tab', { tab: 'uploaded' }).click()
        await refetch
        await expect(byQa(page, 'documents.list.refreshing')).toBeVisible({ timeout: 10_000 })
        await expect(byQa(page, 'documents.list.table')).toBeVisible()
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#31: project switch remounts documents list', async ({ page, api, useProject }) => {
    const pidA = await api.createDocumentsProject(uniqueName('docs-proj-a'))
    const pidB = await api.createDocumentsProject(uniqueName('docs-proj-b'))
    let groupA: string | undefined
    let groupB: string | undefined
    try {
        const upA = await api.uploadDocument(pidA, api.fixturePath('sample.pdf'), {
            name: uniqueName('proj-a-doc'),
        })
        groupA = upA.groupId
        const upB = await api.uploadDocument(pidB, api.fixturePath('sample.pdf'), {
            name: uniqueName('proj-b-doc'),
        })
        groupB = upB.groupId

        await useProject(pidA, [...DOCUMENTS_MODULES])
        await openDocumentsList(page, pidA)
        await expect(byQa(page, 'documents.list.rowName', { group: groupA })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'documents.list.rowName', { group: groupB })).toHaveCount(0)

        await switchProjectContext(page, pidB)
        await page.goto(`/p/${pidB}/documents`)
        await expect(byQa(page, 'documents.list.root')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'documents.list.rowName', { group: groupB })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'documents.list.rowName', { group: groupA })).toHaveCount(0)
    } finally {
        if (groupA) await api.deleteDocument(pidA, groupA).catch(() => {})
        if (groupB) await api.deleteDocument(pidB, groupB).catch(() => {})
        await api.archiveProject(pidA)
        await api.archiveProject(pidB)
    }
})
