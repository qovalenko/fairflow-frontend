import { test, expect } from '../fixtures/test'
import { ADMIN_EMAIL } from '../support/env'
import { mockAuthMe, seedLocalSession } from '../support/login'

/**
 * Organization — bootstrap / org recovery gates (box single-tenant).
 */

test.use({ storageState: { cookies: [], origins: [] } })

test.fixme('#1: first bootstrap — test.fixme needs empty installation', async () => {
    // Requires a fresh box with no system record.
})

test('#2: repeat bootstrap — second submit → 409 ALREADY_INITIALIZED → redirect to signin', async ({
    page,
}) => {
    await page.goto('/bootstrap')
    await expect(page.getByRole('button', { name: 'Создать администратора' })).toBeVisible({
        timeout: 30_000,
    })

    await page.route('**/bootstrap', async (route) => {
        if (route.request().method() === 'POST') {
            await route.fulfill({
                status: 409,
                contentType: 'application/json',
                body: JSON.stringify({ code: 'ALREADY_INITIALIZED', message: 'Already initialized' }),
            })
            return
        }
        await route.continue()
    })

    const stamp = Date.now()
    await page.getByPlaceholder('Название организации').fill(`E2E Org ${stamp}`)
    await page.getByPlaceholder('Иванов Иван').fill('E2E Admin')
    await page.getByPlaceholder('admin@example.com').fill(`e2e-bootstrap-${stamp}@fairflow.local`)
    await page.getByPlaceholder('Пароль — не короче 8 символов').fill('TestPass1!')
    await page.getByPlaceholder('Повторите пароль').fill('TestPass1!')
    await page.getByRole('button', { name: 'Создать администратора' }).click()

    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 30_000 })
    await expect(page).not.toHaveURL(/\/bootstrap/)
})

test.fixme('#3: client validation — test.fixme empty install', async () => {
    // Requires empty installation bootstrap form.
})

test.fixme('#4: server bootstrap disabled — test.fixme', async () => {
    // Requires stand with bootstrap endpoint disabled.
})

test.fixme('#5: OrgSetupRecovery refresh — test.fixme needs JWT without system', async () => {
    // Requires authenticated session missing systemId in store.
})

test.fixme('#6: recovery uninitialized — test.fixme', async () => {
    // Requires uninitialized system recovery flow.
})

test.describe('logged-in admin org recovery', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('#7: recovery skip when system resolved — goto /onboarding/organization as logged-in admin, expect redirect away quickly', async ({
        page,
    }) => {
        await seedLocalSession(page, {
            email: ADMIN_EMAIL,
            userId: 'admin-mock',
            name: 'Admin',
            system: { id: 'system-mock', name: 'E2E System', role: 'platform_owner' },
        })
        await mockAuthMe(page, { email: ADMIN_EMAIL, userId: 'admin-mock', name: 'Admin' })

        await page.goto('/onboarding/organization')
        await expect(page).not.toHaveURL(/\/onboarding\/organization$/, { timeout: 30_000 })
        await expect(page).toHaveURL(
            /\/account\/projects\/new\?owner=|\/auth\/signin|\/dashboard|^\/$|\/contacts$/,
            { timeout: 30_000 },
        )
    })
})

test.fixme('#8: BootstrapSuccess welcome — test.fixme', async () => {
    // Requires completing first bootstrap on an empty installation.
})
