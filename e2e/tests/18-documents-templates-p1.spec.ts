import { test, expect, catalogTest } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { denyDocumentsManage, denyDocumentsRead, seedDocumentsProject } from '../support/documents'
test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

test('#85 empty templates catalog shows how-to', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-empty')
    try {
        await page.goto(`/p/${pid}/documents/templates`)
        await expect(byQa(page, 'documents.templates.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(89, 'download template triggers presigned API', { needsTemplate: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-dl')
    const tplId = await api.createTemplate(pid, uniqueName('tpl-dl'), 'deal', true)
    try {
        await page.goto(`/p/${pid}/documents/templates`)
        const dl = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/document-templates/${tplId}/download`) &&
                r.request().method() === 'GET',
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.templates.download', { template: tplId }).click()
        expect((await dl).ok()).toBeTruthy()
    } finally {
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#90 templates list error shows retry', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-err')
    try {
        await page.route(/\/v1\/document-templates(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await route.fulfill({ status: 503, body: 'templates down' })
        })
        await page.goto(`/p/${pid}/documents/templates`)
        await expect(byQa(page, 'documents.state.error')).toBeVisible({ timeout: 30_000 })
        await page.unroute(/\/v1\/document-templates(\?|$)/)
        const retry = page.waitForResponse(
            (r) => r.url().includes('/v1/document-templates') && r.ok(),
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.state.retry').click()
        await retry
        await expect(byQa(page, 'documents.templates.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(93, 'archive published template changes status', { needsTemplate: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-arch')
    const tplId = await api.createTemplate(pid, uniqueName('tpl-arch'), 'deal', true)
    try {
        await page.goto(`/p/${pid}/documents/templates`)
        const arch = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/document-templates/${tplId}/archive`) &&
                r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.templates.archive', { template: tplId }).click()
        expect((await arch).ok()).toBeTruthy()
        await expect(byQa(page, 'documents.templates.card', { template: tplId })).toContainText(
            'В архиве',
            { timeout: 30_000 },
        )
    } finally {
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(94, 'delete template removes card', { needsTemplate: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-del')
    const tplId = await api.createTemplate(pid, uniqueName('tpl-del'), 'deal', false)
    try {
        await page.goto(`/p/${pid}/documents/templates`)
        await byQa(page, 'documents.templates.delete', { template: tplId }).click()
        const del = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/document-templates/${tplId}`) &&
                r.request().method() === 'DELETE',
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.templates.deleteConfirm').click()
        expect((await del).ok()).toBeTruthy()
        await expect(byQa(page, 'documents.templates.card', { template: tplId })).toHaveCount(0, {
            timeout: 30_000,
        })
    } finally {
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#109 create template rejects empty name', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-val')
    try {
        await page.goto(`/p/${pid}/documents/templates/new`)
        await expect(byQa(page, 'documents.templateForm.root')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'documents.templateForm.fileInput').setInputFiles(
            api.fixturePath('minimal.docx'),
        )
        await byQa(page, 'documents.templateForm.save').click()
        await expect(byQa(page, 'documents.templateForm.root')).toBeVisible()
        await expect(page).toHaveURL(/\/templates\/new/)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#110 create route shows new template form not edit prefilled', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-new-mode')
    try {
        await page.goto(`/p/${pid}/documents/templates/new`)
        await expect(byQa(page, 'documents.templateForm.root')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'documents.templateForm.name')).toHaveValue('')
    } finally {
        await api.archiveProject(pid)
    }
})

test('#101 create form rejects non-DOCX upload', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-pdf')
    try {
        await page.goto(`/p/${pid}/documents/templates/new`)
        await byQa(page, 'documents.templateForm.fileInput').setInputFiles(
            api.fixturePath('sample.pdf'),
        )
        await expect(page.getByText('Допустимы только файлы DOCX')).toBeVisible({
            timeout: 20_000,
        })
        await expect(page).toHaveURL(/\/templates\/new/)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#106 unknown template edit shows not-found state', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-404')
    try {
        await page.goto(`/p/${pid}/documents/templates/missing-${Date.now()}/edit`)
        await expect(byQa(page, 'documents.templateForm.notFound')).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(86, 'member without manage sees read-only templates catalog', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-ro')
    const tplId = await api.createTemplate(pid, uniqueName('tpl-ro'), 'deal', true)
    try {
        await denyDocumentsManage(page, pid)
        await page.goto(`/p/${pid}/documents/templates`)
        await expect(byQa(page, 'documents.templates.card', { template: tplId })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'documents.templates.new')).toHaveCount(0)
        await expect(byQa(page, 'documents.templates.publish', { template: tplId })).toHaveCount(0)
    } finally {
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#87 without documents:read shows no-permission on templates', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-noread')
    try {
        await denyDocumentsRead(page, pid)
        await page.goto(`/p/${pid}/documents/templates`)
        await expect(byQa(page, 'documents.state.noPermission')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#105 dirty back navigation asks to discard changes', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tpl-dirty')
    try {
        await page.goto(`/p/${pid}/documents/templates/new`)
        await byQa(page, 'documents.templateForm.name').fill(uniqueName('dirty-name'))
        await byQa(page, 'documents.templateForm.back').click()
        await expect(byQa(page, 'documents.templateForm.leaveStay')).toBeVisible({
            timeout: 20_000,
        })
        await byQa(page, 'documents.templateForm.leaveDiscard').click()
        await expect(page).toHaveURL(/\/documents\/templates$/)
    } finally {
        await api.archiveProject(pid)
    }
})
