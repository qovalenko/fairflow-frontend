import { test, expect } from '../fixtures/test'
import { mockBootstrapPost, mockPublicConfig } from '../support/shell'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products', '/api/bootstrap'] })

test.describe('Shell P1 auth & bootstrap (automatable yes)', () => {
    test.describe.configure({ mode: 'serial' })
    test.use({ storageState: { cookies: [], origins: [] } })

    test('#16: bootstrap — невалидный ИНН → inline ST-7', async ({ page }) => {
        await mockPublicConfig(page, { needsBootstrap: true })
        await page.goto('/bootstrap')
        await expect(page.getByPlaceholder('Название организации')).toBeVisible({
            timeout: 30_000,
        })
        await page.getByPlaceholder('ИНН организации (необязательно)').fill('12345')
        await page.getByPlaceholder('Название организации').fill('E2E Org')
        await page.getByRole('button', { name: 'Создать администратора' }).click()
        await expect(page.getByText('ИНН — 10 цифр (юрлицо) или 12 (ИП)')).toBeVisible()
    })

    test('#17: bootstrap — пароли не совпадают → inline ST-7', async ({ page }) => {
        await mockPublicConfig(page, { needsBootstrap: true })
        await page.goto('/bootstrap')
        await page.getByPlaceholder('Пароль — не короче 8 символов').fill('Password123!')
        await page.getByPlaceholder('Повторите пароль').fill('Different123!')
        await page.getByRole('button', { name: 'Создать администратора' }).click()
        await expect(page.getByText('Пароли не совпадают')).toBeVisible()
    })

    test('#18: bootstrap 409 ALREADY_INITIALIZED → /auth/signin', async ({ page }) => {
        await mockPublicConfig(page, { needsBootstrap: true })
        await mockBootstrapPost(page, {
            status: 409,
            body: { code: 'ALREADY_INITIALIZED', message: 'Already initialized' },
        })
        await page.goto('/bootstrap')
        await page.getByPlaceholder('Название организации').fill('E2E Org')
        await page.getByPlaceholder('Иванов Иван').fill('E2E Admin')
        await page.getByPlaceholder('admin@example.com').fill('bootstrap-e2e@fairflow.local')
        await page.getByPlaceholder('Пароль — не короче 8 символов').fill('Password123!')
        await page.getByPlaceholder('Повторите пароль').fill('Password123!')
        await page.getByRole('button', { name: 'Создать администратора' }).click()
        await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 20_000 })
    })

    test('#19: bootstrap 403 BOOTSTRAP_DISABLED → сообщение об ошибке', async ({ page }) => {
        await mockPublicConfig(page, { needsBootstrap: true })
        await mockBootstrapPost(page, {
            status: 403,
            body: { code: 'BOOTSTRAP_DISABLED', message: 'Disabled' },
        })
        await page.goto('/bootstrap')
        await page.getByPlaceholder('Название организации').fill('E2E Org')
        await page.getByPlaceholder('Иванов Иван').fill('E2E Admin')
        await page.getByPlaceholder('admin@example.com').fill('bootstrap-e2e@fairflow.local')
        await page.getByPlaceholder('Пароль — не короче 8 символов').fill('Password123!')
        await page.getByPlaceholder('Повторите пароль').fill('Password123!')
        await page.getByRole('button', { name: 'Создать администратора' }).click()
        await expect(page.getByText('Первичная настройка недоступна в этом окружении.')).toBeVisible(
            { timeout: 15_000 },
        )
    })

    test('#33: reset password — невалидный token → ST-9 сообщение', async ({ page }) => {
        await page.goto('/auth/reset-password/invalid-e2e-token')
        await page.getByPlaceholder('••••••••••••').fill('NewPassword123!')
        await page.getByPlaceholder('Подтвердите пароль').fill('NewPassword123!')
        await page.getByRole('button', { name: 'Сбросить пароль' }).click()
        await expect(page.getByText(/Не удалось сбросить пароль|устарела/i)).toBeVisible({
            timeout: 15_000,
        })
    })

    test('#34: reset password — пароли не совпадают → inline ST-7', async ({ page }) => {
        await page.goto('/auth/reset-password/any-token')
        await page.getByPlaceholder('••••••••••••').fill('NewPassword123!')
        await page.getByPlaceholder('Подтвердите пароль').fill('DifferentPassword123!')
        await expect(page.getByText('Пароли не совпадают')).toBeVisible()
    })

    test('#36: verify email — невалидный token → ST-9', async ({ page }) => {
        await page.goto('/auth/verify-email/invalid-e2e-token')
        await expect(page.getByRole('heading', { name: 'Ссылка недействительна' })).toBeVisible({
            timeout: 30_000,
        })
    })

    test('#38: invite — истёк/отозван → ST-9', async ({ page }) => {
        await page.goto('/auth/invite/invalid-e2e-token')
        await expect(page.getByRole('heading', { name: 'Приглашение не найдено' })).toBeVisible({
            timeout: 30_000,
        })
    })
})

test.fixme(
    '#20: BUG авторизованный пользователь остаётся на /bootstrap при needsBootstrap:true — PublicConfigGate не редиректит',
    async ({ page }) => {
        await mockPublicConfig(page, { needsBootstrap: true })
        await page.goto('/bootstrap')
        await expect(page).not.toHaveURL(/\/bootstrap$/, { timeout: 20_000 })
    },
)
