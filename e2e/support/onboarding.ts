import { expect, type Page } from '@playwright/test'
import { byQa } from './qa'
import { STORAGE_KEYS, uniqueName } from './env'
import { toggleSwitcher } from './ui'
import type { ApiClient } from '../fixtures/api'

/** Default system stub when live GET /v1/system is not needed. */
export const DEFAULT_SYSTEM_NAME = 'E2E Test Org'

export type SessionProject = {
    id: string
    name: string
    enabledModules?: string[]
}

/** Build a host-compatible ProjectInfo entry for sessionUser seeding. */
export function makeProjectInfo(
    id: string,
    name = id,
    modules: string[] = ['deals', 'contacts'],
) {
    return {
        id,
        name,
        color: '#6366f1',
        ownerType: 'ORGANIZATION' as const,
        ownerId: '',
        role: 'admin' as const,
        enabledModules: modules,
        effectiveModules: modules,
        moduleConfigs: modules.map((moduleId) => ({
            moduleId,
            enabled: true,
            personalSettings: {},
            integrationSettings: {},
            integrationMethodsEnabled: [],
        })),
        modulePolicies: [],
    }
}

type SessionPatch = {
    projects?: ReturnType<typeof makeProjectInfo>[]
    system?: { id: string; name: string; role?: string } | null
    systemRole?: string
    emailVerified?: boolean
    lastActiveProjectId?: string | null
}

/** Patch the persisted sessionUser envelope before navigation. */
export async function patchSessionUser(page: Page, patch: SessionPatch): Promise<void> {
    await page.addInitScript(
        ({ sessionKey, patchJson }) => {
            const patch = JSON.parse(patchJson) as SessionPatch
            const raw = localStorage.getItem(sessionKey)
            const token = localStorage.getItem('token')
            if (!raw) {
                if (!token) return
                localStorage.setItem(
                    sessionKey,
                    JSON.stringify({
                        state: {
                            user: {},
                            session: { signedIn: true },
                        },
                        version: 0,
                    }),
                )
            }
            const current = localStorage.getItem(sessionKey)
            if (!current) return
            try {
                const envelope = JSON.parse(current) as {
                    state?: {
                        user?: Record<string, unknown>
                        session?: { signedIn?: boolean }
                    }
                }
                const user = envelope.state?.user ?? {}
                if (patch.projects !== undefined) user.projects = patch.projects
                if (patch.system !== undefined) user.system = patch.system
                if (patch.systemRole !== undefined) user.systemRole = patch.systemRole
                if (patch.emailVerified !== undefined) user.emailVerified = patch.emailVerified
                if (patch.lastActiveProjectId !== undefined) {
                    user.lastActiveProjectId = patch.lastActiveProjectId
                }
                envelope.state = envelope.state ?? {}
                envelope.state.session = envelope.state.session ?? { signedIn: true }
                envelope.state.user = user
                localStorage.setItem(sessionKey, JSON.stringify(envelope))
            } catch {
                /* best-effort seed */
            }
        },
        { sessionKey: STORAGE_KEYS.sessionUser, patchJson: JSON.stringify(patch) },
    )
}

export async function seedOwnerWithoutProjects(
    page: Page,
    systemId: string,
    systemName = DEFAULT_SYSTEM_NAME,
): Promise<void> {
    await patchSessionUser(page, {
        projects: [],
        system: { id: systemId, name: systemName, role: 'platform_owner' },
        systemRole: 'platform_owner',
    })
}

export async function seedEmployeeWithoutProjects(
    page: Page,
    systemId: string,
    systemName = DEFAULT_SYSTEM_NAME,
): Promise<void> {
    await patchSessionUser(page, {
        projects: [],
        system: { id: systemId, name: systemName, role: 'employee' },
        systemRole: 'employee',
    })
}

export async function clearSystemFromSession(page: Page): Promise<void> {
    await patchSessionUser(page, {
        system: null,
        systemRole: undefined,
        projects: [],
    })
}

/** Stub GET /v1/projects so live refresh returns an empty membership list. */
export async function stubEmptyProjectsList(page: Page): Promise<void> {
    await page.route(/\/v1\/projects\/?(\?|$)/, async (route) => {
        if (route.request().method() !== 'GET') {
            await route.continue()
            return
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '[]',
        })
    })
}

/** Deterministic system id for session seeding when gateway has no /v1/system. */
export const FALLBACK_SYSTEM_ID = 'e2e-onboarding-system'

