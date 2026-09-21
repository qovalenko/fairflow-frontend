import { test, expect } from '../fixtures/onboarding-test'
import { byQa } from '../support/qa'
import { uniqueName, STORAGE_KEYS } from '../support/env'
import { toggleSwitcher } from '../support/ui'
import {
    advanceWizardToStep,
    completeProjectWizard,
    expectEventuallyUrl,
    openCreateProjectWizard,
    resolveSystemId,
    sidebarNavItem,
} from '../support/onboarding'

/**
 * Onboarding — create-project wizard (catalog onboarding.md §SCR-ONB-WIZARD).
 */

test.fixme('#49: BUG POST /v1/projects 500 Internal error on the stand: full first project wizard lands in /p/:id', async ({ page, api }) => {
    const projectName = uniqueName('onb-full')
    let createdId: string | undefined
    try {
        await openCreateProjectWizard(page, api)
        await completeProjectWizard(page, projectName)
        await expectEventuallyUrl(page, /\/p\/[^/]+/)
        createdId = page.url().match(/\/p\/([^/?#]+)/)?.[1]
        expect(createdId).toBeTruthy()
        await expect(sidebarNavItem(page, 'portfolio.deals')).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (createdId) await api.archiveProject(createdId)
        else await api.cleanupProjects()
    }
})

test('#51: selected template preview shows pipeline stages on step 1', async ({ page, api }) => {
    await openCreateProjectWizard(page, api)
    const template = byQa(page, 'host.createProject.template').first()
    await expect(template).toBeVisible({ timeout: 30_000 })
    await template.click()
    await expect(page.getByText(/воронк|стади|этап/i).first()).toBeVisible()
})

test('#52: step 2 prefills project name from the chosen template on advance', async ({ page, api }) => {
    await openCreateProjectWizard(page, api)
    await advanceWizardToStep(page, 2)
    const nameInput = byQa(page, 'host.createProject.name')
    await expect(nameInput).toHaveValue(/.+/)
})

test('#53: step 3 modules are preset and deals module is locked', async ({ page, api }) => {
    await openCreateProjectWizard(page, api)
    await advanceWizardToStep(page, 3)
    const dealsRow = byQa(page, 'host.createProject.module', { module: 'deals' })
    await expect(dealsRow).toBeVisible()
    await expect(dealsRow.locator('input[type="checkbox"]')).toBeDisabled()
})

test.fixme('#55: BUG POST /v1/projects 500 Internal error on the stand: skip on invite step creates project without sending invites', async ({ page, api }) => {
    const projectName = uniqueName('onb-skip-inv')
    let createdId: string | undefined
    try {
        await openCreateProjectWizard(page, api)
        await completeProjectWizard(page, projectName, { skipInvites: true })
        await expectEventuallyUrl(page, /\/p\/[^/]+/)
        createdId = page.url().match(/\/p\/([^/]+)/)?.[1]
    } finally {
        if (createdId) await api.archiveProject(createdId)
    }
})

test('#59: deep-link /account/projects/new?owner= opens org wizard without owner picker', async ({
    page,
    api,
}) => {
    const systemId = await resolveSystemId(api)
    await openCreateProjectWizard(page, api, { ownerId: systemId })
    expect(new URL(page.url()).searchParams.get('owner')).toBe(systemId)
})

test('#61: step 1 without template shows validation on next', async ({ page, api }) => {
    await openCreateProjectWizard(page, api)
    await byQa(page, 'host.createProject.next').click()
    await expect(page.getByRole('paragraph').filter({ hasText: 'Выберите шаблон' })).toBeVisible()
})

test('#62: step 2 without name shows validation on next', async ({ page, api }) => {
    await openCreateProjectWizard(page, api)
    await advanceWizardToStep(page, 2)
    await byQa(page, 'host.createProject.name').fill('')
    await byQa(page, 'host.createProject.next').click()
    await expect(page.getByText('Введите название проекта')).toBeVisible()
})

test.fixme('#64: BUG POST /v1/projects 500 Internal error on the stand: POST /v1/projects 5xx shows submit error banner', async ({ page, api }) => {
    await page.route(/\/v1\/projects\/?(\?|$)/, async (route) => {
        if (route.request().method() === 'POST') {
            await route.fulfill({ status: 500, body: '{"message":"simulated"}' })
            return
        }
        await route.continue()
    })
    await openCreateProjectWizard(page, api)
    await completeProjectWizard(page, uniqueName('onb-fail'), { skipInvites: true })
    await expect(page.getByText(/не удалось|ошибк/i)).toBeVisible({ timeout: 15_000 })
})

test('#67: Enter on steps 1–3 does not submit the wizard early', async ({ page, api }) => {
    await openCreateProjectWizard(page, api)
    await advanceWizardToStep(page, 2)
    await byQa(page, 'host.createProject.name').press('Enter')
    await expect(byQa(page, 'host.createProject.submit')).toHaveCount(0)
})

test.fixme('#65: BUG POST /v1/projects 500 Internal error on the stand: permission denied on submit shows human-readable refusal', async ({ page, api }) => {
    await page.route(/\/v1\/projects\/?(\?|$)/, async (route) => {
        if (route.request().method() === 'POST') {
            await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'PERMISSION_DENIED', code: 'PERMISSION_DENIED' }),
            })
            return
        }
        await route.continue()
    })
    await openCreateProjectWizard(page, api)
    await advanceWizardToStep(page, 4)
    await byQa(page, 'host.createProject.submit').click()
    await expect(page.getByText(/прав|доступ|отказ/i)).toBeVisible({ timeout: 15_000 })
})

