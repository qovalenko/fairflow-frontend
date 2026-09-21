import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import {
    REPORTS_MODULES,
    gotoReports,
    seedReportsProject,
    selectTab,
    expectPresetRunOk,
    selectPeriod,
    waitPresetLoaded,
    type ReportsTab,
} from '../support/reports'

const PRESET_TABS: Array<{ catalog: number; tab: ReportsTab }> = [
    { catalog: 21, tab: 'sales' },
    { catalog: 22, tab: 'funnel' },
    { catalog: 23, tab: 'clients' },
    { catalog: 24, tab: 'activity' },
    { catalog: 25, tab: 'sources' },
    { catalog: 26, tab: 'by_managers' },
]

for (const { catalog, tab } of PRESET_TABS) {
    test(`catalog #${catalog} (P0): preset «${tab}» runs successfully`, async ({ page, api, useProject }) => {
        const pid = await seedReportsProject(api)
        await useProject(pid, [...REPORTS_MODULES])

        try {
            await gotoReports(page)
            await selectTab(page, tab)
            await expectPresetRunOk(page)
        } finally {
            await api.archiveProject(pid)
        }
    })
}

/**
 * Catalog #27 (P0): «Мои просрочки» — вкладка видна для only_own (admin on the stand
 * may not have only_own; skip gracefully if tab absent).
 */
test('catalog #27 (P0): my_overdue preset when tab available', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await gotoReports(page)
        const tab = byQa(page, 'reports.main.tab', { tab: 'my_overdue' })
        if ((await tab.count()) === 0) {
            test.skip(true, 'my_overdue tab not shown for current visibility scope on stand')
        }
        await tab.click()
        await waitPresetLoaded(page)
        await expectPresetRunOk(page)
    } finally {
        await api.archiveProject(pid)
    }
})

/**
 * Catalog #35 (P0): смена периода перезапускает RunReport.
 */
test('catalog #35 (P0): period change reruns report', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await gotoReports(page)
        await waitPresetLoaded(page)
        const runPromise = page.waitForResponse(
            (r) => r.url().includes('/v1/reports/') && r.url().includes('/run') && r.request().method() === 'POST',
            { timeout: 60_000 },
        )
        await selectPeriod(page, 'week')
        const res = await runPromise
        expect(res.ok(), `run after period change (${res.status()})`).toBeTruthy()
    } finally {
        await api.archiveProject(pid)
    }
})

/**
 * Catalog #44 (P0): переключатель «Диаграмма / Таблица» без нового API-запроса.
 */
test('catalog #44 (P0): chart/table toggle does not refetch', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await gotoReports(page)
        await waitPresetLoaded(page)
        let runCount = 0
        page.on('response', (r) => {
            if (r.url().includes('/v1/reports/') && r.url().includes('/run') && r.request().method() === 'POST') {
                runCount++
            }
        })
        await byQa(page, 'reports.preset.viewTable').click()
        await expect(byQa(page, 'reports.preset.table')).toBeVisible()
        await byQa(page, 'reports.preset.viewChart').click()
        await expect(byQa(page, 'reports.preset.chart').or(byQa(page, 'reports.preset.table'))).toBeVisible()
        expect(runCount, 'toggle must not POST /run').toBe(0)
    } finally {
        await api.archiveProject(pid)
    }
})
