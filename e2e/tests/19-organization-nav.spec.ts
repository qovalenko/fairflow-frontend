import { test, expect } from '../fixtures/test'
import { STORAGE_KEYS } from '../support/env'
import { clickSettingsNav, openSettingsPage } from '../support/organization'

/**
 * Organization — unified settings navigation (SettingsNav / SystemSettingsLayout).
 */

test('#143: SettingsNav transitions Реквизиты → Подразделения → Сотрудники → Коллеги → Аудит', async ({
    page,
}) => {
    await openSettingsPage(page, '/settings', 'Реквизиты')

    await clickSettingsNav(page, 'Подразделения')
    await expect(page.getByRole('heading', { name: 'Подразделения', level: 2 })).toBeVisible({
        timeout: 30_000,
    })

    await clickSettingsNav(page, 'Сотрудники')
    await expect(page.getByRole('heading', { name: 'Сотрудники', level: 2 })).toBeVisible({
        timeout: 30_000,
    })

    await clickSettingsNav(page, 'Коллеги')
    await expect(page.getByRole('heading', { name: 'Коллеги' })).toBeVisible({ timeout: 30_000 })

    await clickSettingsNav(page, 'Журнал аудита')
    await expect(page.getByRole('heading', { name: 'Журнал аудита', level: 2 })).toBeVisible({
        timeout: 30_000,
    })
})

test('#144: fail-closed: mutate buttons disabled while permissions loading — hard to observe; test that «Создать отдел» visible for admin after load', async ({
    page,
}) => {
    await page.goto('/settings/departments')
    await expect(page.getByRole('heading', { name: 'Подразделения', level: 2 })).toBeVisible({
        timeout: 30_000,
    })
    await expect(page.getByRole('button', { name: 'Создать отдел' })).toBeVisible({
        timeout: 30_000,
    })
})

test('#145: expired session → redirect signin: clear token in localStorage mid-page', async ({
    page,
}) => {
    await page.goto('/settings/departments')
    await expect(page.getByRole('heading', { name: 'Подразделения', level: 2 })).toBeVisible({
        timeout: 30_000,
    })

    await page.evaluate((tokenKey) => {
        localStorage.removeItem(tokenKey)
    }, STORAGE_KEYS.token)

    await page.goto('/settings/employees')
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 30_000 })
})

test.fixme('#146: after transfer ownership old owner sees admin role — test.fixme destructive', async () => {
    // Destructive: transferOwnership mutates the stand owner; not safe on shared QA.
})
