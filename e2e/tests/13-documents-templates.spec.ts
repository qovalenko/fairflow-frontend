import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { ApiClient } from '../fixtures/api'

/**
 * P0 templates scenarios (#84, #88, #91, #96, #97, #98).
 */
test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

test.describe('documents templates P0', () => {
    test('#84 open catalog — grid with template cards', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-tpl-list'))
        const tplId = await api.createTemplate(pid, uniqueName('tpl-grid'), 'deal', false)
        await useProject(pid, modules)

        try {
            await page.goto(`/p/${pid}/documents/templates`)
            await expect(byQa(page, 'documents.templates.root')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'documents.templates.grid')).toBeVisible()
            await expect(
                byQa(page, 'documents.templates.card', { template: tplId }),
            ).toBeVisible()
        } finally {
            await api.deleteTemplate(pid, tplId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#88 new template navigates to create form', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-tpl-new'))
        await useProject(pid, modules)

        try {
            await page.goto(`/p/${pid}/documents/templates`)
            await byQa(page, 'documents.templates.new').click()
            await expect(byQa(page, 'documents.templateForm.root')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#91 publish draft — status published', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-tpl-pub'))
        const tplId = await api.createTemplate(pid, uniqueName('tpl-draft'), 'deal', false)
        await useProject(pid, modules)

        try {
            await page.goto(`/p/${pid}/documents/templates`)
            const pub = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/document-templates/${tplId}/publish`) &&
                    r.request().method() === 'POST',
                { timeout: 30_000 },
            )
            await byQa(page, 'documents.templates.publish', { template: tplId }).click()
            expect((await pub).ok()).toBeTruthy()
            await expect(
                byQa(page, 'documents.templates.card', { template: tplId }),
            ).toContainText('Опубликован')
        } finally {
            await api.deleteTemplate(pid, tplId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#96 create template — name + context + DOCX → redirect catalog', async ({
        page,
        api,
        useProject,
    }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-tpl-create'))
        const name = uniqueName('tpl-create')
        let tplId: string | undefined
        await useProject(pid, modules)

        try {
            await page.goto(`/p/${pid}/documents/templates/new`)
            await byQa(page, 'documents.templateForm.name').fill(name)
            await byQa(page, 'documents.templateForm.context', { context: 'deal' }).check()
            await byQa(page, 'documents.templateForm.fileInput').setInputFiles(
                api.fixturePath('minimal.docx'),
            )
            const create = page.waitForResponse(
                (r) =>
                    r.url().includes('/v1/document-templates') &&
                    r.request().method() === 'POST',
                { timeout: 30_000 },
            )
            await byQa(page, 'documents.templateForm.save').click()
            const res = await create
            expect(res.ok()).toBeTruthy()
            tplId = ((await res.json()) as { id: string }).id
            await expect(page).toHaveURL(new RegExp(`/documents/templates`))
            await expect(byQa(page, 'documents.templates.root')).toBeVisible({ timeout: 30_000 })
        } finally {
            if (tplId) await api.deleteTemplate(pid, tplId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#97 save and publish in one step', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-tpl-sp'))
        const name = uniqueName('tpl-sp')
        let tplId: string | undefined
        await useProject(pid, modules)

        try {
            await page.goto(`/p/${pid}/documents/templates/new`)
            await byQa(page, 'documents.templateForm.name').fill(name)
            await byQa(page, 'documents.templateForm.fileInput').setInputFiles(
                api.fixturePath('minimal.docx'),
            )
            const created = page.waitForResponse(
                (r) =>
                    r.url().includes('/v1/document-templates') &&
                    r.request().method() === 'POST',
                { timeout: 30_000 },
            )
            await byQa(page, 'documents.templateForm.saveAndPublish').click()
            const createRes = await created
            expect(createRes.ok()).toBeTruthy()
            tplId = ((await createRes.json()) as { id: string }).id
            await expect(byQa(page, 'documents.templates.root')).toBeVisible({ timeout: 30_000 })
            await expect(
                byQa(page, 'documents.templates.card', { template: tplId! }),
            ).toContainText('Опубликован', { timeout: 30_000 })
        } finally {
            if (tplId) await api.deleteTemplate(pid, tplId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#98 edit published template — save creates draft revision', async ({
        page,
        api,
        useProject,
    }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-tpl-edit'))
        const name = uniqueName('tpl-edit')
        const tplId = await api.createTemplate(pid, name, 'deal', true)
        await useProject(pid, modules)

        try {
            await page.goto(`/p/${pid}/documents/templates/${tplId}/edit`)
            await expect(byQa(page, 'documents.templateForm.root')).toBeVisible({ timeout: 30_000 })
            await byQa(page, 'documents.templateForm.name').fill(`${name}-v2`)
            const put = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/document-templates/${tplId}`) &&
                    r.request().method() === 'PUT',
                { timeout: 30_000 },
            )
            await byQa(page, 'documents.templateForm.save').click()
            expect((await put).ok()).toBeTruthy()
            await expect(page).toHaveURL(new RegExp(`/documents/templates`))
        } finally {
            await api.deleteTemplate(pid, tplId).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
