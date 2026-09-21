import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    REPORTS_MODULES,
    gotoReports,
    seedReportsProject,
    saveCustomReportViaBuilder,
} from '../support/reports'

/**
 * Catalog #67 (P0): MAIN → «Конструктор» при reports:manage.
 */
test('catalog #67 (P0): navigate to builder', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await gotoReports(page)
        await byQa(page, 'reports.main.builder').click()
        await expect(page).toHaveURL(/\/reports\/builder/)
        await expect(byQa(page, 'reports.builder.root')).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

/**
 * Catalog #69 (P0): создание custom → POST → redirect ?custom=id.
 */
test('catalog #69 (P0): create custom report via builder', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])
    const name = uniqueName('custom')

    try {
        await page.goto('/reports/builder')
        await expect(byQa(page, 'reports.builder.root')).toBeVisible({ timeout: 60_000 })
        await saveCustomReportViaBuilder(page, name)
        await expect(byQa(page, 'reports.preset.content').or(byQa(page, 'reports.state.emptyData'))).toBeVisible({
            timeout: 60_000,
        })
    } finally {
        const customs = (await api.listReports(pid)).filter((r) => r.kind === 'custom')
        for (const r of customs) {
            if (r.name.startsWith('t029-')) await api.deleteReport(pid, r.id)
        }
        await api.archiveProject(pid)
    }
})

/**
 * Catalog #74 (P0): /reports/builder?edit={id} загружает spec.
 * Catalog #75 (P0): PATCH update → toast → redirect на прогон.
 */
test('catalog #74/#75 (P0): edit custom loads form and PATCH updates', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])
    const name = uniqueName('edit-me')
    let reportId: string | undefined

    try {
        reportId = await api.createReport(pid, {
            name,
            description: 'e2e original',
            spec: {
                entity: 'deals',
                measures: [{ fn: 'count', alias: 'count' }],
                groupBy: [{ field: 'month' }],
                viz: { type: 'bar' },
            },
        })
        await page.goto(`/reports/builder?edit=${encodeURIComponent(reportId)}`)
        await expect(byQa(page, 'reports.builder.root')).toBeVisible({ timeout: 60_000 })
        await expect(byQa(page, 'reports.builder.entity', { entity: 'deals' })).toBeVisible()

        await byQa(page, 'reports.builder.save').click()
        await byQa(page, 'reports.builder.name').fill(`${name}-updated`)
        const patchPromise = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/reports/${reportId}`) && r.request().method() === 'PATCH',
            { timeout: 30_000 },
        )
        await byQa(page, 'reports.builder.submit').click()
        const patchRes = await patchPromise
        expect(patchRes.ok(), `PATCH report (${patchRes.status()})`).toBeTruthy()
        await expect(page).toHaveURL(new RegExp(`[?&]custom=${reportId}`), { timeout: 30_000 })
    } finally {
        if (reportId) await api.deleteReport(pid, reportId).catch(() => {})
        await api.archiveProject(pid)
    }
})
