import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import {
    REPORTS_MODULES,
    gotoReports,
    seedReportsProject,
    selectTab,
    waitPresetLoaded,
} from '../support/reports'

/**
 * Catalog #1 (P0): sidebar → «Отчёты» при включённом модуле reports.
 */
test('catalog #1: open Reports from sidebar', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await page.goto('/')
        await byQa(page, 'host.sidebar.item', { nav: 'reports' }).click()
        await expect(page).toHaveURL(/\/reports/)
        await expect(byQa(page, 'reports.main.title')).toBeVisible({ timeout: 60_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

/**
 * Catalog #14 (P0): переключение вкладок пресетов без перезагрузки страницы.
 */
test('catalog #14: preset tabs switch without full reload', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await gotoReports(page)
        await waitPresetLoaded(page)
        await selectTab(page, 'sales')
        await expect(byQa(page, 'reports.main.tab', { tab: 'sales' })).toBeVisible()
        await selectTab(page, 'funnel')
        await expect(byQa(page, 'reports.main.tab', { tab: 'funnel' })).toBeVisible()
        await expect(page).toHaveURL(/\/reports/)
    } finally {
        await api.archiveProject(pid)
    }
})
