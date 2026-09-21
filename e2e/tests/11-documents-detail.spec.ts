import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { ApiClient } from '../fixtures/api'

/**
 * P0 detail scenarios (#32, #33, #43, #44, #52, #69) — SCR-DOCUMENTS-DETAIL + regenerate.
 */
test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

test.describe('documents detail P0', () => {
    test('#32 open card — metadata, info block, version history', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-detail'))
        const dealId = await api.createDeal(pid, uniqueName('deal-gen'))
        const tplId = await api.createTemplate(pid, uniqueName('tpl-deal'), 'deal', true)
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            const gen = await api.generateDocument(pid, {
                templateId: tplId,
                contextType: 'deal',
                recordId: dealId,
            })
            groupId = gen.groupId
            await page.goto(`/documents/${groupId}`)
            await expect(byQa(page, 'documents.detail.root')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'documents.detail.info')).toBeVisible()
            await expect(byQa(page, 'documents.detail.versions')).toBeVisible()
            await expect(byQa(page, 'documents.detail.generatedTag')).toContainText('Сгенерирован')
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.deleteTemplate(pid, tplId).catch(() => {})
            await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#33 uploaded doc — no versions table, uploaded tag', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-upload-detail'))
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
            groupId = up.groupId
            await page.goto(`/documents/${groupId}`)
            await expect(byQa(page, 'documents.detail.root')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'documents.detail.generatedTag')).toContainText('Загружен')
            await expect(byQa(page, 'documents.detail.versions')).toHaveCount(0)
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#43 download current version triggers download API', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-dl'))
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
            groupId = up.groupId
            const detail = await api.getDocument(pid, groupId)
            const versionId = detail.versions[0]?.versionId
            expect(versionId).toBeTruthy()

            await page.goto(`/documents/${groupId}`)
            const dl = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/documents/versions/${versionId}/download`) &&
                    r.request().method() === 'GET',
                { timeout: 20_000 },
            )
            await byQa(page, 'documents.detail.download').click()
            const res = await dl
            expect(res.ok()).toBeTruthy()
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#44 download specific version from versions table', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-dl-ver'))
        const dealId = await api.createDeal(pid, uniqueName('deal-dlv'))
        const tplId = await api.createTemplate(pid, uniqueName('tpl-dlv'), 'deal', true)
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            const gen = await api.generateDocument(pid, {
                templateId: tplId,
                contextType: 'deal',
                recordId: dealId,
            })
            groupId = gen.groupId
            await api.regenerateDocument(pid, groupId)
            const detail = await api.getDocument(pid, groupId)
            const older = detail.versions.find((v) => v.version === 1)
            expect(older?.versionId).toBeTruthy()

            await page.goto(`/documents/${groupId}`)
            const dl = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/documents/versions/${older!.versionId}/download`) &&
                    r.request().method() === 'GET',
                { timeout: 20_000 },
            )
            await byQa(page, 'documents.detail.versionDownload', {
                version: older!.versionId,
            }).click()
            expect((await dl).ok()).toBeTruthy()
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.deleteTemplate(pid, tplId).catch(() => {})
            await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#52 regenerate from detail — new version in table', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-regen'))
        const dealId = await api.createDeal(pid, uniqueName('deal-regen'))
        const tplId = await api.createTemplate(pid, uniqueName('tpl-regen'), 'deal', true)
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            const gen = await api.generateDocument(pid, {
                templateId: tplId,
                contextType: 'deal',
                recordId: dealId,
            })
            groupId = gen.groupId
            await page.goto(`/documents/${groupId}`)
            await byQa(page, 'documents.detail.regenerate').click()
            await expect(byQa(page, 'documents.generate.dialog')).toBeVisible()
            const regen = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/documents/${groupId}/regenerate`) &&
                    r.request().method() === 'POST',
                { timeout: 30_000 },
            )
            await byQa(page, 'documents.generate.submit').click()
            await regen
            await expect(byQa(page, 'documents.detail.versions')).toContainText('v2')
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.deleteTemplate(pid, tplId).catch(() => {})
            await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#69 regenerate dialog — revision switch without template pick', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-regen-mode'))
        const dealId = await api.createDeal(pid, uniqueName('deal-rmode'))
        const tplId = await api.createTemplate(pid, uniqueName('tpl-rmode'), 'deal', true)
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            const gen = await api.generateDocument(pid, {
                templateId: tplId,
                contextType: 'deal',
                recordId: dealId,
            })
            groupId = gen.groupId
            await page.goto(`/documents/${groupId}`)
            await byQa(page, 'documents.detail.regenerate').click()
            await expect(byQa(page, 'documents.generate.dialog')).toBeVisible()
            await expect(byQa(page, 'documents.generate.template')).toHaveCount(0)
            await expect(byQa(page, 'documents.generate.revision')).toBeVisible()
            await expect(byQa(page, 'documents.generate.submit')).toContainText('Перегенерировать')
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.deleteTemplate(pid, tplId).catch(() => {})
            await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
