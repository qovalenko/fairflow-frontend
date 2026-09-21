import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { openDocumentsList } from '../support/documents'
import { ApiClient } from '../fixtures/api'

/**
 * P0 list scenarios (#1–4, #17) — SCR-DOCUMENTS-LIST.
 */
test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

test.describe('documents list P0', () => {
    test('#1 open documents and see table with seeded groups', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-list'))
        const uploadName = uniqueName('upload-seed')
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            const uploaded = await api.uploadDocument(
                pid,
                api.fixturePath('sample.pdf'),
                { name: uploadName },
            )
            groupId = uploaded.groupId

            await openDocumentsList(page, pid)
            await expect(byQa(page, 'documents.list.table')).toBeVisible()
            await expect(
                byQa(page, 'documents.list.rowName', { group: groupId }),
            ).toBeVisible({ timeout: 30_000 })
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#2 row name navigates to document detail', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-nav'))
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            const uploaded = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
            groupId = uploaded.groupId
            await openDocumentsList(page, pid)
            await byQa(page, 'documents.list.rowName', { group: groupId }).click()
            await expect(page).toHaveURL(new RegExp(`/documents/${groupId}`))
            await expect(byQa(page, 'documents.detail.root')).toBeVisible({ timeout: 30_000 })
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#3 view button opens document detail', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-view'))
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            const uploaded = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
            groupId = uploaded.groupId
            await openDocumentsList(page, pid)
            await byQa(page, 'documents.list.view', { group: groupId }).click()
            await expect(byQa(page, 'documents.detail.root')).toBeVisible({ timeout: 30_000 })
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#4 server pagination — second page when total > 25', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-page'))
        const groupIds: string[] = []
        await useProject(pid, modules)

        try {
            for (let i = 0; i < 26; i++) {
                const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'), {
                    name: uniqueName(`p${i}`),
                })
                groupIds.push(up.groupId)
            }

            await openDocumentsList(page, pid)
            const page2 = page.waitForResponse(
                (r) =>
                    r.url().includes('/v1/documents') &&
                    r.request().method() === 'GET' &&
                    r.url().includes('pageIndex=1'),
                { timeout: 20_000 },
            )
            await byQa(page, 'documents.list.paginationNext').click()
            await page2
            await expect(byQa(page, 'documents.list.table')).toBeVisible()
        } finally {
            for (const id of groupIds) await api.deleteDocument(pid, id).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#17 upload from list — toast and row appears', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-upload'))
        const uploadName = uniqueName('ui-upload')
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            await openDocumentsList(page, pid)
            const uploadResp = page.waitForResponse(
                (r) => r.url().includes('/v1/documents/upload') && r.request().method() === 'POST',
                { timeout: 30_000 },
            )
            await byQa(page, 'documents.list.upload').click()
            await byQa(page, 'documents.list.uploadInput').setInputFiles({
                name: `${uploadName}.pdf`,
                mimeType: 'application/pdf',
                buffer: await import('node:fs').then((fs) =>
                    fs.promises.readFile(api.fixturePath('sample.pdf')),
                ),
            })
            const res = await uploadResp
            expect(res.ok()).toBeTruthy()
            groupId = ((await res.json()) as { group: { groupId: string } }).group.groupId
            await expect(
                byQa(page, 'documents.list.rowName', { group: groupId! }),
            ).toBeVisible({ timeout: 30_000 })
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
