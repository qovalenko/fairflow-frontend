import { type Page } from '@playwright/test'
import { test, expect } from '../fixtures/test'
import { ApiClient } from '../fixtures/api'
import { openSettingsPage, parseInviteToken } from '../support/organization'
import { uniqueName, DATA_PREFIX } from '../support/env'
import { signInViaApi } from '../support/login'
import { pickSelectOption } from '../support/ui'

/**
 * Organization — SCR-MORG-EMPLOYEES (catalog organization.md).
 * Org screens have no qa-ids — role/text/title/placeholder selectors only.
 */

const EMPLOYEES_PATH = '/settings/employees'
const TEST_PASSWORD = 'TestPass1!'

function uniqueInviteEmail(label: string): string {
    return `${DATA_PREFIX}${label}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@fairflow.local`.toLowerCase()
}

async function openEmployees(page: Page): Promise<void> {
    await openSettingsPage(page, EMPLOYEES_PATH, 'Сотрудники')
}

async function expectToastTitle(page: Page, title: string): Promise<void> {
    await expect(page.locator('.notification').filter({ hasText: title }).first()).toBeVisible({
        timeout: 15_000,
    })
}

function listRow(page: Page, text: string) {
    return page.locator('.rounded-lg.border').filter({ hasText: text }).first()
}

async function ownerEmployeeRow(page: Page, api: ApiClient) {
    const employees = await api.listEmployees()
    const owner = employees.find((e) => String(e.role ?? '') === 'platform_owner')
    if (!owner) throw new Error('platform_owner not found in organization employees list')
    const label = String(owner.name ?? owner.email ?? owner.userId ?? '')
    if (!label) throw new Error('platform_owner row has no display label')
    return listRow(page, label)
}

async function createAcceptedUser(
    api: ApiClient,
    role = 'employee',
): Promise<{ email: string; password: string; name: string; userId: string }> {
    const employees = await api.listEmployees()
    const existing = employees.find(
        (e) =>
            String(e.role ?? '') === role &&
            e.isActive !== false &&
            String(e.role) !== 'platform_owner' &&
            e.userId,
    )
    if (existing?.userId && existing.email) {
        return {
            email: String(existing.email),
            password: TEST_PASSWORD,
            name: String(existing.name ?? existing.email),
            userId: String(existing.userId),
        }
    }

    const email = uniqueInviteEmail('emp')
    const name = uniqueName('user')
    const inv = await api.createInvitation({ email, role })
    if (!inv.inviteUrl) throw new Error('createInvitation missing inviteUrl')
    const token = parseInviteToken(inv.inviteUrl)
    try {
        await ApiClient.acceptInvitationPublic(token, { name, password: TEST_PASSWORD })
    } catch {
        const fallback = employees.find((e) => e.role === 'employee' && e.userId)
        if (!fallback?.userId) throw new Error(`acceptInvitation failed and no fallback employee for ${email}`)
        return {
            email: String(fallback.email ?? email),
            password: TEST_PASSWORD,
            name: String(fallback.name ?? name),
            userId: String(fallback.userId),
        }
    }
    const refreshed = await api.listEmployees()
    const row = refreshed.find((e) => String(e.email ?? '').toLowerCase() === email)
    const userId = row?.userId as string | undefined
    if (!userId) throw new Error(`userId not found for ${email}`)
    return { email, password: TEST_PASSWORD, name, userId }
}

async function createPendingInvite(
    api: ApiClient,
    email?: string,
): Promise<{ id: string; email: string; inviteUrl?: string }> {
    const target = email ?? uniqueInviteEmail('pending')
    return api.createInvitation({ email: target })
}

test('#37: unified list shows employees and pending invitations with «Приглашён» tag', async ({
    page,
    api,
}) => {
    const email = uniqueInviteEmail('unified')
    let inviteId: string | undefined
    try {
        const inv = await createPendingInvite(api, email)
        inviteId = inv.id
        await openEmployees(page)
        await expect(listRow(page, email)).toBeVisible({ timeout: 30_000 })
        await expect(listRow(page, email).getByText('Приглашён')).toBeVisible()
    } finally {
        if (inviteId) {
            try {
                await api.revokeInvitation(inviteId)
            } catch {
                /* best-effort */
            }
        }
    }
})

