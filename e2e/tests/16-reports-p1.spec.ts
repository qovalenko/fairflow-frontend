import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    REPORTS_MODULES,
    gotoReports,
    seedReportsProject,
    waitPresetLoaded,
    selectTab,
} from '../support/reports'

/**
 * Catalog #5 (P1): все CRM-источники выключены → NoPresetsState.
 */
test('catalog #5 (P1): no CRM sources shows NoPresetsState', async ({ page, api, useProject }) => {
    const pid = await api.createProject(uniqueName('reports-only'), ['reports'])
    await useProject(pid, ['reports'])

    try {
        // NoPresetsState hides TabList — do not wait for reports.main.tabList.
        await page.goto('/reports')
        await expect(byQa(page, 'reports.main.title')).toBeVisible({ timeout: 60_000 })
        await expect(byQa(page, 'reports.state.noPresets')).toBeVisible({ timeout: 60_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

/**
 * Catalog #16 (P1): пустой проект → «Нет данных за период» (не ошибка).
 */
test('catalog #16 (P1): empty project shows empty data state', async ({ page, api, useProject }) => {
    const pid = await api.createProject(uniqueName('empty-rep'), [...REPORTS_MODULES])
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await gotoReports(page)
        await waitPresetLoaded(page)
        await expect(byQa(page, 'reports.state.emptyData')).toBeVisible({ timeout: 60_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

/**
 * Catalog #41 (P1): фильтр pipeline вне данных → EmptyFilterState + сброс.
 */
test('catalog #41 (P1): pipeline filter empty → reset', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await gotoReports(page)
        await selectTab(page, 'sales')
        await byQa(page, 'reports.main.pipelineFilter').fill('nonexistent-pipeline-id-xyz')
        await expect(byQa(page, 'reports.state.emptyFilter')).toBeVisible({ timeout: 60_000 })
        await byQa(page, 'reports.main.resetFilter').click()
        await expect(byQa(page, 'reports.main.pipelineFilter')).toHaveValue('')
    } finally {
        await api.archiveProject(pid)
    }
})

/**
 * Catalog #70 (P1): пустое имя в конструкторе → inline-ошибка.
 */
test('catalog #70 (P1): builder rejects empty name', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await page.goto('/reports/builder')
        await expect(byQa(page, 'reports.builder.root')).toBeVisible({ timeout: 60_000 })
        await byQa(page, 'reports.builder.save').click()
        await byQa(page, 'reports.builder.name').fill('')
        await byQa(page, 'reports.builder.submit').click()
        await expect(byQa(page, 'reports.builder.nameError')).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

/**
 * Catalog #72 (P1): dirty-guard при уходе из конструктора.
 */
test('catalog #72 (P1): builder dirty guard on back', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await page.goto('/reports/builder')
        await expect(byQa(page, 'reports.builder.root')).toBeVisible({ timeout: 60_000 })
        await byQa(page, 'reports.builder.entity', { entity: 'contacts' }).click()
        page.once('dialog', (d) => {
            expect(d.message()).toContain('Несохранённые изменения')
            d.dismiss()
        })
        await byQa(page, 'reports.builder.back').click()
        await expect(page).toHaveURL(/\/reports\/builder/)
    } finally {
        await api.archiveProject(pid)
    }
})

/**
 * Catalog #85 (P1): ?custom={deletedId} → ErrorState + retry.
 */
test('catalog #85 (P1): deleted custom deep-link shows error', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])
    const id = await api.createReport(pid, {
        name: uniqueName('gone'),
        spec: { entity: 'deals', measures: [{ fn: 'count' }], groupBy: [{ field: 'month' }] },
    })

    try {
        await api.deleteReport(pid, id)
        await page.goto(`/reports?custom=${encodeURIComponent(id)}`)
        await expect(byQa(page, 'reports.state.error')).toBeVisible({ timeout: 60_000 })
        await expect(byQa(page, 'reports.state.retry')).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

/**
 * Catalog #79 (P1): пустой каталог + canManage → подсказка конструктора.
 */
test('catalog #79 (P1): empty custom list shows builder hint', async ({ page, api, useProject }) => {
    const pid = await seedReportsProject(api)
    await useProject(pid, [...REPORTS_MODULES])

    try {
        await gotoReports(page)
        await expect(byQa(page, 'reports.list.emptyHint')).toBeVisible({ timeout: 60_000 })
    } finally {
        await api.archiveProject(pid)
    }
})