test.fixme('#66: BUG POST /v1/projects 500 Internal error on the stand: employee direct wizard submit surfaces server refusal', async ({ page, api }) => {
    const systemId = await resolveSystemId(api)
    await page.addInitScript(
        ({ sessionKey, systemId }) => {
            const raw = localStorage.getItem(sessionKey)
            if (!raw) return
            try {
                const envelope = JSON.parse(raw) as { state?: { user?: Record<string, unknown> } }
                envelope.state = envelope.state ?? {}
                envelope.state.user = {
                    ...(envelope.state.user ?? {}),
                    projects: [],
                    systemRole: 'employee',
                    system: { id: systemId, name: 'Org', role: 'employee' },
                }
                localStorage.setItem(sessionKey, JSON.stringify(envelope))
            } catch {
                /* ignore */
            }
        },
        { sessionKey: STORAGE_KEYS.sessionUser, systemId },
    )
    await openCreateProjectWizard(page, api)
    await advanceWizardToStep(page, 4)
    await byQa(page, 'host.createProject.submit').click()
    await expect(page.getByText(/прав|доступ|отказ|не удалось/i)).toBeVisible({
        timeout: 15_000,
    })
})

test.fixme('#68: BUG POST /v1/projects 500 Internal error on the stand: double-click submit creates only one project', async ({ page, api }) => {
    const projectName = uniqueName('onb-idempotent')
    let createdId: string | undefined
    try {
        await openCreateProjectWizard(page, api)
        const template = byQa(page, 'host.createProject.template').first()
        await expect(template).toBeVisible({ timeout: 30_000 })
        await template.click()
        await byQa(page, 'host.createProject.next').click()
        await byQa(page, 'host.createProject.name').fill(projectName)
        await byQa(page, 'host.createProject.next').click()
        await byQa(page, 'host.createProject.next').click()
        const submit = byQa(page, 'host.createProject.submit')
        await expect(submit).toBeVisible()
        await submit.dblclick()
        await expectEventuallyUrl(page, /\/p\/[^/]+/)
        createdId = page.url().match(/\/p\/([^/]+)/)?.[1]
        const own = await api.listOwnProjects()
        const matches = own.filter((p) => p.name === projectName)
        expect(matches.length).toBeLessThanOrEqual(1)
    } finally {
        if (createdId) await api.archiveProject(createdId)
    }
})