test('#38: empty list shows «Сотрудников и приглашений пока нет.» when API returns no rows', async ({
    page,
}) => {
    await page.route('**/v1/system/employees**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )
    await page.route('**/v1/system/invitations**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )
    await page.route('**/v1/system/departments**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )
    await openEmployees(page)
    await expect(page.getByText('Сотрудников и приглашений пока нет.')).toBeVisible({
        timeout: 30_000,
    })
})

test('#39: add existing platform user by userId via drawer', async ({ page, api }) => {
    const user = await createAcceptedUser(api)
    try {
        await api.offboardEmployee(user.userId)
        await openEmployees(page)
        await page.getByRole('button', { name: 'Добавить' }).click()
        await expect(page.getByRole('heading', { name: 'Добавить сотрудника' })).toBeVisible()
        await page.getByPlaceholder('ID пользователя').fill(user.userId)
        await page.getByRole('button', { name: 'Добавить', exact: true }).click()
        await expect(listRow(page, user.email)).toBeVisible({ timeout: 30_000 })
        await expect(listRow(page, user.email).getByText('Активен')).toBeVisible()
    } finally {
        try {
            await api.offboardEmployee(user.userId)
        } catch {
            /* best-effort */
        }
    }
})

test('#40: invite by email creates pending row and success toast', async ({ page, api }) => {
    const email = uniqueInviteEmail('invite')
    let inviteId: string | undefined
    try {
        await openEmployees(page)
        await page.getByRole('button', { name: 'Пригласить' }).click()
        await expect(page.getByRole('heading', { name: 'Пригласить сотрудника' })).toBeVisible()
        await page.getByPlaceholder('name@company.ru').fill(email)
        await page.getByRole('button', { name: 'Отправить приглашение' }).click()
        await expectToastTitle(page, 'Приглашение создано')
        await expect(listRow(page, email)).toBeVisible({ timeout: 30_000 })
        await expect(listRow(page, email).getByText('Приглашён')).toBeVisible()
        const invites = await api.listInvitations()
        inviteId = invites.find((i) => i.email === email)?.id
    } finally {
        if (inviteId) {
            try {
                await api.revokeInvitation(inviteId)
            } catch {
                /* best-effort */
            }
        }
    }
})

test('#41: inline department change updates employee row', async ({ page, api }) => {
    const deptA = await api.createDepartment({ name: uniqueName('dept-a') })
    const deptB = await api.createDepartment({ name: uniqueName('dept-b') })
    const user = await createAcceptedUser(api)
    try {
        await openEmployees(page)
        const row = listRow(page, user.email)
        await expect(row).toBeVisible({ timeout: 30_000 })
        const deptSelect = row.locator('.select-control').first()
        await pickSelectOption(deptSelect, deptA.name)
        await expect(row).toContainText(deptA.name, { timeout: 15_000 })
        await pickSelectOption(deptSelect, deptB.name)
        await expect(row).toContainText(deptB.name, { timeout: 15_000 })
    } finally {
        try {
            await api.offboardEmployee(user.userId)
        } catch {
            /* best-effort */
        }
        for (const id of [deptA.id, deptB.id]) {
            try {
                await api.deleteDepartment(id)
            } catch {
                /* best-effort */
            }
        }
    }
})

test('#42: inline role change toggles employee ↔ platform_admin', async ({ page, api }) => {
    const user = await createAcceptedUser(api)
    try {
        await openEmployees(page)
        const row = listRow(page, user.email)
        await expect(row).toBeVisible({ timeout: 30_000 })
        const roleSelect = row.locator('.select-control').nth(1)
        await pickSelectOption(roleSelect, 'Администратор')
        await expect(row.getByText('Администратор')).toBeVisible({ timeout: 15_000 })
        await pickSelectOption(roleSelect, 'Сотрудник')
        await expect(row.getByText('Сотрудник')).toBeVisible({ timeout: 15_000 })
    } finally {
        try {
            await api.offboardEmployee(user.userId)
        } catch {
            /* best-effort */
        }
    }
})

test('#43: revoke pending invite via «Отозвать» control', async ({ page, api }) => {
    const email = uniqueInviteEmail('revoke')
    let inviteId: string | undefined
    try {
        const inv = await createPendingInvite(api, email)
        inviteId = inv.id
        await openEmployees(page)
        const row = listRow(page, email)
        await expect(row).toBeVisible({ timeout: 30_000 })
        await row.getByTitle('Отозвать приглашение').click()
        await expectToastTitle(page, 'Приглашение отозвано')
        await expect(row.getByText('Отозвано')).toBeVisible({ timeout: 15_000 })
    } finally {
        if (inviteId) {
            try {
                await api.revokeInvitation(inviteId)
            } catch {
                /* best-effort */
            }
        }
    }
})

test('#44: resend revoked invitation via resend icon', async ({ page, api }) => {
    const email = uniqueInviteEmail('resend')
    let inviteId: string | undefined
    try {
        const inv = await createPendingInvite(api, email)
        inviteId = inv.id
        await api.revokeInvitation(inviteId)
        await openEmployees(page)
        const row = listRow(page, email)
        await expect(row).toBeVisible({ timeout: 30_000 })
        await expect(row.getByText('Отозвано')).toBeVisible()
        await row.getByTitle('Отправить повторно').click()
        await expectToastTitle(page, 'Приглашение отправлено')
        await expect(row.getByText('Приглашён')).toBeVisible({ timeout: 15_000 })
    } finally {
        if (inviteId) {
            try {
                await api.revokeInvitation(inviteId)
            } catch {
                /* best-effort */
            }
        }
    }
})

test('#45: search filters rows by name or email', async ({ page, api }) => {
    const user = await createAcceptedUser(api)
    try {
        await openEmployees(page)
        await expect(listRow(page, user.email)).toBeVisible({ timeout: 30_000 })
        await page.getByPlaceholder('Поиск по имени или email...').fill(user.email)
        await expect(listRow(page, user.email)).toBeVisible()
        await page.getByPlaceholder('Поиск по имени или email...').fill(uniqueName('no-such-user'))
        await expect(page.getByText(/По запросу «.+» ничего не найдено\./)).toBeVisible()
    } finally {
        try {
            await api.offboardEmployee(user.userId)
        } catch {
            /* best-effort */
        }
    }
})

test('#46: empty search shows reset control «Сбросить поиск»', async ({ page, api }) => {
    const user = await createAcceptedUser(api)
    try {
        await openEmployees(page)
        await expect(listRow(page, user.email)).toBeVisible({ timeout: 30_000 })
        const needle = uniqueName('missing-query')
        await page.getByPlaceholder('Поиск по имени или email...').fill(needle)
        await expect(page.getByText(`По запросу «${needle}» ничего не найдено.`)).toBeVisible()
        await page.getByRole('button', { name: 'Сбросить поиск' }).click()
        await expect(listRow(page, user.email)).toBeVisible({ timeout: 15_000 })
    } finally {
        try {
            await api.offboardEmployee(user.userId)
        } catch {
            /* best-effort */
        }
    }
})

test('#47: load error shows message when employees API returns 5xx', async ({ page }) => {
    await page.route('**/v1/system/employees**', (route) =>
        route.fulfill({ status: 500, body: 'internal error' }),
    )
    await page.route('**/v1/system/invitations**', (route) =>
        route.fulfill({ status: 500, body: 'internal error' }),
    )
    await page.route('**/v1/system/departments**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
    )
    await openEmployees(page)
    await expect(page.getByText('Не удалось загрузить сотрудников.')).toBeVisible({
        timeout: 30_000,
    })
})

test('#48: add duplicate userId surfaces already_member conflict feedback', async ({
    page,
    api,
}) => {
    const user = await createAcceptedUser(api)
    try {
        await openEmployees(page)
        await page.getByRole('button', { name: 'Добавить' }).click()
        await page.getByPlaceholder('ID пользователя').fill(user.userId)
        await page.getByRole('button', { name: 'Добавить', exact: true }).click()
        await expect(
            page
                .locator('.notification')
                .filter({ hasText: /Конфликт|уже состоит/i })
                .or(page.getByText(/Конфликт|уже состоит|Не удалось добавить/i)),
        ).toBeVisible({ timeout: 15_000 })
    } finally {
        try {
            await api.offboardEmployee(user.userId)
        } catch {
            /* best-effort */
        }
    }
})

test('#49: seat_limit 402 shows license limit toast on role change', async ({ page, api }) => {
    const user = await createAcceptedUser(api)
    try {
        await openEmployees(page)
        const row = listRow(page, user.email)
        await expect(row).toBeVisible({ timeout: 30_000 })

        await page.route(`**/v1/system/employees/${user.userId}**`, (route) => {
            if (route.request().method() !== 'PATCH') return route.continue()
            return route.fulfill({
                status: 402,
                contentType: 'application/json',
                body: '{"code":"seat_limit_reached"}',
            })
        })

        const roleSelect = row.locator('.select-control').nth(1)
        await pickSelectOption(roleSelect, 'Администратор')
        await expectToastTitle(page, 'Не удалось выполнить')
        await expect(
            page.getByText('Достигнут лимит лицензий (seats) — освободите место или докупите.'),
        ).toBeVisible({ timeout: 15_000 })
    } finally {
        try {
            await api.offboardEmployee(user.userId)
        } catch {
            /* best-effort */
        }
    }
})

test('#50: owner row hides inline role and department selects', async ({ page, api }) => {
    await openEmployees(page)
    const ownerRow = await ownerEmployeeRow(page, api)
    await expect(ownerRow).toBeVisible({ timeout: 30_000 })
    await expect(ownerRow.getByText('Владелец')).toBeVisible()
    await expect(ownerRow.locator('.select-control')).toHaveCount(0)
})

test('#51: owner row has no offboard button', async ({ page, api }) => {
    await openEmployees(page)
    const ownerRow = await ownerEmployeeRow(page, api)
    await expect(ownerRow).toBeVisible({ timeout: 30_000 })
    await expect(ownerRow.getByTitle('Уволить (мастер)')).toHaveCount(0)
})

test.fixme(
    '#55: transfer ownership succeeds with org-name confirmation and success toast',
    async () => {
        /* Mutating org owner is destructive on shared stand; needs disposable owner round-trip. */
    },
)

test('#56: transfer confirm stays disabled until organization name typed correctly', async ({
    page,
    api,
}) => {
    const user = await createAcceptedUser(api)
    const system = await api.getSystem()
    const orgName = String(system.name ?? '')
    try {
        await openEmployees(page)
        const row = listRow(page, user.email)
        await expect(row).toBeVisible({ timeout: 30_000 })
        await row.getByTitle('Передать владельца').click()
        await expect(page.getByRole('heading', { name: 'Передать владельца?' })).toBeVisible()
        const confirm = page.getByRole('button', { name: 'Передать', exact: true })
        await expect(confirm).toBeDisabled()
        if (orgName) {
            await page.getByPlaceholder(orgName).fill(orgName)
            await expect(confirm).toBeEnabled()
        }
        await page.getByRole('button', { name: 'Отмена' }).click()
    } finally {
        try {
            await api.offboardEmployee(user.userId)
        } catch {
            /* best-effort */
        }
    }
})

test('#57: role change API error shows conflict toast', async ({ page, api }) => {
    const user = await createAcceptedUser(api)
    try {
        await openEmployees(page)
        const row = listRow(page, user.email)
        await expect(row).toBeVisible({ timeout: 30_000 })
        await page.route('**/v1/system/employees/**', (route) => {
            if (route.request().method() === 'PATCH') {
                return route.fulfill({ status: 409, body: '{"message":"conflict"}' })
            }
            return route.continue()
        })
        const roleSelect = row.locator('.select-control').nth(1)
        await pickSelectOption(roleSelect, 'Администратор')
        await expectToastTitle(page, 'Не удалось выполнить')
        await expect(page.getByText(/Конфликт/i)).toBeVisible()
    } finally {
        try {
            await api.offboardEmployee(user.userId)
        } catch {
            /* best-effort */
        }
    }
})

test('#58: revoke/resend API error shows danger toast', async ({ page, api }) => {
    const email = uniqueInviteEmail('err-revoke')
    let inviteId: string | undefined
    try {
        const inv = await createPendingInvite(api, email)
        inviteId = inv.id
        await openEmployees(page)
        const row = listRow(page, email)
        await expect(row).toBeVisible({ timeout: 30_000 })
        await page.route('**/v1/system/invitations/**', (route) => {
            if (route.request().method() === 'DELETE') {
                return route.fulfill({ status: 500, body: 'fail' })
            }
            return route.continue()
        })
        await row.getByTitle('Отозвать приглашение').click()
        await expectToastTitle(page, 'Не удалось отозвать')
    } finally {
        if (inviteId) {
            try {
                await api.revokeInvitation(inviteId)
            } catch {
                /* best-effort */
            }
        }
    }
})

test.describe('employee read-only employees page', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('#59: employee without mutation rights — no «Добавить» / «Пригласить» buttons', async ({
        page,
        api,
    }) => {
        const email = uniqueInviteEmail('readonly-emp')
        const name = uniqueName('readonly')
        const inv = await createPendingInvite(api, email)
        if (!inv.inviteUrl) throw new Error('createInvitation missing inviteUrl')
        const token = parseInviteToken(inv.inviteUrl)
        await ApiClient.acceptInvitationPublic(token, { name, password: TEST_PASSWORD })

        try {
            await signInViaApi(page, email, TEST_PASSWORD)
            await openEmployees(page)
            await expect(page.getByRole('heading', { name: 'Сотрудники', level: 2 })).toBeVisible({
                timeout: 30_000,
            })
            await expect(page.getByRole('button', { name: 'Добавить' })).toHaveCount(0)
            await expect(page.getByRole('button', { name: 'Пригласить' })).toHaveCount(0)
        } finally {
            const employees = await api.listEmployees()
            const row = employees.find((e) => String(e.email ?? '').toLowerCase() === email)
            if (row?.userId) {
                try {
                    await api.offboardEmployee(String(row.userId))
                } catch {
                    /* best-effort */
                }
            }
            try {
                await api.revokeInvitation(inv.id)
            } catch {
                /* best-effort */
            }
        }
    })
})

test('#60: header shows pending invitations counter «приглашённых»', async ({ page, api }) => {
    const email = uniqueInviteEmail('counter')
    let inviteId: string | undefined
    try {
        const inv = await createPendingInvite(api, email)
        inviteId = inv.id
        await openEmployees(page)
        await expect(page.getByText(/\d+ приглашённых/)).toBeVisible({ timeout: 30_000 })
    } finally {
        if (inviteId) {
            try {
                await api.revokeInvitation(inviteId)
            } catch {
                /* best-effort */
            }
        }
    }
})

test('#61: re-invite same email after revoke creates a new pending row', async ({ page, api }) => {
    const email = uniqueInviteEmail('reinvite')
    let firstId: string | undefined
    let secondId: string | undefined
    try {
        const first = await createPendingInvite(api, email)
        firstId = first.id
        await api.revokeInvitation(firstId)
        const second = await createPendingInvite(api, email)
        secondId = second.id
        await openEmployees(page)
        const row = listRow(page, email)
        await expect(row).toBeVisible({ timeout: 30_000 })
        await expect(row.getByText('Приглашён')).toBeVisible()
    } finally {
        for (const id of [firstId, secondId]) {
            if (id) {
                try {
                    await api.revokeInvitation(id)
                } catch {
                    /* best-effort */
                }
            }
        }
    }
})

test('#62: accept invitation — employee appears in list as active', async ({ page, api }) => {
    const email = uniqueInviteEmail('accept-list')
    const name = uniqueName('accepted')
    let userId: string | undefined
    try {
        const inv = await createPendingInvite(api, email)
        if (!inv.inviteUrl) throw new Error('createInvitation missing inviteUrl')
        const token = parseInviteToken(inv.inviteUrl)
        await ApiClient.acceptInvitationPublic(token, { name, password: TEST_PASSWORD })

        await openEmployees(page)
        const row = listRow(page, email)
        await expect(row).toBeVisible({ timeout: 30_000 })
        await expect(row.getByText('Активен')).toBeVisible()

        const employees = await api.listEmployees()
        userId = employees.find((e) => String(e.email ?? '').toLowerCase() === email)?.userId as
            | string
            | undefined
    } finally {
        if (userId) {
            try {
                await api.offboardEmployee(userId)
            } catch {
                /* best-effort */
            }
        }
    }
})