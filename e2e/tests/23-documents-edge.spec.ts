import { test, expect, catalogTest } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    openDocumentsList,
    pickGenerateTemplate,
    seedDocumentsProject,
    setOnlyOwnVisibility,
} from '../support/documents'

test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

test.fixme(
    '#28: BUG needs second project member: member visibility hides foreign documents',
    async ({ page, api, useProject }) => {
        const pid = await seedDocumentsProject(api, useProject, 'docs-vis-list')
        try {
            await setOnlyOwnVisibility(page, pid, api.userId)
            await openDocumentsList(page, pid)
            await expect(byQa(page, 'documents.list.root')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    },
)

catalogTest(65, 'generate forbidden for record outside initiator scope', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-gen-403')
    const dealId = await api.createDeal(pid, uniqueName('deal-403'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-403'), 'deal', true)
    try {
        await page.route(/\/v1\/documents\/generate/, async (route) => {
            await route.fulfill({ status: 403, body: JSON.stringify({ code: 'FORBIDDEN' }) })
        })
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
        await byQa(page, 'documents.tab.generate').click()
        await pickGenerateTemplate(page, tplId)
        await byQa(page, 'documents.generate.submit').click()
        await expect(page.getByText(/не удалось|запрещ/i)).toBeVisible({ timeout: 20_000 })
    } finally {
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(66, 'generate error when variable resolver unavailable', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-gen-503')
    const dealId = await api.createDeal(pid, uniqueName('deal-503'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-503'), 'deal', true)
    try {
        await page.route(/\/v1\/documents\/generate/, async (route) => {
            await route.fulfill({ status: 503, body: 'resolver down' })
        })
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
        await byQa(page, 'documents.tab.generate').click()
        await pickGenerateTemplate(page, tplId)
        await byQa(page, 'documents.generate.submit').click()
        await expect(page.getByText(/не удалось/i)).toBeVisible({ timeout: 20_000 })
    } finally {
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(68, 'submit after template deleted shows error', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-gen-tpl-del')
    const dealId = await api.createDeal(pid, uniqueName('deal-tpl-del'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-del-mid'), 'deal', true)
    try {
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
        await byQa(page, 'documents.tab.generate').click()
        await pickGenerateTemplate(page, tplId)
        await api.deleteTemplate(pid, tplId)
        await byQa(page, 'documents.generate.submit').click()
        await expect(page.getByText(/не удалось/i)).toBeVisible({ timeout: 20_000 })
    } finally {
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(72, 'regenerate source revision edge when source revision missing', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-rev-edge')
    const dealId = await api.createDeal(pid, uniqueName('deal-rev-edge'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-rev-edge'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await page.goto(`/documents/${groupId}`)
        await byQa(page, 'documents.detail.regenerate').click()
        await expect(byQa(page, 'documents.generate.revision')).toBeVisible()
        await byQa(page, 'documents.generate.submit').click()
        await expect(byQa(page, 'documents.generate.dialog')).toHaveCount(0, {
            timeout: 30_000,
        })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(136, 'stale drift updates after CRM record change on refocus', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-drift-refocus')
    const dealId = await api.createDeal(pid, uniqueName('deal-refocus'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-refocus'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await openDocumentsList(page, pid)
        await api.updateDeal(pid, dealId, { name: uniqueName('deal-refocus-after') })
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.detail.driftBanner')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test.fixme('#83: BUG inject federated tab import failure: remote tab error boundary', async () => {
    /* Host RemoteModuleErrorBoundary on TAB slot — needs controlled remote crash hook */
})

test.fixme('#139: BUG needs notification seed: deep-link from document notification', async () => {
    /* Host NotificationDropdown document.* types — no API seed in test-infra */
})

test.fixme('#141: BUG standalone vite entry without host nav: /documents standalone', async () => {
    /* modules/documents/vite-entry-app.tsx — separate origin from hybrid host */
})

test.fixme('#142: BUG inject documents route federated failure: RemoteModuleErrorBoundary on routes', async () => {
    /* Host AllRoutes wrapper — needs controlled remote crash hook */
})