test.fixme('#89: BUG POST /v1/projects 500 Internal error on the stand: project created with orders off has no order types from template', async ({
    page,
    api,
}) => {
    const projectName = uniqueName('onb-no-orders')
    let createdId: string | undefined
    try {
        await openCreateProjectWizard(page, api)
        await completeProjectWizard(page, projectName, { disableOrders: true })
        await expectEventuallyUrl(page, /\/p\/[^/]+/)
        createdId = page.url().match(/\/p\/([^/]+)/)?.[1]
        expect(createdId).toBeTruthy()
        const types = await api.listOrderTypes(createdId!)
        expect(types.length).toBe(0)
    } finally {
        if (createdId) await api.archiveProject(createdId)
    }
})

test.fixme('#90: BUG POST /v1/projects 500 Internal error on the stand: first deals board uses template pipeline stages not hardcoded default', async ({
    page,
    api,
}) => {
    const projectName = uniqueName('onb-pipe-stages')
    let createdId: string | undefined
    try {
        await openCreateProjectWizard(page, api)
        await completeProjectWizard(page, projectName)
        await expectEventuallyUrl(page, /\/p\/[^/]+/)
        createdId = page.url().match(/\/p\/([^/]+)/)?.[1]
        expect(createdId).toBeTruthy()
        const pipelines = await api.getPipelines(createdId!)
        expect(pipelines.length).toBeGreaterThan(0)
        expect(pipelines[0]?.stages?.length).toBeGreaterThan(0)
    } finally {
        if (createdId) await api.archiveProject(createdId)
    }
})

test('#76: disabling orders shows warning about sale types not being created', async ({ page, api }) => {
    await openCreateProjectWizard(page, api)
    await advanceWizardToStep(page, 3)
    const ordersRow = byQa(page, 'host.createProject.module', { module: 'orders' })
    await toggleSwitcher(ordersRow.locator('input[type="checkbox"]'))
    await expect(
        page.getByText(/типы продаж.*не будут созданы/i),
    ).toBeVisible()
})

test('#77: seed demo data toggle is available on modules step', async ({ page, api }) => {
    await openCreateProjectWizard(page, api)
    await advanceWizardToStep(page, 3)
    await expect(byQa(page, 'host.createProject.seedDemo')).toBeAttached()
    await toggleSwitcher(byQa(page, 'host.createProject.seedDemo').locator('input[type="checkbox"]'))
})

test.fixme('#86: BUG POST /v1/projects 500 Internal error on the stand: wizard invite row sends projectGrant for the created project', async ({ page, api }) => {
    let createdId: string | undefined
    const payloads: unknown[] = []
    try {
        await page.route(/\/v1\/system\/invitations\/?(\?|$)/, async (route) => {
            if (route.request().method() === 'POST') {
                payloads.push(route.request().postDataJSON())
            }
            await route.continue()
        })
        await openCreateProjectWizard(page, api)
        await advanceWizardToStep(page, 4)
        // Invite fields lack qa-id — fill by role/placeholder for this API-contract test.
        const emailField = page.getByPlaceholder(/email|почт/i).first()
        await expect(emailField).toBeVisible()
        await emailField.fill(`${uniqueName('inv')}@example.com`)
        await byQa(page, 'host.createProject.submit').click()
        await expectEventuallyUrl(page, /\/p\/[^/]+/, 45_000)
        createdId = page.url().match(/\/p\/([^/]+)/)?.[1]
        expect(payloads.length).toBeGreaterThan(0)
        const body = payloads[0] as { projectGrants?: Array<{ projectId: string }> }
        expect(body.projectGrants?.[0]?.projectId).toBe(createdId)
    } finally {
        if (createdId) await api.archiveProject(createdId)
    }
})

test.fixme('#87: BUG POST /v1/projects 500 Internal error on the stand: project is created and landing succeeds even if pipe is slow', async ({
    page,
    api,
}) => {
    const projectName = uniqueName('onb-pipe')
    let createdId: string | undefined
    try {
        await page.route(/\/v1\/pipelines/, async (route) => {
            await new Promise((r) => setTimeout(r, 1500))
            await route.continue()
        })
        await openCreateProjectWizard(page, api)
        await completeProjectWizard(page, projectName)
        await expectEventuallyUrl(page, /\/p\/[^/]+/, 60_000)
        createdId = page.url().match(/\/p\/([^/]+)/)?.[1]
        expect(createdId).toBeTruthy()
    } finally {
        if (createdId) await api.archiveProject(createdId)
    }
})
