import { type Page } from '@playwright/test'
import { test, expect } from '../fixtures/test'
import type { ApiClient } from '../fixtures/api'
import { ApiClient as ApiClientClass } from '../fixtures/api'
import { API_BASE_URL, uniqueName } from '../support/env'
import { parseInviteToken } from '../support/organization'
import { byQa } from '../support/qa'
import { pickSelectOption } from '../support/ui'

/**
 * Organization — employee offboard wizard (SCR-MORG-EMPLOYEE-OFFBOARD).
 */

async function seedInvitedEmployee(
    api: ApiClient,
    label: string,
): Promise<{ email: string; password: string; userId: string; name: string }> {
    const name = `E2E ${label}`
    const email = `${uniqueName(label)}@fairflow.local`
    const password = 'OffboardEmp123!'
    const inv = await api.createInvitation({ email, role: 'employee' })
    if (!inv.inviteUrl) throw new Error('Invitation did not return inviteUrl')
    const token = parseInviteToken(inv.inviteUrl)
    await ApiClientClass.acceptInvitationPublic(token, { name, password })
    const employees = await api.listEmployees()
    const row = employees.find((e) => String(e.email ?? '') === email)
    const userId = String(row?.userId ?? row?.id ?? '')
    if (!userId) throw new Error(`Could not resolve userId for invited employee ${email}`)
    return { email, password, userId, name }
}

async function addProjectMember(
    page: Page,
    api: ApiClient,
    projectId: string,
    userId: string,
): Promise<void> {
    const res = await page.request.post(`${API_BASE_URL}/v1/projects/${projectId}/members`, {
        headers: {
            Authorization: `Bearer ${api.token}`,
            'Content-Type': 'application/json',
            'X-Project-Id': projectId,
        },
        data: { userId, role: 'member' },
    })
    expect(res.ok(), `addProjectMember failed: ${res.status()} ${await res.text()}`).toBeTruthy()
}

async function openOffboardDrawerForEmployee(page: Page, employeeName: string): Promise<void> {
    await page.goto('/settings/employees')
    await expect(page.getByRole('heading', { name: 'Сотрудники', level: 2 })).toBeVisible({
        timeout: 30_000,
    })
    const row = page.locator('div.flex.items-center').filter({ hasText: employeeName }).first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    await row.getByTitle('Уволить (мастер)').click()
    await expect(page.getByText(/Увольнение:/)).toBeVisible({ timeout: 15_000 })
}

test('#52: offboard flow: open drawer, confirm, result message (need non-owner employee)', async ({
    page,
    api,
}) => {
    const employee = await seedInvitedEmployee(api, 'offboard-basic')
    try {
        await openOffboardDrawerForEmployee(page, employee.name)
        await expect(page.getByRole('button', { name: 'Уволить' })).toBeVisible({ timeout: 30_000 })
        await page.getByRole('button', { name: 'Уволить' }).click()
        await expect(page.getByText('Сотрудник уволен')).toBeVisible({ timeout: 30_000 })
    } finally {
        /* employee already offboarded in UI */
    }
})

test('#53: offboard with reassignToUserId select', async ({ page, api }) => {
    const target = await seedInvitedEmployee(api, 'offboard-target')
    const employee = await seedInvitedEmployee(api, 'offboard-reassign')
    try {
        await openOffboardDrawerForEmployee(page, employee.name)
        await pickSelectOption(page.locator('.select-control').first(), target.name)
        await page.getByRole('button', { name: 'Уволить' }).click()
        await expect(page.getByText('Сотрудник уволен')).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText(new RegExp(target.name))).toBeVisible()
    } finally {
        try {
            await api.offboardEmployee(target.userId)
        } catch {
            /* already offboarded */
        }
    }
})

test('#54: preview load error + «Повторить»', async ({ page, api }) => {
    const employee = await seedInvitedEmployee(api, 'offboard-preview-err')
    await page.route('**/v1/system/employees/*/offboard/preview**', (route) =>
        route.fulfill({ status: 500, body: '{}' }),
    )
    try {
        await openOffboardDrawerForEmployee(page, employee.name)
        await expect(page.getByText('Не удалось рассчитать последствия увольнения.')).toBeVisible({
            timeout: 30_000,
        })
        await page.unroute('**/v1/system/employees/*/offboard/preview**')
        await page.getByRole('button', { name: 'Повторить' }).click()
        await expect(page.getByRole('button', { name: 'Уволить' })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        try {
            await api.offboardEmployee(employee.userId)
        } catch {
            /* ignore */
        }
    }
})

test('#68: preview project list', async ({ page, api }) => {
    const pid = await api.createProject(uniqueName('offboard-proj'), ['deals', 'contacts'])
    const employee = await seedInvitedEmployee(api, 'offboard-proj-member')
    try {
        await addProjectMember(page, api, pid, employee.userId)
        await openOffboardDrawerForEmployee(page, employee.name)
        await expect(page.getByText(/Теряется доступ к проектам \(1\)/)).toBeVisible({
            timeout: 30_000,
        })
        await page.getByRole('button', { name: 'Отмена' }).click()
    } finally {
        await api.archiveProject(pid)
        try {
            await api.offboardEmployee(employee.userId)
        } catch {
            /* ignore */
        }
    }
})

test('#69: partial preview warning', async ({ page, api }) => {
    const employee = await seedInvitedEmployee(api, 'offboard-partial')
    try {
        await openOffboardDrawerForEmployee(page, employee.name)
        await expect(
            page.getByText(/Точное число записей на переназначение заранее не рассчитывается/),
        ).toBeVisible({ timeout: 30_000 })
        await page.getByRole('button', { name: 'Отмена' }).click()
    } finally {
        try {
            await api.offboardEmployee(employee.userId)
        } catch {
            /* ignore */
        }
    }
})

test.fixme('#70: result reassigned/unassigned counters — test.fixme if backend doesn\'t return', async () => {
    // Backend may answer processing=true without synchronous reassigned/unassigned counts.
})

test.describe('offboarded login blocked', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('#71: offboarded cannot login — offboard via api, try login', async ({ page, api }) => {
        const employee = await seedInvitedEmployee(api, 'offboard-login')
        await api.offboardEmployee(employee.userId)

        await page.goto('/auth/signin')
        await expect(byQa(page, 'host.login.email')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'host.login.email').fill(employee.email)
        await byQa(page, 'host.login.password').fill(employee.password)
        await byQa(page, 'host.login.submit').click()
        await expect(byQa(page, 'host.login.error')).toBeVisible({ timeout: 15_000 })
        await expect(page).toHaveURL(/\/auth\/signin/)
    })
})
