import { test, expect } from '../fixtures/test'
import { uniqueName } from '../support/env'
import { signInViaApi } from '../support/login'
import { openSettingsPage, seedOrgEmployee } from '../support/organization'

/** Minimal 1×1 PNG (valid image/png). */
const TINY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5+BAQAH+AHIiOSnAAAAAARnCUIBAAA=',
    'base64',
)

async function openRequisites(page: import('@playwright/test').Page) {
    await openSettingsPage(page, '/settings', 'Реквизиты')
}

async function enterRequisitesEdit(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Редактировать' }).click()
    await expect(page.getByPlaceholder('Название организации')).toBeVisible()
}

test('#9: admin opens requisites and sees org card', async ({ page, api }) => {
    const org = await api.getOrganizationRequisites()
    await openRequisites(page)
    await expect(page.getByText('Название организации', { exact: true })).toBeVisible()
    if (org.name) {
        await expect(page.getByText(String(org.name))).toBeVisible()
    }
    await expect(page.getByRole('button', { name: 'Редактировать' })).toBeVisible()
})

test('#10: edit requisites — change name/inn, save, reload shows data', async ({ page, api }) => {
    const original = await api.getOrganizationRequisites()
    const newName = uniqueName('org-name')
    const newInn = `${Date.now()}`.slice(-10)

    try {
        await openRequisites(page)
        await enterRequisitesEdit(page)
        await page.getByPlaceholder('Название организации').fill(newName)
        await page.getByPlaceholder('ИНН').fill(newInn)
        await page.getByRole('button', { name: 'Сохранить' }).click()
        await expect(page.getByRole('button', { name: 'Редактировать' })).toBeVisible({
            timeout: 15_000,
        })

        await page.reload()
        await expect(page.getByRole('heading', { name: 'Реквизиты', level: 2 })).toBeVisible({
            timeout: 30_000,
        })
        await expect(page.getByText(newName)).toBeVisible()
        await expect(page.getByText(newInn)).toBeVisible()
    } finally {
        await api.updateOrganizationRequisites({
            name: (original.name as string) ?? '',
            inn: (original.inn as string) ?? '',
        })
    }
})

test.describe('employee session', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('#11: employee sees read-only requisites', async ({ page, api }) => {
        const emp = await seedOrgEmployee(api, 'org-emp')
        await signInViaApi(page, emp.email, emp.password)
        await openRequisites(page)

        await expect(
            page.getByText('Для изменения настроек организации обратитесь к администратору.'),
        ).toBeVisible()
        await expect(page.getByRole('button', { name: 'Редактировать' })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Сохранить' })).toHaveCount(0)
    })
})

test('#12: load error — requisites GET 500 shows error message', async ({ page }) => {
    await page.route('**/v1/system/requisites', (route) =>
        route.fulfill({ status: 500, body: '{"error":"fail"}' }),
    )
    await openRequisites(page)
    await expect(page.getByText(/Не удалось загрузить/)).toBeVisible()
})

test('#13: save error — PATCH 500 shows saveError text', async ({ page }) => {
    await openRequisites(page)
    await enterRequisitesEdit(page)
    await page.getByPlaceholder('Название организации').fill(uniqueName('org-save-err'))

    await page.route('**/v1/system/requisites', (route) => {
        if (route.request().method() === 'PATCH') {
            return route.fulfill({ status: 500, body: '{"error":"fail"}' })
        }
        return route.continue()
    })

    await page.getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByText('Не удалось сохранить изменения. Попробуйте позже.')).toBeVisible()
})

test('#14: logo upload — valid PNG shows success toast or logo image', async ({ page }) => {
    await openRequisites(page)
    await enterRequisitesEdit(page)

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
        name: 'logo.png',
        mimeType: 'image/png',
        buffer: TINY_PNG,
    })

    await expect(
        page.getByText('Логотип обновлён').or(page.locator('img[alt="Логотип"]')),
    ).toBeVisible({ timeout: 30_000 })
})

test('#15: invalid MIME — text file renamed as PNG shows format toast', async ({ page }) => {
    await openRequisites(page)
    await enterRequisitesEdit(page)

    await page.locator('input[type="file"]').setInputFiles({
        name: 'logo.png',
        mimeType: 'text/plain',
        buffer: Buffer.from('not an image'),
    })

    await expect(page.getByText(/Недопустимый формат/)).toBeVisible()
})

test('#16: file >5MB — shows size toast', async ({ page }) => {
    await openRequisites(page)
    await enterRequisitesEdit(page)

    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0)
    await page.locator('input[type="file"]').setInputFiles({
        name: 'huge.png',
        mimeType: 'image/png',
        buffer: oversized,
    })

    await expect(page.getByText(/слишком большой/i)).toBeVisible()
})

test('#17: cancel edit without save — field reverts to original value', async ({ page, api }) => {
    const org = await api.getOrganizationRequisites()
    const originalName = String(org.name ?? '')

    await openRequisites(page)
    await enterRequisitesEdit(page)
    await page.getByPlaceholder('Название организации').fill(uniqueName('org-cancel'))
    await page.getByRole('button', { name: 'Отмена' }).click()

    await expect(page.getByRole('button', { name: 'Редактировать' })).toBeVisible()
    await expect(page.getByText(originalName)).toBeVisible()
})
