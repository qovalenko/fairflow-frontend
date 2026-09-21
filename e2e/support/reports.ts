import { expect, type Page } from '@playwright/test'
import type { ApiClient } from '../fixtures/api'
import { byQa } from './qa'
import { uniqueName } from './env'

/** Modules needed for full reports preset coverage on the stand. */
export const REPORTS_MODULES = [
    'deals',
    'contacts',
    'companies',
    'activities',
    'reports',
] as const

export type ReportsTab =
    | 'sales'
    | 'funnel'
    | 'clients'
    | 'activity'
    | 'sources'
    | 'by_managers'
    | 'my_overdue'

/** Seed a project with CRM data for preset runs (deals + contact). */
export async function seedReportsProject(api: ApiClient): Promise<string> {
    const pid = await api.createProject(uniqueName('reports'), [...REPORTS_MODULES])
    await api.createContact(pid, {
        firstName: 'E2E',
        lastName: uniqueName('rep').replace(/[^a-zA-Z0-9-]/g, ''),
        email: `${uniqueName('rep')}@example.test`.toLowerCase(),
    })
    await api.createDeal(pid, {
        name: uniqueName('deal'),
        amount: 50000,
        source: 'web',
    })
    return pid
}

/** Navigate to /reports and wait for the main shell. */
export async function gotoReports(page: Page): Promise<void> {
    await page.goto('/reports')
    await expect(byQa(page, 'reports.main.title')).toBeVisible({ timeout: 60_000 })
    await expect(byQa(page, 'reports.main.tabList')).toBeVisible({ timeout: 60_000 })
}

/** Wait until the active preset finished its first RunReport (or empty state). */
export async function waitPresetLoaded(page: Page): Promise<void> {
    await expect(byQa(page, 'reports.preset.content').or(byQa(page, 'reports.state.emptyData'))).toBeVisible({
        timeout: 60_000,
    })
}

/** Change reporting period via the period select (qa-id options). */
export async function selectPeriod(page: Page, period: 'today' | 'week' | 'month' | 'quarter' | 'year'): Promise<void> {
    await byQa(page, 'reports.main.period').click()
    await byQa(page, 'reports.main.periodOption', { period }).click()
    await waitPresetLoaded(page)
}

export async function selectTab(page: Page, tab: ReportsTab): Promise<void> {
    await byQa(page, 'reports.main.tab', { tab }).click()
    await waitPresetLoaded(page)
}

/** Assert RunReport succeeded: updated-at stamp visible (not error state). */
export async function expectPresetRunOk(page: Page): Promise<void> {
    await expect(byQa(page, 'reports.state.error')).toHaveCount(0)
    await expect(
        byQa(page, 'reports.preset.updatedAt').or(byQa(page, 'reports.state.emptyData')),
    ).toBeVisible({ timeout: 60_000 })
}

/** Click first drillable table row (falls back to any row with drillable=yes). */
export async function openFirstDrillRow(page: Page): Promise<void> {
    await byQa(page, 'reports.preset.viewTable').click()
    const row = byQa(page, 'reports.preset.tableRow', { drillable: 'yes' }).first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    await row.click()
    await expect(byQa(page, 'reports.drill.drawer')).toBeVisible({ timeout: 30_000 })
}

/** Save a new custom report via builder UI; returns report name used. */
export async function saveCustomReportViaBuilder(page: Page, name: string): Promise<void> {
    await byQa(page, 'reports.builder.save').click()
    await expect(byQa(page, 'reports.builder.saveDialog')).toBeVisible()
    await byQa(page, 'reports.builder.name').fill(name)
    const createResponse = page.waitForResponse(
        (r) => r.url().includes('/v1/reports') && r.request().method() === 'POST',
        { timeout: 30_000 },
    )
    await byQa(page, 'reports.builder.submit').click()
    const res = await createResponse
    expect(res.ok(), `create report POST (${res.status()})`).toBeTruthy()
    await expect(page).toHaveURL(/[?&]custom=/, { timeout: 30_000 })
}
