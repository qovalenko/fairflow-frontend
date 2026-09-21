import { test, expect, catalogTest } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    denyDocumentsDelete,
    denyDocumentsGenerate,
    denyDocumentsRead,
    openDocumentsList,
    seedDocumentsProject,
} from '../support/documents'
import { clearProjectContext } from '../support/projectContext'
import { pickSelectOption } from '../support/ui'
import { ApiClient } from '../fixtures/api'

/**
 * Documents — P1 list/navigation scenarios (catalog `.e2e-scenario-catalog/documents.md`).
 */
test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

test('#5 templates link navigates to catalog', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-link')
    try {
        await openDocumentsList(page, pid)
        await byQa(page, 'documents.list.templatesLink').click()
        await expect(page).toHaveURL(new RegExp(`/p/${pid}/documents/templates`))
        await expect(byQa(page, 'documents.templates.root')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#6 department link visible for manager scope', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-dept-link')
    try {
        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.list.deptLink')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(7, 'deep-link detail and back to list', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-deeplink')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.detail.root')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'documents.detail.back').click()
        await expect(page).toHaveURL(/\/documents$/)
        await expect(byQa(page, 'documents.list.root')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(8, 'tabs filter generatedVia', { needsTemplate: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tabs')
    let uploadId: string | undefined
    let genId: string | undefined
    const dealId = await api.createDeal(pid, uniqueName('deal-tab-filter'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-tab-filter'), 'deal', true)
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'), {
            name: uniqueName('upload-tab'),
        })
        uploadId = up.groupId
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        genId = gen.groupId

        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.list.rowName', { group: uploadId })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'documents.list.rowName', { group: genId })).toBeVisible()

        await byQa(page, 'documents.list.tab', { tab: 'uploaded' }).click()
        await expect(byQa(page, 'documents.list.rowName', { group: uploadId })).toBeVisible()
        await expect(byQa(page, 'documents.list.rowName', { group: genId })).toHaveCount(0)

        await byQa(page, 'documents.list.tab', { tab: 'generated' }).click()
        await expect(byQa(page, 'documents.list.rowName', { group: genId })).toBeVisible()
        await expect(byQa(page, 'documents.list.rowName', { group: uploadId })).toHaveCount(0)
    } finally {
        if (uploadId) await api.deleteDocument(pid, uploadId).catch(() => {})
        if (genId) await api.deleteDocument(pid, genId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(9, 'search by document name', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-search')
    const needle = uniqueName('search-needle')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'), { name: needle })
        groupId = up.groupId
        await openDocumentsList(page, pid)
        const searchResp = page.waitForResponse(
            (r) =>
                r.url().includes('/v1/documents') &&
                r.request().method() === 'GET' &&
                r.url().includes('search='),
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.list.search').fill(needle)
        await searchResp
        await expect(byQa(page, 'documents.list.rowName', { group: groupId })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#13 empty project shows onboarding empty state', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-empty')
    try {
        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.list.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(14, 'filter with no matches offers reset', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-nomatch')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.list.rowName', { group: groupId })).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'documents.list.search').fill(uniqueName('absent-needle'))
        await expect(byQa(page, 'documents.list.emptyFilter')).toBeVisible({ timeout: 20_000 })
        await byQa(page, 'documents.list.resetFilters').click()
        await expect(byQa(page, 'documents.list.rowName', { group: groupId })).toBeVisible({
            timeout: 20_000,
        })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#16 list load error shows retry', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-list-err')
    try {
        await page.route(/\/v1\/documents(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await route.fulfill({ status: 503, body: 'upstream down' })
        })
        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.state.error')).toBeVisible({ timeout: 30_000 })
        await page.unroute(/\/v1\/documents(\?|$)/)
        const retry = page.waitForResponse(
            (r) => r.url().includes('/v1/documents') && r.request().method() === 'GET' && r.ok(),
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.state.retry').click()
        await retry
        await expect(byQa(page, 'documents.list.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(21, 'delete confirm removes row', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-del')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.list.rowName', { group: groupId })).toBeVisible({
            timeout: 30_000,
        })
        const del = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/documents/${groupId}`) && r.request().method() === 'DELETE',
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.list.delete', { group: groupId }).click()
        await byQa(page, 'documents.list.deleteConfirm').click()
        expect((await del).ok()).toBeTruthy()
        await expect(byQa(page, 'documents.list.rowName', { group: groupId })).toHaveCount(0, {
            timeout: 30_000,
        })
        groupId = undefined
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(22, 'delete cancel keeps document', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-del-cancel')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await openDocumentsList(page, pid)
        await byQa(page, 'documents.list.delete', { group: groupId }).click()
        await byQa(page, 'documents.list.deleteCancel').click()
        await expect(byQa(page, 'documents.list.rowName', { group: groupId })).toBeVisible()
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(24, 'row download without versionId navigates to detail', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-dl-nav')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await openDocumentsList(page, pid)
        await byQa(page, 'documents.list.download', { group: groupId }).click()
        await expect(page).toHaveURL(new RegExp(`/documents/${groupId}`))
        await expect(byQa(page, 'documents.detail.root')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#26 generate with no published templates shows empty dialog', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-no-tpl')
    try {
        await openDocumentsList(page, pid)
        await byQa(page, 'documents.list.generate').click()
        await expect(byQa(page, 'documents.generate.dialog')).toBeVisible()
        await expect(byQa(page, 'documents.generate.template')).toHaveCount(0)
        await expect(byQa(page, 'documents.generate.submit')).toBeDisabled()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#29 disabled documents module redirects away from list', async ({ page, api, useProject }) => {
    const modules = ApiClient.documentsModules()
    const pid = await api.createDocumentsProject(uniqueName('docs-p1-mod-off'))
    await useProject(pid, modules)
    try {
        await api.updateProjectModules(pid, modules.filter((m) => m !== 'documents'))
        await page.goto(`/p/${pid}/documents`)
        await expect(page).not.toHaveURL(/\/documents/, { timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#30 without selected project redirects to projects list', async ({ page, api, useProject }) => {
    const modules = ApiClient.documentsModules()
    const pid = await api.createDocumentsProject(uniqueName('docs-guard-no-proj'))
    await useProject(pid, modules)
    try {
        await page.goto('/account/projects')
        await clearProjectContext(page)
        await page.goto('/documents')
        await expect(page).toHaveURL(/\/account\/projects/, { timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(10, 'file type filter shows only matching mime', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-filetype')
    let pdfId: string | undefined
    let docxId: string | undefined
    try {
        const pdf = await api.uploadDocument(pid, api.fixturePath('sample.pdf'), {
            name: uniqueName('pdf-row'),
        })
        pdfId = pdf.groupId
        const docx = await api.uploadDocument(pid, api.fixturePath('minimal.docx'), {
            name: uniqueName('docx-row'),
        })
        docxId = docx.groupId

        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.list.rowName', { group: pdfId })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'documents.list.rowName', { group: docxId })).toBeVisible()

        await pickSelectOption(byQa(page, 'documents.list.fileType'), 'PDF')
        await expect(byQa(page, 'documents.list.rowName', { group: pdfId })).toBeVisible()
        await expect(byQa(page, 'documents.list.rowName', { group: docxId })).toHaveCount(0)
    } finally {
        if (pdfId) await api.deleteDocument(pid, pdfId).catch(() => {})
        if (docxId) await api.deleteDocument(pid, docxId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(12, 'drift filter shows only stale rows', { needsTemplate: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-drift-filter')
    const dealId = await api.createDeal(pid, uniqueName('deal-drift-list'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-drift-list'), 'deal', true)
    let genId: string | undefined
    let uploadId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'), {
            name: uniqueName('upload-no-drift'),
        })
        uploadId = up.groupId
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        genId = gen.groupId
        await api.updateDeal(pid, dealId, { name: uniqueName('deal-drift-list-after') })

        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.list.rowName', { group: genId })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'documents.list.rowName', { group: uploadId })).toBeVisible()

        await byQa(page, 'documents.list.driftFilter').locator('input').check()
        await expect(byQa(page, 'documents.list.rowName', { group: genId })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'documents.list.rowName', { group: uploadId })).toHaveCount(0)
    } finally {
        if (genId) await api.deleteDocument(pid, genId).catch(() => {})
        if (uploadId) await api.deleteDocument(pid, uploadId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#19 viewer without generate permission hides upload and generate', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-no-gen')
    try {
        await denyDocumentsGenerate(page, pid)
        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.list.upload')).toHaveCount(0)
        await expect(byQa(page, 'documents.list.generate')).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(23, 'without delete permission hides trash icon', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-no-del-perm')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await denyDocumentsDelete(page, pid)
        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.list.rowName', { group: groupId })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'documents.list.delete', { group: groupId })).toHaveCount(0)
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#27 without documents:read shows no-permission state', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-no-read')
    try {
        await denyDocumentsRead(page, pid)
        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.state.noPermission')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#18 upload error keeps list unchanged', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-upl-err')
    try {
        await page.route(/\/v1\/documents\/upload/, async (route) => {
            if (route.request().method() !== 'POST') {
                await route.continue()
                return
            }
            await route.fulfill({ status: 500, body: 'upload failed' })
        })
        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.list.empty')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'documents.list.upload').click()
        await byQa(page, 'documents.list.uploadInput').setInputFiles(
            api.fixturePath('sample.pdf'),
        )
        await expect(byQa(page, 'documents.list.empty')).toBeVisible({ timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(11, 'date range filter hides rows outside period', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-date')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.list.rowName', { group: groupId })).toBeVisible({
            timeout: 30_000,
        })

        const future = new Date()
        future.setDate(future.getDate() + 3)
        const futureIso = future.toISOString().slice(0, 10)
        await byQa(page, 'documents.list.dateFrom').fill(futureIso)
        await expect(byQa(page, 'documents.list.emptyFilter')).toBeVisible({ timeout: 20_000 })

        const today = new Date().toISOString().slice(0, 10)
        await byQa(page, 'documents.list.dateFrom').fill(today)
        await byQa(page, 'documents.list.dateTo').fill(today)
        await expect(byQa(page, 'documents.list.rowName', { group: groupId })).toBeVisible({
            timeout: 20_000,
        })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})
