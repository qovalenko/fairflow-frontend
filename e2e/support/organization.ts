import { expect, type Page } from '@playwright/test'
import { ApiClient } from '../fixtures/api'
import { uniqueName, DATA_PREFIX } from './env'
import { pickSelectOption } from './ui'

const DEFAULT_EMPLOYEE_PASSWORD = 'E2eOrgPass1!'

/** Navigate to a system settings screen and wait for the page heading. */
export async function openSettingsPage(
    page: Page,
    path: string,
    heading: string | RegExp,
    headingLevel?: 1 | 2 | 3 | 4 | 5 | 6,
): Promise<void> {
    await page.goto(path)
    const headingLocator = headingLevel
        ? page.getByRole('heading', { name: heading, level: headingLevel })
        : page.getByRole('heading', { name: heading })
    await expect(headingLocator).toBeVisible({
        timeout: 30_000,
    })
}

/** Click a sidebar settings nav item by visible label. */
export async function clickSettingsNav(page: Page, label: string): Promise<void> {
    await page.getByRole('link', { name: label }).click()
}

/** Pick a react-select option inside a labeled field (org screens have no qa-ids). */
export async function pickLabeledSelect(page: Page, label: string, optionLabel: string): Promise<void> {
    const field = page.locator('label').filter({ hasText: label }).first().locator('..')
    const control = field.locator('.select-control').first()
    await pickSelectOption(control, optionLabel)
}

/** Confirm native browser dialog (department delete, access-unit archive). */
export async function acceptNativeConfirm(page: Page): Promise<void> {
    page.once('dialog', (dialog) => dialog.accept())
}

/** Extract invite token from `/auth/invite/:token` URL returned by the API. */
export function parseInviteToken(inviteUrl: string): string {
    const match = inviteUrl.match(/\/auth\/invite\/([^/?#]+)/)
    if (!match?.[1]) {
        throw new Error(`Cannot parse invite token from URL: ${inviteUrl}`)
    }
    return decodeURIComponent(match[1])
}

/**
 * Return credentials for an existing active org employee (no invite accept).
 * Use for read-only / permission specs when accept API is flaky on the stand.
 */
export async function reuseOrgEmployee(
    api: ApiClient,
    role = 'employee',
    password = DEFAULT_EMPLOYEE_PASSWORD,
): Promise<{ email: string; password: string; name: string; userId: string }> {
    const employees = await api.listEmployees()
    const row = employees.find(
        (e) =>
            String(e.role ?? '') === role &&
            e.isActive !== false &&
            String(e.role) !== 'platform_owner' &&
            e.userId,
    )
    if (!row?.userId) {
        throw new Error(`No reusable ${role} employee on stand`)
    }
    return {
        email: String(row.email ?? `${role}@e2e.local`),
        password,
        name: String(row.name ?? row.email ?? role),
        userId: String(row.userId),
    }
}

/**
 * Seed a fresh org employee via invite accept.
 * On accept API failure, falls back to an existing employee if present.
 */
export async function seedOrgEmployee(
    api: ApiClient,
    label = 'org-emp',
    role = 'employee',
    password = DEFAULT_EMPLOYEE_PASSWORD,
): Promise<{ email: string; password: string; name: string; userId: string }> {
    const employees = await api.listEmployees()
    const displayName = uniqueName(label)
    const email = `${displayName}@e2e.local`
    const invite = await api.createInvitation({ email, role })
    if (!invite.inviteUrl) throw new Error('createInvitation returned no inviteUrl')
    const token = parseInviteToken(invite.inviteUrl)

    try {
        await ApiClient.acceptInvitationPublic(token, { name: displayName, password })
    } catch {
        const fallback =
            employees.find(
                (e) =>
                    e.role === 'employee' &&
                    e.userId &&
                    String(e.email ?? '').includes(DATA_PREFIX),
            ) ?? employees.find((e) => e.role === 'employee' && e.userId)
        if (!fallback?.userId) {
            throw new Error(`acceptInvitation failed and no fallback employee for ${email}`)
        }
        return {
            email: String(fallback.email ?? email),
            password,
            name: String(fallback.name ?? displayName),
            userId: String(fallback.userId),
        }
    }

    const refreshed = await api.listEmployees()
    const row = refreshed.find((e) => String(e.email ?? '').toLowerCase() === email.toLowerCase())
    if (!row?.userId) throw new Error(`Employee ${email} not found after accept`)
    return {
        email,
        password,
        name: displayName,
        userId: String(row.userId),
    }
}

/** Card row for an access-unit in the teams editor tree. */
export function accessUnitCard(page: Page, unitName: string) {
    return page.locator('div.rounded-lg').filter({ hasText: unitName }).first()
}
function membersCompositionDrawer(page: Page) {
    return page.locator('div').filter({ has: page.getByRole('heading', { name: /^Состав:/ }) })
}

/** Pick member type in access-unit composition drawer (user vs nested group). */
export async function pickMembersDrawerMemberType(
    page: Page,
    typeLabel: 'Пользователь' | 'Вложенная группа (композиция)',
): Promise<void> {
    await expect(page.getByRole('heading', { name: /^Состав:/ })).toBeVisible()
    const control = membersCompositionDrawer(page).locator('.select-control').first()
    await pickSelectOption(control, typeLabel)
}

export async function pickMembersDrawerSelect(
    page: Page,
    optionLabel: string,
    selectIndex = 1,
): Promise<void> {
    await expect(page.getByRole('heading', { name: /^Состав:/ })).toBeVisible()
    const control = membersCompositionDrawer(page).locator('.select-control').nth(selectIndex)
    await pickSelectOption(control, optionLabel)
}

export type MockInvitationDetails = {
    organizationId?: string
    organizationName: string
    email: string
    role?: string
    status?: string
    expired?: boolean
    userExists?: boolean
}

/** Mock public invitation lookup for /auth/invite/:token specs (boundary mock). */
export async function mockInvitationLookup(
    page: Page,
    token: string,
    details: MockInvitationDetails | null,
    statusIfNull = 404,
): Promise<void> {
    const pattern = `**/v1/invitations/${encodeURIComponent(token)}`
    await page.route(pattern, (route) => {
        if (route.request().method() !== 'GET') return route.continue()
        if (!details) {
            return route.fulfill({
                status: statusIfNull,
                contentType: 'application/json',
                body: '{}',
            })
        }
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                organizationId: details.organizationId ?? 'org-mock',
                organizationName: details.organizationName,
                email: details.email,
                role: details.role ?? 'employee',
                status: details.status ?? 'pending',
                expired: details.expired ?? false,
                userExists: details.userExists ?? false,
            }),
        })
    })
}

/** Mock POST /v1/invitations/accept for invite-accept error/success paths. */
export async function mockInvitationAccept(
    page: Page,
    status: number,
    body: Record<string, unknown> = {},
): Promise<void> {
    await page.route('**/v1/invitations/accept', (route) => {
        if (route.request().method() !== 'POST') return route.continue()
        return route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(body),
        })
    })
}

/** Open project settings tab in account layout. */
export async function openProjectSettingsTab(
    page: Page,
    projectId: string,
    tab: 'access' | 'unassigned' | 'modules',
): Promise<void> {
    await page.goto(`/account/projects/${projectId}/settings?tab=${tab}`)
    await expect(page).toHaveURL(new RegExp(`tab=${tab}`), { timeout: 30_000 })
}
