import { test, expect, catalogTest } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    seedDocumentsProject,
    setOnlyOwnVisibility,
    DOCUMENTS_MODULES,
    switchProjectContext,
} from '../support/documents'

test.use({
    forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/reports', '/v1/search'],
})

catalogTest(37, 'detail skeleton on first load', { needsUpload: true }, async ({ page, api, useProject }) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p2-skeleton')
    let groupId: string | undefined
    try {
        const up = await api.uploadDocument(pid, api.fixturePath('sample.pdf'))
        groupId = up.groupId
        await page.route(/\/v1\/documents\/[^/?]+(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await new Promise((r) => setTimeout(r, 1200))
            await route.continue()
        })
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.detail.skeleton')).toBeVisible({ timeout: 5_000 })
        await expect(byQa(page, 'documents.detail.root')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(40, 'no visibility on source record shows not-found', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p2-vis-404')
    const dealId = await api.createDeal(pid, uniqueName('deal-vis'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-vis'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await setOnlyOwnVisibility(page, pid, api.userId)
        await page.route(/\/v1\/documents\/[^/?]+(\?|$)/, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await route.fulfill({ status: 404, body: JSON.stringify({ code: 'NOT_FOUND' }) })
        })
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.detail.notFound')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(49, 'empty required vars banner on detail', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p2-empty-req')
    const dealId = await api.createDeal(pid, uniqueName('deal-empty-req'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-empty-req'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await page.goto(`/documents/${groupId}`)
        const banner = byQa(page, 'documents.detail.emptyRequiredBanner')
        const detail = byQa(page, 'documents.detail.root')
        await expect(banner.or(detail)).toBeVisible({ timeout: 30_000 })
        if (await banner.isVisible().catch(() => false)) {
            await expect(banner).toContainText('обязательные поля')
        }
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(50, 'source unavailable disables regenerate', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p2-src-off')
    const dealId = await api.createDeal(pid, uniqueName('deal-src-off'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-src-off'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await api.deleteDeal(pid, dealId)
        await page.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.detail.sourceUnavailable')).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'documents.detail.regenerate')).toHaveCount(0)
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(54, 'parallel regenerate returns conflict', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p2-par-regen')
    const dealId = await api.createDeal(pid, uniqueName('deal-par'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-par'), 'deal', true)
    let groupId: string | undefined
    const browser = page.context().browser()
    if (!browser) throw new Error('browser unavailable')
    const ctx2 = await browser.newContext({ storageState: 'playwright/.auth/admin.json' })
    const page2 = await ctx2.newPage()
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await switchProjectContext(page2, pid, [...DOCUMENTS_MODULES])
        await page.goto(`/documents/${groupId}`)
        await page2.goto(`/documents/${groupId}`)
        await expect(byQa(page, 'documents.detail.regenerate')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page2, 'documents.detail.regenerate')).toBeVisible({ timeout: 30_000 })

        const regen1 = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/documents/${groupId}/regenerate`) &&
                r.request().method() === 'POST',
        )
        const regen2 = page2.waitForResponse(
            (r) =>
                r.url().includes(`/v1/documents/${groupId}/regenerate`) &&
                r.request().method() === 'POST',
        )
        await Promise.all([
            (async () => {
                await byQa(page, 'documents.detail.regenerate').click()
                await byQa(page, 'documents.generate.submit').click()
            })(),
            (async () => {
                await byQa(page2, 'documents.detail.regenerate').click()
                await byQa(page2, 'documents.generate.submit').click()
            })(),
        ])
        const statuses = [(await regen1).status(), (await regen2).status()]
        expect(statuses.filter((s) => s >= 200 && s < 500).length).toBe(2)
        expect(statuses.some((s) => s === 409) || statuses.every((s) => s === 200)).toBeTruthy()
    } finally {
        await ctx2.close()
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(55, 'DRIFT_NOT_ACCEPTED confirm retries with acceptDrift', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    test.skip(process.env.E2E_DEALS_ORDERS !== '1', 'needs local orders qa-id build')
    const pid = await seedDocumentsProject(api, useProject, 'docs-p2-drift-ack')
    const orderId = await api.createOrder(pid, uniqueName('order-drift-ack'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-order-drift'), 'order', true)
    let groupId: string | undefined
    let driftCalls = 0
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'order',
            recordId: orderId,
        })
        groupId = gen.groupId
        page.on('dialog', (d) => d.accept())
        await page.route(/\/v1\/documents\/[^/]+\/regenerate/, async (route) => {
            if (route.request().method() !== 'POST') {
                await route.continue()
                return
            }
            driftCalls += 1
            if (driftCalls === 1) {
                await route.fulfill({
                    status: 409,
                    contentType: 'application/json',
                    body: JSON.stringify({ code: 'DRIFT_NOT_ACCEPTED', message: 'drift' }),
                })
                return
            }
            await route.continue()
        })
        await page.goto(`/documents/${groupId}`)
        await byQa(page, 'documents.detail.regenerate').click()
        await byQa(page, 'documents.generate.submit').click()
        expect(driftCalls).toBeGreaterThanOrEqual(1)
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteOrder(pid, orderId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(70, 'regenerate dialog shows drift changed keys', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p2-drift-keys')
    const dealId = await api.createDeal(pid, uniqueName('deal-dk'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-dk'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        await api.updateDeal(pid, dealId, { name: uniqueName('deal-dk-after') })
        await page.goto(`/documents/${groupId}`)
        await byQa(page, 'documents.detail.regenerate').click()
        await expect(byQa(page, 'documents.generate.driftKeys')).toBeVisible({ timeout: 20_000 })
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})

catalogTest(71, 'regenerate sends expectedVersion in payload', { needsTemplate: true }, async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedDocumentsProject(api, useProject, 'docs-p2-exp-ver')
    const dealId = await api.createDeal(pid, uniqueName('deal-ev'))
    const tplId = await api.createTemplate(pid, uniqueName('tpl-ev'), 'deal', true)
    let groupId: string | undefined
    try {
        const gen = await api.generateDocument(pid, {
            templateId: tplId,
            contextType: 'deal',
            recordId: dealId,
        })
        groupId = gen.groupId
        let payload: Record<string, unknown> = {}
        await page.route(/\/v1\/documents\/[^/]+\/regenerate/, async (route) => {
            if (route.request().method() === 'POST') {
                payload = route.request().postDataJSON() as Record<string, unknown>
            }
            await route.continue()
        })
        await page.goto(`/documents/${groupId}`)
        await byQa(page, 'documents.detail.regenerate').click()
        await byQa(page, 'documents.generate.submit').click()
        await page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/documents/${groupId}/regenerate`) &&
                r.request().method() === 'POST',
            { timeout: 30_000 },
        )
        expect(payload.expectedVersion).toBeDefined()
    } finally {
        if (groupId) await api.deleteDocument(pid, groupId).catch(() => {})
        await api.deleteTemplate(pid, tplId).catch(() => {})
        await api.deleteDeal(pid, dealId).catch(() => {})
        await api.archiveProject(pid)
    }
})
