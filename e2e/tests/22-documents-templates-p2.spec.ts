import { test, expect, catalogTest } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { denyDocumentsManage, seedDocumentsProject } from '../support/documents'
import { pickSelectOption } from '../support/ui'
import { ApiClient } from '../fixtures/api'
import fs from 'node:fs'

test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

catalogTest(92, 'publish invalid template shows error toast', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-tpl-bad-pub')
    const tplId = await api.createTemplate(pid, uniqueName('tpl-bad-pub'), 'deal', false)
    try {
        await page.goto(`/p/${pid}/documents/templates`)
        await page.route(/\/v1\/document-templates\/[^/]+\/publish/, async (route) => {
            await route.fulfill({
                status: 422,
                contentType: 'application/json',
                body: JSON.stringify({ code: 'TEMPLATE_INVALID', message: 'invalid docx' }),
            })
        })
        await byQa(page, 'documents.templates.publish', { template: tplId }).click()
        await expect(page.getByText(/не удалось|ошиб/i)).toBeVisible({ timeout: 20_000 })
    } finally {
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(95, 'archived template hidden from generate but doc regenerates', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-tpl-arch-gen')
    const dealId = await api.createDeal(pid, uniqueName('deal-arch-gen'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-arch-gen'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await api.archiveTemplate(pid, tplId)
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
        await byQa(page, 'documents.tab.generate').click()
        await expect(byQa(page, 'documents.generate.howTo')).toBeVisible({ timeout: 20_000 })
        await byQa(page, 'documents.generate.cancel').click()
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.detail.regenerate')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#99: order template form shows order type select', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-tpl-order-type')
    const orderType = await api.createOrderType(pid, uniqueName('otype-doc'))
    try {
        await page.goto(`/p/${pid}/documents/templates/new`)
        await byQa(page, 'documents.templateForm.context', { context: 'order' }).check()
        await expect(byQa(page, 'documents.templateForm.orderType')).toBeVisible({
            timeout: 30_000,
        })
        await pickSelectOption(byQa(page, 'documents.templateForm.orderType'), orderType.name)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#100: drag and drop DOCX onto drop zone', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-tpl-dnd')
    const docxPath = api.fixturePath('minimal.docx')
    const b64 = fs.readFileSync(docxPath).toString('base64')
    try {
        await page.goto(`/p/${pid}/documents/templates/new`)
        const dropZone = byQa(page, 'documents.templateForm.dropZone')
        await dropZone.evaluate(
            (el, payload) => {
                const binary = atob(payload.b64)
                const bytes = new Uint8Array(binary.length)
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                const file = new File([bytes], payload.name, {
                    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                })
                const dt = new DataTransfer()
                dt.items.add(file)
                el.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }))
            },
            { name: 'drop.docx', b64 },
        )
        await expect(byQa(page, 'documents.templateForm.replaceFile')).toBeVisible({
            timeout: 20_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#102: server TEMPLATE_INVALID shows toast on save', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-tpl-invalid')
    try {
        await page.goto(`/p/${pid}/documents/templates/new`)
        await byQa(page, 'documents.templateForm.name').fill(uniqueName('invalid-tpl'))
        await byQa(page, 'documents.templateForm.fileInput').setInputFiles(
            api.fixturePath('minimal.docx'),
        )
        await page.route(/\/v1\/document-templates(\?|$)/, async (route) => {
            if (route.request().method() !== 'POST') {
                await route.continue()
                return
            }
            await route.fulfill({
                status: 422,
                contentType: 'application/json',
                body: JSON.stringify({ code: 'TEMPLATE_INVALID', message: 'bad macros' }),
            })
        })
        await byQa(page, 'documents.templateForm.save').click()
        await expect(page.getByText(/не удалось|ошиб/i)).toBeVisible({ timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#103: variable catalog loads and copy works', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-tpl-vars')
    try {
        await page.goto(`/p/${pid}/documents/templates/new`)
        await byQa(page, 'documents.templateForm.context', { context: 'deal' }).check()
        await expect(byQa(page, 'documents.templateForm.variablesTable')).toBeVisible({
            timeout: 30_000,
        })
        const copyBtn = byQa(page, 'documents.templateForm.variableCopy').first()
        await copyBtn.click()
        await expect(copyBtn).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#104: empty variable catalog when donor module disabled', async ({ page, api, useProject }) => {
    const modules = ApiClient.documentsModules()
    const pid = await api.createDocumentsProject(uniqueName('docs-tpl-vars-empty'))
    await useProject(pid, modules)
    try {
        await api.updateProjectModules(pid, modules.filter((m) => m !== 'deals'))
        await page.goto(`/p/${pid}/documents/templates/new`)
        await byQa(page, 'documents.templateForm.context', { context: 'deal' }).check()
        await expect(byQa(page, 'documents.templateForm.variablesEmpty')).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#107: manager without manage sees no-permission on template form', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-tpl-nomanage')
    try {
        await denyDocumentsManage(page, pid)
        await page.goto(`/p/${pid}/documents/templates/new`)
        await expect(byQa(page, 'documents.templateForm.noPermission')).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(108, 'edit mode download current DOCX triggers API', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-tpl-dl-edit')
    const tplId = await api.createTemplate(pid, uniqueName('tpl-dl-edit'), 'deal', true)
    try {
        await page.goto(`/p/${pid}/documents/templates/${tplId}/edit`)
        const dl = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/document-templates/${tplId}/download`) &&
                r.request().method() === 'GET',
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.templateForm.downloadCurrent').click()
        expect((await dl).ok()).toBeTruthy()
    } finally {
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.archiveProject(pid)
    }
})
