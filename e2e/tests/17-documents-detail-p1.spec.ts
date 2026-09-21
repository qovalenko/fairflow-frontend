import { test, expect, catalogTest } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { denyDocumentsRead, seedDocumentsProject, setDocumentsViewer } from '../support/documents'
import { pickSelectOption } from '../support/ui'

/** Documents — P1 detail scenarios. */
test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

catalogTest(35, 'uploaded doc without context shows no entity link', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-no-ctx')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.detail.root')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'documents.detail.info')).toContainText('Без привязки')
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#39 unknown groupId shows not-found and back link', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-404')
    try {
        await page.goto(`/documents/nonexistent-${Date.now()}`)
        await expect(byQa(page, 'documents.detail.notFound')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'documents.detail.backToList').click()
        await expect(page).toHaveURL(/\/documents$/, { timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(38, 'detail load error shows retry', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-detail-err')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await page.route(/\/v1\/documents\/[^/?]+(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await route.fulfill({ status: 503, body: 'detail down' })
        })
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.state.error')).toBeVisible({ timeout: 30_000 })
        await page.unroute(/\/v1\/documents\/[^/?]+(\?|$)/)
        const retry = page.waitForResponse(
            (r) => r.url().includes(`/v1/documents/${groupId}`) && r.ok(),
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.state.retry').click()
        await retry
        await expect(byQa(page, 'documents.detail.root')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(56, 'delete from detail redirects to list', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-del-detail')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await page.goto(`/documents/${groupId}`)
        await byQa(page, 'documents.detail.delete').click()
        const del = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/documents/${groupId}`) && r.request().method() === 'DELETE',
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.detail.deleteConfirm').click()
        expect((await del).ok()).toBeTruthy()
        await expect(page).toHaveURL(/\/documents$/, { timeout: 30_000 })
        groupId = undefined
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(47, 'DOCX detail shows download placeholder instead of preview', { needsUpload: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-docx-ph')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('minimal.docx'), {
            name: uniqueName('docx-upload'),
        })
        groupId = up.groupId
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.detail.previewPlaceholder')).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'documents.detail.previewPlaceholder')).toContainText(
            'Скачайте для просмотра',
        )
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(34, 'generated doc entity link opens deal card', { needsTemplate: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-entity')
    const dealId = await api.createDeal(pid, uniqueName('deal-entity-link'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-entity'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.detail.entityLink')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'documents.detail.entityLink').click()
        await expect(page).toHaveURL(new RegExp(`/deals/${dealId}`))
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(36, 'template link opens template edit form', { needsTemplate: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-link-d')
    const dealId = await api.createDeal(pid, uniqueName('deal-tpl-link'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-link-detail'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await page.goto(`/documents/${groupId}`)
        await byQa(page, 'documents.detail.templateLink').click()
        await expect(page).toHaveURL(new RegExp(`/documents/templates/${tplId}/edit`))
        await expect(byQa(page, 'documents.templateForm.root')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(45, 'download error shows toast message', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-dl-err')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        const detail = await api.getDocument(pid, groupId)
        const versionId = detail.versions[0]?.versionId
        expect(versionId).toBeTruthy()

        await page.route(/\/v1\/documents\/versions\/[^/]+\/download/, async (route) => {
            await route.fulfill({ status: 403, body: 'forbidden' })
        })
        await page.goto(`/documents/${groupId}`)
        await byQa(page, 'documents.detail.download').click()
        await expect(page.getByText('Не удалось скачать документ')).toBeVisible({
            timeout: 20_000,
        })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(46, 'PDF upload shows inline preview iframe', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-pdf-prev')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.detail.pdfPreview')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(48, 'drift banner after CRM record change', { needsTemplate: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-drift')
    const dealName = uniqueName('deal-drift-before')
    const dealId = await api.createDeal(pid, dealName)
    const tplId = await api.createTemplate(pid, uniqueName('tpl-drift'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await api.updateDeal(pid, dealId, { name: uniqueName('deal-drift-after') })
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.detail.driftBanner')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(41, 'without documents:read shows no-permission on detail', { needsUpload: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-detail-noread')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await denyDocumentsRead(page, pid)
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.state.noPermission')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(42, 'viewer hides regenerate and delete but keeps download', { needsUpload: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-viewer')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await setDocumentsViewer(page, pid)
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.detail.download')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'documents.detail.regenerate')).toHaveCount(0)
        await expect(byQa(page, 'documents.detail.delete')).toHaveCount(0)
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(51, 'drift banner regenerate opens generate dialog', { needsTemplate: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-drift-btn')
    const dealId = await api.createDeal(pid, uniqueName('deal-drift-btn'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-drift-btn'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await api.updateDeal(pid, dealId, { name: uniqueName('deal-drift-btn-after') })
        await page.goto(`/documents/${groupId}`)
        await byQa(page, 'documents.detail.driftRegenerate').click()
        await expect(byQa(page, 'documents.generate.dialog')).toBeVisible({ timeout: 20_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(53, 'regenerate dialog supports current vs source revision', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-rev-pick')
    const dealId = await api.createDeal(pid, uniqueName('deal-rev-pick'))
    const tplName = uniqueName('tpl-rev-pick')
    const tplId = await api.createTemplate(pid, tplName, 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await page.goto(`/p/${pid}/documents/templates/${tplId}/edit`)
        await byQa(page, 'documents.templateForm.name').fill(`${tplName}-v2`)
        await byQa(page, 'documents.templateForm.save').click()
        await expect(page).toHaveURL(/\/documents\/templates/, { timeout: 30_000 })

        await page.goto(`/documents/${groupId}`)
        await byQa(page, 'documents.detail.regenerate').click()
        await expect(byQa(page, 'documents.generate.revision')).toBeVisible()
        await pickSelectOption(byQa(page, 'documents.generate.revision'), 'исходной')
        const regen = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/documents/${groupId}/regenerate`) &&
                r.request().method() === 'POST',
            { timeout: 30_000 },
        )
        await byQa(page, 'documents.generate.submit').click()
        expect((await regen).ok()).toBeTruthy()
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})
