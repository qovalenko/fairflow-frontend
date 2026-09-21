import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { pickGenerateTemplate } from '../support/documents'
import { ApiClient } from '../fixtures/api'

/**
 * P0 tab + generate scenarios (#58, #59, #73, #74, #76).
 * Requires local deals+orders remotes with qa-ids (extend run-hybrid.sh).
 */
test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

test.describe('documents tab + generate P0', () => {
    test.fixme(
        process.env.E2E_DEALS_ORDERS !== '1',
        'needs local deals+orders qa-id builds in hybrid (set E2E_DEALS_ORDERS=1)',
    )
    test('#73 deal card documents tab lists record docs', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-tab-deal'))
        const dealId = await api.createDeal(pid, uniqueName('deal-tab'))
        const tplId = await api.createTemplate(pid, uniqueName('tpl-tab-deal'), 'deal', true)
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            const gen = await api.generateDocument(pid, {
                templateId: tplId,
                contextType: 'deal',
                recordId: dealId,
            })
            groupId = gen.groupId
            await page.goto(`/deals/${dealId}`)
            await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
            await expect(byQa(page, 'documents.tab.root')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'documents.tab.row', { group: groupId })).toBeVisible()
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.deleteTemplate(pid, tplId).catch(() => {})
            await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#74 order card documents tab lists record docs', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-tab-order'))
        const orderId = await api.createOrder(pid, uniqueName('order-tab'))
        const tplId = await api.createTemplate(pid, uniqueName('tpl-tab-order'), 'order', true)
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            const gen = await api.generateDocument(pid, {
                templateId: tplId,
                contextType: 'order',
                recordId: orderId,
            })
            groupId = gen.groupId
            await page.goto(`/orders/${orderId}`)
            await byQa(page, 'orders.details.tab', { tab: 'documents' }).click()
            await expect(byQa(page, 'documents.tab.root')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'documents.tab.row', { group: groupId })).toBeVisible()
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.deleteTemplate(pid, tplId).catch(() => {})
            await api.deleteOrder(pid, orderId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#76 tab upload binds contextType+recordId', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-tab-upload'))
        const dealId = await api.createDeal(pid, uniqueName('deal-upl'))
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            await page.goto(`/deals/${dealId}`)
            await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
            const uploadResp = page.waitForResponse(
                (r) => r.url().includes('/v1/documents/upload') && r.request().method() === 'POST',
                { timeout: 30_000 },
            )
            await byQa(page, 'documents.tab.upload').click()
            await byQa(page, 'documents.tab.uploadInput').setInputFiles({
                name: `${uniqueName('tab')}.pdf`,
                mimeType: 'application/pdf',
                buffer: await import('node:fs').then((fs) =>
                    fs.promises.readFile(api.fixturePath('sample.pdf')),
                ),
            })
            const res = await uploadResp
            expect(res.ok()).toBeTruthy()
            groupId = ((await res.json()) as { group: { groupId: string } }).group.groupId
            await expect(
                byQa(page, 'documents.tab.row', { group: groupId! }),
            ).toBeVisible({ timeout: 30_000 })
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#58 generate from deal tab — template pick, v1, list refresh', async ({
        page,
        api,
        useProject,
    }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-gen-deal'))
        const dealId = await api.createDeal(pid, uniqueName('deal-gen-ui'))
        const tplId = await api.createTemplate(pid, uniqueName('tpl-gen-deal'), 'deal', true)
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            await page.goto(`/deals/${dealId}`)
            await byQa(page, 'deals.details.tab', { tab: 'documents' }).click()
            await byQa(page, 'documents.tab.generate').click()
            await expect(byQa(page, 'documents.generate.dialog')).toBeVisible()
            await pickGenerateTemplate(page, tplId)
            const gen = page.waitForResponse(
                (r) => r.url().includes('/v1/documents/generate') && r.request().method() === 'POST',
                { timeout: 30_000 },
            )
            await byQa(page, 'documents.generate.submit').click()
            const res = await gen
            expect(res.ok()).toBeTruthy()
            groupId = ((await res.json()) as { group: { groupId: string } }).group.groupId
            await expect(
                byQa(page, 'documents.tab.row', { group: groupId! }),
            ).toBeVisible({ timeout: 30_000 })
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.deleteTemplate(pid, tplId).catch(() => {})
            await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#59 generate from order tab', async ({ page, api, useProject }) => {
        const modules = ApiClient.documentsModules()
        const pid = await api.createDocumentsProject(uniqueName('docs-gen-order'))
        const orderId = await api.createOrder(pid, uniqueName('order-gen-ui'))
        const tplId = await api.createTemplate(pid, uniqueName('tpl-gen-order'), 'order', true)
        let groupId: string | undefined
        await useProject(pid, modules)

        try {
            await page.goto(`/orders/${orderId}`)
            await byQa(page, 'orders.details.tab', { tab: 'documents' }).click()
            await byQa(page, 'documents.tab.generate').click()
            await pickGenerateTemplate(page, tplId)
            const gen = page.waitForResponse(
                (r) => r.url().includes('/v1/documents/generate') && r.request().method() === 'POST',
                { timeout: 30_000 },
            )
            await byQa(page, 'documents.generate.submit').click()
            const res = await gen
            expect(res.ok()).toBeTruthy()
            groupId = ((await res.json()) as { group: { groupId: string } }).group.groupId
            await expect(
                byQa(page, 'documents.tab.row', { group: groupId! }),
            ).toBeVisible({ timeout: 30_000 })
        } finally {
            if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
            await api.deleteTemplate(pid, tplId).catch(() => {})
            await api.deleteOrder(pid, orderId).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
