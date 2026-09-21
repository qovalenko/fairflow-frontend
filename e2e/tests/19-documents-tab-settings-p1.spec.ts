import { test, expect, catalogTest } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { denyProjectManage, openDocumentsSettings, seedDocumentsProject } from '../support/documents'

/** Documents — P1 tab / settings / generate-dialog scenarios. */
test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

catalogTest(64, 'generate dialog cancel closes without POST', { needsTemplate: true }, async ({ page, api, useProject }) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-gen-cancel')
    const dealId = await api.createDeal(pid, uniqueName('deal-cancel'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-cancel'), 'deal', true)
    try {
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
        await byQa(page, 'documents.tab.generate').click()
        await expect(byQa(page, 'documents.generate.dialog')).toBeVisible()
        let posted = false
        page.on('request', (req) => {
            if (req.url().includes('/v1/documents/generate') && req.method() === 'POST') posted = true
        })
        await byQa(page, 'documents.generate.cancel').click()
        await expect(byQa(page, 'documents.generate.dialog')).toHaveCount(0)
        expect(posted).toBe(false)
    } finally {
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#75 deal tab empty state when no documents', async ({ page, api, useProject }) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tab-empty')
    const dealId = await api.createDeal(pid, uniqueName('deal-empty-tab'))
    try {
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
        await expect(byQa(page, 'documents.tab.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(77, 'tab row open navigates to document detail', { needsTemplate: true }, async ({ page, api, useProject }) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tab-open')
    const dealId = await api.createDeal(pid, uniqueName('deal-tab-open'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-tab-open'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
        await byQa(page, 'documents.tab.open', { group: groupId }).click()
        await expect(page).toHaveURL(new RegExp(`/documents/${groupId}`))
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#81 tab list error keeps entity card alive', async ({ page, api, useProject }) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local deals qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-tab-err')
    const dealId = await api.createDeal(pid, uniqueName('deal-tab-err'))
    try {
        await page.route(/\/v1\/documents(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await route.fulfill({ status: 503, body: 'tab list down' })
        })
        await page.goto(`/deals/${dealId}`)
        await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
        await expect(byQa(page, 'documents.tab.error')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'deals.details.tab', { tab: 'documents' })).toBeVisible()
    } finally {
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test.fixme('#124: BUG host не передаёт moduleDisabled: settings disabled state', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-set-mod-off')
    try {
        await api.updateProjectModules(pid, ['deals', 'contacts'])
        await openDocumentsSettings(page, pid)
        await expect(byQa(page, 'documents.settings.moduleDisabled')).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#126 settings load error shows retry', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-set-err')
    try {
        await page.route(/\/modules\/documents\/settings/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await route.fulfill({ status: 503, body: 'settings down' })
        })
        await openDocumentsSettings(page, pid)
        await expect(byQa(page, 'documents.settings.error')).toBeVisible({ timeout: 30_000 })
        await page.unroute(/\/modules\/documents\/settings/)
        const retry = page.waitForResponse(
            (r) => r.url().includes('/modules/documents/settings') && r.ok(),
            { timeout: 20_000 },
        )
        await byQa(page, 'documents.settings.retry').click()
        await retry
        await expect(byQa(page, 'documents.settings.root')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#128 settings save disabled until form is dirty', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-set-dirty')
    try {
        await openDocumentsSettings(page, pid)
        await expect(byQa(page, 'documents.settings.save')).toBeDisabled({ timeout: 30_000 })
        await byQa(page, 'documents.settings.personal.field', { key: 'downloadTtlSec' }).fill(
            '1500',
        )
        await expect(byQa(page, 'documents.settings.save')).toBeEnabled()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#125 settings save error keeps form editable', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-set-save-err')
    try {
        await openDocumentsSettings(page, pid)
        await byQa(page, 'documents.settings.personal.field', { key: 'downloadTtlSec' }).fill(
            '1600',
        )
        await page.route(/\/modules\/documents\/settings/, async (route) => {
            if (route.request().method() !== 'PUT') {
                await route.continue()
                return
            }
            await route.fulfill({ status: 503, body: 'save failed' })
        })
        await byQa(page, 'documents.settings.save').click()
        await expect(page.getByText('Не удалось сохранить')).toBeVisible({ timeout: 20_000 })
        await expect(byQa(page, 'documents.settings.root')).toBeVisible()
        await expect(byQa(page, 'documents.settings.save')).toBeEnabled()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#123 without project:manage shows settings no-permission', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p1-set-nomanage')
    try {
        await denyProjectManage(page, pid)
        await page.goto(
            `/account/projects/${pid}/settings?tab=module:documents:DocumentsSettingsTab`,
        )
        await expect(byQa(page, 'documents.settings.noPermission')).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})