/** Resolve the live system id from gateway (falls back to a deterministic stub). */
export async function resolveSystemId(api: ApiClient): Promise<string> {
    const system = await api.getSystem()
    if (system?.id) return system.id
    const me = await api.getMe()
    const fromMe = (me as { system?: { id?: string } } | null)?.system?.id
    if (fromMe) return fromMe
    return FALLBACK_SYSTEM_ID
}

/** Sidebar nav item — both qa attrs required (qaSelector OR-branch is too broad). */
export function sidebarNavItem(page: Page, nav: string) {
    return page.locator(`[data-qa-id="host.sidebar.item"][data-qa-nav="${nav}"]`)
}

/** Open the org create-project wizard and wait for step 1. */
export async function openCreateProjectWizard(
    page: Page,
    api: ApiClient,
    opts: { ownerId?: string } = {},
): Promise<void> {
    const ownerId = opts.ownerId ?? (await resolveSystemId(api))
    await page.goto(`/account/projects/new?owner=${ownerId}`)
    await expect(page.getByRole('heading', { name: 'Выберите шаблон' })).toBeVisible({
        timeout: 30_000,
    })
}

/** Wizard reached (pathname only — owner query optional once step 1 is visible). */
export async function expectCreateProjectWizard(page: Page, timeout = 30_000): Promise<void> {
    await expect
        .poll(() => new URL(page.url()).pathname, { timeout })
        .toBe('/account/projects/new')
    await expect(page.getByRole('heading', { name: 'Выберите шаблон' })).toBeVisible({
        timeout,
    })
}

/** Pick first template and advance wizard to the given step (1-based). */
export async function advanceWizardToStep(page: Page, targetStep: number): Promise<void> {
    const template = byQa(page, 'host.createProject.template').first()
    await expect(template).toBeVisible({ timeout: 30_000 })
    if (targetStep <= 1) return

    await template.click()
    await byQa(page, 'host.createProject.next').click()

    if (targetStep <= 2) return

    const nameInput = byQa(page, 'host.createProject.name')
    await expect(nameInput).toBeVisible()
    await nameInput.fill(uniqueName('wizard'))
    await byQa(page, 'host.createProject.next').click()

    if (targetStep <= 3) return

    await byQa(page, 'host.createProject.next').click()
}

/** Walk the org wizard: template → name → modules → submit (skip invites). */
export async function completeProjectWizard(
    page: Page,
    projectName: string,
    opts: { seedDemo?: boolean; disableOrders?: boolean; skipInvites?: boolean } = {},
): Promise<void> {
    const template = byQa(page, 'host.createProject.template').first()
    await expect(template).toBeVisible({ timeout: 30_000 })
    await template.click()
    await byQa(page, 'host.createProject.next').click()

    const nameInput = byQa(page, 'host.createProject.name')
    await expect(nameInput).toBeVisible()
    await nameInput.fill(projectName)
    await byQa(page, 'host.createProject.next').click()

    if (opts.disableOrders) {
        const ordersRow = byQa(page, 'host.createProject.module', { module: 'orders' })
        await toggleSwitcher(ordersRow.locator('input[type="checkbox"]'))
    }

    if (opts.seedDemo) {
        await toggleSwitcher(byQa(page, 'host.createProject.seedDemo').locator('input[type="checkbox"]'))
    }

    await byQa(page, 'host.createProject.next').click()

    if (opts.skipInvites !== false) {
        const skip = byQa(page, 'host.createProject.skip')
        if (await skip.isVisible()) {
            await skip.click()
            return
        }
    }

    const submit = byQa(page, 'host.createProject.submit')
    await expect(submit).toBeVisible()
    await submit.click()
}

/** Wait until URL path (+ query when pattern includes `?`) matches. */
export async function expectEventuallyUrl(
    page: Page,
    pattern: RegExp,
    timeout = 30_000,
): Promise<void> {
    await expect
        .poll(() => {
            const url = new URL(page.url())
            return pattern.source.includes('\\?') || pattern.source.includes('?')
                ? `${url.pathname}${url.search}`
                : url.pathname
        }, { timeout })
        .toMatch(pattern)
}

/** Admin landing after Home resolver — first enabled module, not always /dashboard. */
export const LANDING_MODULE_PATH = /^\/(dashboard|deals|contacts|orders|statistics|activities|documents|reports|search|chat|p\/)/

/** Home or first-module landing (not onboarding/signin/bootstrap). */
export const APP_ENTRY_PATH = /^\/(?!auth|bootstrap|onboarding)/
