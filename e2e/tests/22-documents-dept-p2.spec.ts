import { test, expect, catalogTest } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName, ADMIN_EMAIL } from '../support/env'
import { openDocumentsDept, seedDocumentsProject } from '../support/documents'
import { pickSelectOption } from '../support/ui'

test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

catalogTest(113, 'department filter by manager narrows rows', { needsUpload: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-dept-mgr')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'), {
            name: uniqueName('dept-mgr-doc'),
        })
        groupId = up.groupId
        await openDocumentsDept(page, pid)
        await expect(byQa(page, 'documents.dept.table')).toBeVisible({ timeout: 30_000 })
        await pickSelectOption(byQa(page, 'documents.dept.managerFilter'), ADMIN_EMAIL.split('@')[0]!)
        await expect(byQa(page, 'documents.dept.rowName', { group: groupId })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(114, 'department filters by template period drift and empty vars', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-dept-filters')
    const dealId = await api.createDeal(pid, uniqueName('deal-dept-f'))
    const tplName = uniqueName('tpl-dept-f')
    const tplId = await api.createTemplate(pid, tplName, 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await api.updateDeal(pid, dealId, { name: uniqueName('deal-dept-f-after') })
        await openDocumentsDept(page, pid)
        await expect(byQa(page, 'documents.dept.table')).toBeVisible({ timeout: 30_000 })

        await pickSelectOption(byQa(page, 'documents.dept.templateFilter'), tplName.slice(0, 12))
        const today = new Date().toISOString().slice(0, 10)
        await byQa(page, 'documents.dept.dateFrom').fill(today)
        await byQa(page, 'documents.dept.dateTo').fill(today)
        await byQa(page, 'documents.dept.driftFilter').locator('input').check()
        await expect(byQa(page, 'documents.dept.rowName', { group: groupId })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#115: department empty filter differs from empty period', async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-dept-empty')
    try {
        await openDocumentsDept(page, pid)
        const future = new Date()
        future.setFullYear(future.getFullYear() + 2)
        await byQa(page, 'documents.dept.dateFrom').fill(future.toISOString().slice(0, 10))
        await byQa(page, 'documents.dept.dateTo').fill(future.toISOString().slice(0, 10))
        await expect(byQa(page, 'documents.dept.empty')).toBeVisible({ timeout: 30_000 })

        await byQa(page, 'documents.dept.driftFilter').locator('input').check()
        await expect(byQa(page, 'documents.dept.emptyFilter')).toBeVisible({ timeout: 20_000 })
        await byQa(page, 'documents.dept.resetFilters').click()
        await expect(byQa(page, 'documents.dept.empty')).toBeVisible({ timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

catalogTest(116, 'department KPI drift enables drift filter', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-dept-kpi')
    const dealId = await api.createDeal(pid, uniqueName('deal-kpi'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-kpi'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await api.updateDeal(pid, dealId, { name: uniqueName('deal-kpi-after') })
        await openDocumentsDept(page, pid)
        await byQa(page, 'documents.dept.kpiDrift').click()
        await expect(byQa(page, 'documents.dept.driftFilter').locator('input')).toBeChecked()
        await expect(byQa(page, 'documents.dept.rowName', { group: groupId })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(117, 'department list pagination second page', { needsUpload: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-dept-page')
    const ids: string[] = []
    try {
        for (let i = 0; i < 26; i++) {
            const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'), {
                name: uniqueName(`dept-page-${i}`),
            })
            ids.push(up.groupId)
        }
        await openDocumentsDept(page, pid)
        await expect(byQa(page, 'documents.dept.table')).toBeVisible({ timeout: 30_000 })
        const page2 = page.waitForResponse(
            (r) =>
                r.url().includes('/v1/documents') &&
                r.request().method() === 'GET' &&
                r.url().includes('pageIndex=1'),
            { timeout: 30_000 },
        )
        await byQa(page, 'documents.dept.paginationNext').click()
        await page2
        await expect(byQa(page, 'documents.dept.table')).toBeVisible()
    } finally {
        for (const id of ids) await api.deleteDocument(pid, id).catch(() => {})
        await api.archiveProject(pid)
    }
})
