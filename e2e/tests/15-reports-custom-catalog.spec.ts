import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { REPORTS_MODULES, gotoReports, seedReportsProject, waitPresetLoaded } from '../support/reports'

/**
 * Catalog #80 (P0): «Открыть» custom из списка → ?custom=id + RunReport.
 * Catalog #81 (P0): deep-link /reports?custom={id}.
 * Catalog #82 (P0): «Изменить» → builder?edit={id}.
 * Catalog #83 (P0): «Удалить» → confirm → DELETE.
 */
test('catalog #80/#81/#82/#83 (P0): custom catalog open, deeplink, edit, delete', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])
    const name = uniqueName('catalog')
    let reportId: string | undefined

    try {
        reportId = await api.createReport(pid, {
            name,
            spec: {
                entity: 'deals',
                measures: [{ fn: 'count', alias: 'count' }],
                groupBy: [{ field: 'month' }],
                viz: { type: 'table' },
            },
        })

        // #81 deep-link
        await page.goto(`/reports?custom=${encodeURIComponent(reportId)}`)
        await expect(byQa(page, 'reports.preset.content').or(byQa(page, 'reports.state.emptyData'))).toBeVisible({
            timeout: 60_000,
        })

        // back to list view
        await byQa(page, 'reports.custom.back').click()
        await expect(byQa(page, 'reports.list.row', { report: reportId })).toBeVisible()

        // #80 open from list
        await byQa(page, 'reports.list.open', { report: reportId }).click()
        await expect(page).toHaveURL(new RegExp(`[?&]custom=${reportId}`))

        await byQa(page, 'reports.custom.back').click()

        // #82 edit
        await byQa(page, 'reports.list.edit', { report: reportId }).click()
        await expect(page).toHaveURL(new RegExp(`edit=${reportId}`))

        await page.goto('/reports')
        await expect(byQa(page, 'reports.list.row', { report: reportId })).toBeVisible()
        page.once('dialog', (d) => d.accept())
        const deletePromise = page.waitForResponse(
            (r) => r.url().includes(`/v1/reports/${reportId}`) && r.request().method() === 'DELETE',
            { timeout: 30_000 },
        )
        await byQa(page, 'reports.list.delete', { report: reportId }).click()
        expect((await deletePromise).ok()).toBeTruthy()
        await expect(byQa(page, 'reports.list.row', { report: reportId! })).toHaveCount(0)
        reportId = undefined
    } finally {
        if (reportId) await api.deleteReport(pid, reportId).catch(() => {})
        await api.archiveProject(pid)
    }
})
