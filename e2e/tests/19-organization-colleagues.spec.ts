import { test, expect } from '../fixtures/test'
import { openSettingsPage } from '../support/organization'

/**
 * Organization — colleague directory (SCR-MORG-DIRECTORY / FR-ORG-150).
 */

test('#84: directory table loads with columns Сотрудник/Должность/Подразделение/Руководитель', async ({
    page,
}) => {
    await page.goto('/settings/colleagues')
    await expect(page.getByRole('heading', { name: 'Коллеги' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('columnheader', { name: 'Сотрудник' })).toBeVisible({
        timeout: 30_000,
    })
    await expect(page.getByRole('columnheader', { name: 'Должность' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Подразделение' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Руководитель' })).toBeVisible()
})

test('#85: empty directory — route mock GET colleagues → []', async ({ page }) => {
    await page.route('**/v1/system/colleagues**', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '[]',
        }),
    )
    await page.goto('/settings/colleagues')
    await expect(page.getByText('Пока нет активных коллег в системе.')).toBeVisible({
        timeout: 30_000,
    })
})

test('#86: load error 5xx', async ({ page }) => {
    await page.route('**/v1/system/colleagues**', (route) =>
        route.fulfill({ status: 500, body: '{}' }),
    )
    await page.goto('/settings/colleagues')
    await expect(page.getByText('Не удалось загрузить директорию коллег')).toBeVisible({
        timeout: 30_000,
    })
})

test('#87: click UserProfileLink — click colleague name link if present', async ({ page }) => {
    await openSettingsPage(page, '/settings/colleagues', 'Коллеги')

    const profileLink = page.locator('button[data-profile-deep-link]').first()
    const linkCount = await profileLink.count()
    if (linkCount === 0) {
        test.skip(true, 'No colleagues with profile links in directory on this stand')
    }

    await profileLink.click()
    await expect(page.getByRole('heading', { name: 'Профиль коллеги', level: 2 })).toBeVisible({
        timeout: 15_000,
    })
})
