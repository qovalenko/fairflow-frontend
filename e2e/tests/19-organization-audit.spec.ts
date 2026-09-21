import { test, expect } from '../fixtures/test'
import { uniqueName } from '../support/env'
import { signInViaApi } from '../support/login'
import { openSettingsPage, seedOrgEmployee } from '../support/organization'
import { pickSelectOption } from '../support/ui'

/**
 * Organization — system audit journal (SCR-MORG-AUDIT / FR-MORG-40).
 */

test('#91: admin opens audit — human-readable action labels (seed: create dept via api before test)', async ({
    page,
    api,
}) => {
    const deptName = uniqueName('audit-dept')
    let deptId: string | undefined
    try {
        deptId = (await api.createDepartment({ name: deptName })).id

        await expect
            .poll(
                async () => {
                    const audit = await api.getOrgAudit({ pageSize: 50 })
                    return audit.list.some(
                        (entry) =>
                            String(entry.action ?? '') === 'department.created' ||
                            JSON.stringify(entry).includes(deptName),
                    )
                },
                { timeout: 45_000 },
            )
            .toBe(true)

        await openSettingsPage(page, '/settings/audit', 'Журнал аудита')
        await expect(page.getByText('Создан отдел', { exact: false }).first()).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (deptId) {
            try {
                await api.deleteDepartment(deptId)
            } catch {
                /* best-effort */
            }
        }
    }
})

test('#92: empty audit — new org impossible; mock GET audit → []', async ({ page }) => {
    await page.route('**/v1/system/audit**', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ list: [], nextCursor: '' }),
        }),
    )
    await page.goto('/settings/audit')
    await expect(page.getByRole('heading', { name: 'Журнал аудита', level: 2 })).toBeVisible({
        timeout: 30_000,
    })
    await expect(page.getByText('Записей в журнале пока нет.')).toBeVisible()
})

test('#93: filter empty + «Сбросить фильтры»', async ({ page, api }) => {
    await api.createDepartment({ name: uniqueName('audit-filter-dept') })
    await page.goto('/settings/audit')
    await expect(page.getByText('Создан отдел').first()).toBeVisible({ timeout: 30_000 })

    const dateFrom = page.locator('input[type="date"]').first()
    await dateFrom.fill('2099-01-01')
    await expect(page.getByText('По заданным фильтрам записей не найдено.')).toBeVisible({
        timeout: 15_000,
    })
    await page.getByRole('button', { name: 'Сбросить фильтры' }).click()
    await expect(page.getByText('Создан отдел').first()).toBeVisible({ timeout: 15_000 })
})

test('#94: filters: date range, user, action type, entity (interact with selects/inputs)', async ({
    page,
    api,
}) => {
    await api.createDepartment({ name: uniqueName('audit-filters-dept') })
    await page.goto('/settings/audit')
    await expect(page.getByText('Создан отдел').first()).toBeVisible({ timeout: 30_000 })

    const today = new Date().toISOString().slice(0, 10)
    await page.locator('input[type="date"]').first().fill(today)
    await page.locator('input[type="date"]').nth(1).fill(today)

    const selects = page.locator('.select-control')

    await pickSelectOption(selects.nth(0), 'Все пользователи')
    await pickSelectOption(selects.nth(1), 'Создан отдел')
    await pickSelectOption(selects.nth(2), 'Отдел')

    await expect(page.getByText('Создан отдел').first()).toBeVisible()
})

test('#95: expand metadata → JSON in pre', async ({ page, api }) => {
    await api.createDepartment({ name: uniqueName('audit-meta-dept') })
    await page.goto('/settings/audit')
    await expect(page.getByText('Создан отдел').first()).toBeVisible({ timeout: 30_000 })

    const expand = page.locator('button').filter({ has: page.locator('svg') }).first()
    await expand.click()
    await expect(page.locator('pre').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('pre').first()).toContainText('{')
})

test('#96: load more cursor pagination — mock or seed many entries; if hard, test.fixme', async ({
    page,
}) => {
    let calls = 0
    await page.route('**/v1/system/audit**', async (route) => {
        calls += 1
        const body =
            calls === 1
                ? {
                      list: [
                          {
                              id: 'audit-page-1',
                              action: 'department.created',
                              createdAt: new Date().toISOString(),
                              name: 'Admin',
                              metadata: { name: 'Dept A' },
                          },
                      ],
                      nextCursor: 'cursor-2',
                  }
                : {
                      list: [
                          {
                              id: 'audit-page-2',
                              action: 'department.created',
                              createdAt: new Date().toISOString(),
                              name: 'Admin',
                              metadata: { name: 'Dept B' },
                          },
                      ],
                      nextCursor: '',
                  }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(body),
        })
    })

    await page.goto('/settings/audit')
    await expect(page.getByText('Dept A')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Загрузить ещё' }).click()
    await expect(page.getByText('Dept B')).toBeVisible({ timeout: 15_000 })
})

test('#97: load error 5xx', async ({ page }) => {
    await page.route('**/v1/system/audit**', (route) =>
        route.fulfill({ status: 500, body: '{}' }),
    )
    await page.goto('/settings/audit')
    await expect(page.getByText('Не удалось загрузить журнал аудита.')).toBeVisible({
        timeout: 30_000,
    })
})

test('#101: action labels are human-readable — metadata still JSON in expand', async ({
    page,
    api,
}) => {
    await api.createDepartment({ name: uniqueName('audit-labels-dept') })
    await page.goto('/settings/audit')
    await expect(page.getByText('Создан отдел').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/department\.created|invitation\.created/i)).toHaveCount(0)

    const expand = page.locator('button').filter({ has: page.locator('svg') }).first()
    await expand.click()
    await expect(page.locator('pre').first()).toContainText('{')
})

test.describe('employee audit access', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('#98: employee direct URL /settings/audit → no access message', async ({ page, api }) => {
        const employee = await seedOrgEmployee(api, 'audit-emp')
        await signInViaApi(page, employee.email, employee.password)

        await page.goto('/settings/audit')
        await expect(
            page.getByText('У вас нет доступа к журналу аудита организации.'),
        ).toBeVisible({ timeout: 30_000 })
    })

    test('#99: audit nav hidden for employee (link «Журнал аудита» not visible)', async ({
        page,
        api,
    }) => {
        const employee = await seedOrgEmployee(api, 'audit-emp')
        await signInViaApi(page, employee.email, employee.password)

        await openSettingsPage(page, '/settings/colleagues', 'Коллеги')
        await expect(page.getByRole('link', { name: 'Коллеги' })).toBeVisible({ timeout: 30_000 })
        await expect(page.getByRole('link', { name: 'Журнал аудита' })).toHaveCount(0)
    })
})
