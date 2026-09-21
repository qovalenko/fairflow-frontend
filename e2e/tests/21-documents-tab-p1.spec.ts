import { test, expect, catalogTest } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    denyDocumentsRead,
    openContactDocuments,
    openCompanyDocuments,
    pickGenerateTemplate,
    seedDocumentsProject,
    setDocumentsViewer,
} from '../support/documents'
import { ApiClient } from '../fixtures/api'

test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

catalogTest(60, 'generate from contact tab creates document', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-tab-contact-gen')
    const contactId = await api.createContact(pid, {
        firstName: uniqueName('Doc'),
        lastName: 'Contact',
    })
    const tplId = await api.createTemplate(pid, uniqueName('tpl-contact'), 'contact', true)
    try {
        await openContactDocuments(page, contactId)
        await byQa(page, 'documents.tab.generate').click()
        await expect(byQa(page, 'documents.generate.dialog')).toBeVisible()
        await pickGenerateTemplate(page, tplId)
        const gen = page.waitForResponse(
            (r) => r.url().includes('/v1/documents/generate') && r.request().method() === 'POST',
            { timeout: 30_000 },
        )
        await byQa(page, 'documents.generate.submit').click()
        expect((await gen).ok()).toBeTruthy()
        await expect(byQa(page, 'documents.tab.root')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteContact(pid, contactId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(61, 'generate from company tab creates document', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-tab-company-gen')
    const companyId = await api.createCompany(pid, { name: uniqueName('DocCo') })
    const tplId = await api.createTemplate(pid, uniqueName('tpl-company'), 'company', true)
    try {
        await openCompanyDocuments(page, companyId)
        await byQa(page, 'documents.tab.generate').click()
        await pickGenerateTemplate(page, tplId)
        const gen = page.waitForResponse(
            (r) => r.url().includes('/v1/documents/generate') && r.request().method() === 'POST',
            { timeout: 30_000 },
        )
        await byQa(page, 'documents.generate.submit').click()
        expect((await gen).ok()).toBeTruthy()
    } finally {
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteCompany(pid, companyId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#62: deal tab generate dialog empty when no published templates', async ({
    page,
    api,
    useProject,
}) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-tab-no-tpl')
    const dealId = await api.createDeal(pid, uniqueName('deal-no-tpl'))
    try {
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
        await byQa(page, 'documents.tab.generate').click()
        await expect(byQa(page, 'documents.generate.howTo')).toBeVisible({ timeout: 20_000 })
        await expect(byQa(page, 'documents.generate.submit')).toBeDisabled()
    } finally {
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(63, 'generate warnings toast for empty required fields', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-tab-warn')
    const dealId = await api.createDeal(pid, uniqueName('deal-warn'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-warn'), 'deal', true)
    try {
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
        await byQa(page, 'documents.tab.generate').click()
        await pickGenerateTemplate(page, tplId)
        await byQa(page, 'documents.generate.submit').click()
        await expect(
            page.getByText(/Документ (сгенерирован|создан)/).or(page.getByText(/Не заполнены поля/)),
        ).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(78, 'tab row shows drift icon when stale', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-tab-drift-icon')
    const dealId = await api.createDeal(pid, uniqueName('deal-drift-icon'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-drift-icon'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await api.updateDeal(pid, dealId, { name: uniqueName('deal-drift-after') })
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
        await expect(byQa(page, 'documents.tab.drift', { group: groupId })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#79: tab viewer hides upload and generate buttons', async ({ page, api, useProject }) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-tab-viewer')
    const dealId = await api.createDeal(pid, uniqueName('deal-tab-viewer'))
    try {
        await setDocumentsViewer(page, pid)
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
        await expect(byQa(page, 'documents.tab.upload')).toHaveCount(0)
        await expect(byQa(page, 'documents.tab.generate')).toHaveCount(0)
        await expect(byQa(page, 'documents.tab.root')).toBeVisible()
    } finally {
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#80: tab without documents read shows no-permission text', async ({ page, api, useProject }) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-tab-noread')
    const dealId = await api.createDeal(pid, uniqueName('deal-tab-noread'))
    try {
        await denyDocumentsRead(page, pid)
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
        await expect(byQa(page, 'documents.tab.noPermission')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#82: documents tab hidden when module disabled', async ({ page, api, useProject }) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const modules = ApiClient.documentsModules()
    const pid = await api.createDocumentsProject(uniqueName('docs-tab-mod-off'))
    await useProject(pid, modules)
    const dealId = await api.createDeal(pid, uniqueName('deal-mod-off'))
    try {
        await api.updateProjectModules(pid, modules.filter((m) => m !== 'documents'))
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.tab', { tab: 'documents' })).toHaveCount(0)
    } finally {
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})
