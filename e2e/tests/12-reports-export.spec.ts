import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { REPORTS_MODULES, gotoReports, seedReportsProject, waitPresetLoaded } from '../support/reports'

/**
 * Catalog #47 (P0): экспорт CSV — toast + скачивание.
 */
test('catalog #47 (P0): export CSV downloads file', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await gotoReports(page)
        await waitPresetLoaded(page)
        const downloadPromise = page.waitForEvent('download', { timeout: 30_000 })
        await byQa(page, 'reports.preset.export').click()
        const download = await downloadPromise
        expect(download.suggestedFilename()).toMatch(/\.csv$/i)
    } finally {
        await api.archiveProject(pid)
    }
})
