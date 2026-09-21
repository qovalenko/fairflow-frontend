import { type Page } from '@playwright/test'
import { test, expect } from '../fixtures/test'
import { ADMIN_EMAIL } from '../support/env'
import { seedLocalSession, mockAuthMe } from '../support/login'
import {
    mockInvitationAccept,
    mockInvitationLookup,
} from '../support/organization'

/**
 * Organization — invite acceptance screen (/auth/invite/:token).
 * Public lookup/accept are mocked at the HTTP boundary — stand GET often 500s;
 * UI contract is verified without depending on live invitation BFF.
 */

test.use({ storageState: { cookies: [], origins: [] } })

async function openInvitePage(page: Page, token: string): Promise<void> {
    await page.goto(`/auth/invite/${encodeURIComponent(token)}`)
}

test('#73: new user registers with name and password → success screen', async ({ page }) => {
    const token = `mock-new-${Date.now()}`
    const email = `invite-new-${Date.now()}@e2e.local`
    await mockInvitationLookup(page, token, {
        organizationName: 'Тестовая система',
        email,
        userExists: false,
    })
    await mockInvitationAccept(page, 200, {
        ok: true,
        organizationId: 'org-mock',
        created: true,
    })

    await openInvitePage(page, token)
    await expect(page.getByRole('heading', { name: /Вас пригласили/ })).toBeVisible({
        timeout: 30_000,
    })

    await page.getByPlaceholder('Введите ваше имя').fill('Новый сотрудник')
    await page.getByPlaceholder('Создайте пароль').fill('InvitePass1!')
    await page.getByRole('button', { name: 'Принять и зарегистрироваться' }).click()

    await expect(page.getByRole('heading', { name: 'Приглашение принято' })).toBeVisible({
        timeout: 15_000,
    })
    await expect(page.getByRole('button', { name: 'Перейти ко входу' })).toBeVisible()
})

test('#74: existing user logged in accepts invitation one-click', async ({ page }) => {
    const token = `mock-existing-auth-${Date.now()}`
    await seedLocalSession(page, { email: ADMIN_EMAIL, userId: 'admin-mock', name: 'Admin' })
    await mockAuthMe(page, { email: ADMIN_EMAIL, userId: 'admin-mock', name: 'Admin' })
    await mockInvitationLookup(page, token, {
        organizationName: 'Тестовая система',
        email: ADMIN_EMAIL,
        userExists: true,
    })
    await mockInvitationAccept(page, 200, {
        ok: true,
        organizationId: 'org-mock',
        created: false,
        projectGrants: [],
    })

    await openInvitePage(page, token)
    await expect(page.getByRole('button', { name: 'Принять приглашение' })).toBeVisible({
        timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Принять приглашение' }).click()

    await expect(page.getByRole('heading', { name: 'Приглашение принято' })).toBeVisible({
        timeout: 15_000,
    })
})

test('#75: existing user not logged in sees «Войти и принять» with signin redirect', async ({
    page,
}) => {
    const token = `mock-existing-logout-${Date.now()}`
    const email = `existing-${Date.now()}@e2e.local`
    await mockInvitationLookup(page, token, {
        organizationName: 'Тестовая система',
        email,
        userExists: true,
    })

    await openInvitePage(page, token)
    await expect(page.getByRole('button', { name: 'Войти и принять' })).toBeVisible({
        timeout: 30_000,
    })
    await page.getByRole('button', { name: 'Войти и принять' }).click()
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 15_000 })
    await expect(page.url()).toContain(
        encodeURIComponent(`/auth/invite/${token}`),
    )
})

