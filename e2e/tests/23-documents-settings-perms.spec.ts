import { test, expect, catalogTest } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    denyDocumentsManage,
    openDocumentsList,
    openDocumentsSettings,
    seedDocumentsProject,
    setManagerDocumentsRole,
} from '../support/documents'

test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

test('#122: settings integration read-only without documents manage', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-set-ro-int')
    try {
        await denyDocumentsManage(page, pid)
        await openDocumentsSettings(page, pid)
        await expect(byQa(page, 'documents.settings.integrationReadOnly')).toBeVisible({
            timeout: 30_000,
        })
        const storageField = byQa(page, 'documents.settings.integration.field', {
            key: 'storageProvider',
        })
        await expect(storageField).toBeVisible()
        await storageField.click({ force: true })
        await expect(byQa(page, 'documents.settings.save')).toBeDisabled()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#127: downloadTtlSec below minimum keeps save disabled', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-set-ttl-val')
    try {
        await openDocumentsSettings(page, pid)
        await byQa(page, 'documents.settings.personal.field', { key: 'downloadTtlSec' }).fill('0')
        await expect(byQa(page, 'documents.settings.save')).toBeDisabled({ timeout: 10_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(143, 'manager role can delete documents from list', { needsUpload: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-mgr-del')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await setManagerDocumentsRole(page, pid)
        await openDocumentsList(page, pid)
        await expect(byQa(page, 'documents.list.delete', { group: groupId })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#144: manager cannot CRUD templates in UI', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-mgr-no-tpl')
    const tplId = await api.createTemplate(pid, uniqueName('tpl-mgr-hide'), 'deal', true)
    try {
        await setManagerDocumentsRole(page, pid)
        await page.goto(`/p/${pid}/documents/templates`)
        await expect(byQa(page, 'documents.templates.new')).toHaveCount(0)
        await expect(byQa(page, 'documents.templates.publish', { template: tplId })).toHaveCount(0)
        await page.goto(`/p/${pid}/documents/templates/new`)
        await expect(byQa(page, 'documents.templateForm.noPermission')).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.archiveProject(pid)
    }
})
