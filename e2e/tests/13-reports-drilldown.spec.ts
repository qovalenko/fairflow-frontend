import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import {
    REPORTS_MODULES,
    gotoReports,
    seedReportsProject,
    waitPresetLoaded,
    openFirstDrillRow,
    selectPeriod,
} from '../support/reports'

/**
 * Catalog #51 (P0): клик по drillable строке → drawer «Записи за …».
 */
test('catalog #51 (P0): drillable row opens drawer', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await gotoReports(page)
        await waitPresetLoaded(page)
        await openFirstDrillRow(page)
        await expect(byQa(page, 'reports.drill.drawer')).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

/**
 * Catalog #54 (P0): клик по названию записи → переход на карточку сделки.
 */
test('catalog #54 (P0): drill record navigates to deal card', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await gotoReports(page)
        await waitPresetLoaded(page)
        await openFirstDrillRow(page)
        const record = byQa(page, 'reports.drill.record').first()
        await expect(record).toBeVisible({ timeout: 30_000 })
        await record.click()
        await expect(page).toHaveURL(/\/deals\//, { timeout: 30_000 })
        await expect(byQa(page, 'reports.drill.drawer')).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})

/**
 * Catalog #57 (P0): закрытие drawer сохраняет фильтры пресета.
 */
test('catalog #57 (P0): closing drill drawer keeps filters', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await gotoReports(page)
        await waitPresetLoaded(page)
        // Period is a real filter that does not empty the seeded table
        // (a fake pipelineId would flip EmptyFilterState and hide drill rows).
        await selectPeriod(page, 'week')
        await openFirstDrillRow(page)
        await byQa(page, 'reports.drill.close').click()
        await expect(byQa(page, 'reports.drill.drawer')).toHaveCount(0)
        await expect(byQa(page, 'reports.main.periodOption', { period: 'week' })).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})