test('#76: random token shows invitation not found', async ({ page }) => {
    const token = `invalid-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await page.route(`**/v1/invitations/${encodeURIComponent(token)}`, (route) =>
        route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
    )
    await openInvitePage(page, token)
    await expect(page.getByRole('heading', { name: 'Приглашение не найдено' })).toBeVisible({
        timeout: 30_000,
    })
})

test('#77: accepted invitation shows «Приглашение уже использовано»', async ({ page }) => {
    const token = `mock-accepted-${Date.now()}`
    await mockInvitationLookup(page, token, {
        organizationName: 'Тестовая система',
        email: `accepted-${Date.now()}@e2e.local`,
        status: 'accepted',
        userExists: false,
    })

    await openInvitePage(page, token)
    await expect(page.getByRole('heading', { name: 'Приглашение уже использовано' })).toBeVisible({
        timeout: 30_000,
    })
})

test('#78: expired/revoked invitation shows «Приглашение недействительно»', async ({ page }) => {
    const token = `mock-revoked-${Date.now()}`
    await mockInvitationLookup(page, token, {
        organizationName: 'Тестовая система',
        email: `revoked-${Date.now()}@e2e.local`,
        status: 'revoked',
        expired: true,
        userExists: false,
    })

    await openInvitePage(page, token)
    await expect(page.getByRole('heading', { name: 'Приглашение недействительно' })).toBeVisible({
        timeout: 30_000,
    })
})

test('#79: accept API 5xx shows inline error block', async ({ page }) => {
    const token = `mock-accept-5xx-${Date.now()}`
    const email = `accept-err-${Date.now()}@e2e.local`
    await mockInvitationLookup(page, token, {
        organizationName: 'Тестовая система',
        email,
        userExists: false,
    })
    await mockInvitationAccept(page, 500, { error: 'fail' })

    await openInvitePage(page, token)
    await page.getByPlaceholder('Введите ваше имя').fill('Ошибка accept')
    await page.getByPlaceholder('Создайте пароль').fill('InvitePass1!')
    await page.getByRole('button', { name: 'Принять и зарегистрироваться' }).click()

    await expect(
        page.getByText('Не удалось принять приглашение. Попробуйте ещё раз.'),
    ).toBeVisible({ timeout: 15_000 })
})

test('#80: accept under wrong session shows 401 guidance', async ({ page }) => {
    const token = `mock-wrong-session-${Date.now()}`
    const inviteEmail = `other-user-${Date.now()}@e2e.local`
    await seedLocalSession(page, {
        email: ADMIN_EMAIL,
        userId: 'admin-wrong-session',
        name: 'Admin',
    })
    await mockAuthMe(page, {
        email: ADMIN_EMAIL,
        userId: 'admin-wrong-session',
        name: 'Admin',
    })
    await mockInvitationLookup(page, token, {
        organizationName: 'Тестовая система',
        email: inviteEmail,
        userExists: true,
    })
    await mockInvitationAccept(page, 401, { code: 'UNAUTHENTICATED' })

    await openInvitePage(page, token)
    await page.getByRole('button', { name: 'Принять приглашение' }).click()
    await expect(
        page.getByText('Войдите как приглашённый пользователь, чтобы принять приглашение.'),
    ).toBeVisible({ timeout: 15_000 })
})

test('#81: landingProjectId reflected in post-accept sign-in redirect URL', async ({ page }) => {
    const token = `mock-landing-${Date.now()}`
    const landingProjectId = 'proj-landing-mock-123'
    const email = `landing-${Date.now()}@e2e.local`
    await mockInvitationLookup(page, token, {
        organizationName: 'Тестовая система',
        email,
        userExists: false,
    })
    await mockInvitationAccept(page, 200, {
        ok: true,
        organizationId: 'org-mock',
        created: true,
        landingProjectId,
    })

    await openInvitePage(page, token)
    await page.getByPlaceholder('Введите ваше имя').fill('Landing user')
    await page.getByPlaceholder('Создайте пароль').fill('InvitePass1!')
    await page.getByRole('button', { name: 'Принять и зарегистрироваться' }).click()

    await expect(page.getByRole('heading', { name: 'Приглашение принято' })).toBeVisible({
        timeout: 15_000,
    })
    await page.getByRole('button', { name: 'Перейти ко входу' }).click()
    await expect(page).toHaveURL(
        new RegExp(`/auth/signin.*redirectUrl=.*${landingProjectId}`),
        { timeout: 15_000 },
    )
})
