import { expect, type Page } from '@playwright/test'
import { byQa } from './qa'
import { pickSelectOption } from './ui'
import { gotoAuthenticated } from './login'

/** Expected 403s from disabled sibling modules on seeded projects. */
export const CONTACTS_FORBIDDEN_ALLOW = ['/v1/companies', '/v1/activities']

/** Assignee filter option for orphan contacts (`ownerScope=__unassigned__`). */
export const CONTACTS_OWNER_UNASSIGNED = '__unassigned__'

/** Default module set for contacts-area e2e fixtures. */
export const CONTACTS_MODULES = ['contacts', 'deals'] as const

/**
 * Intercept PDP projection and drop selected permission keys from `allowed[]`.
 * Used for ST-10 / ST-11 negative cases without a second test user.
 */
export async function omitContactsPermissions(
    page: Page,
    projectId: string,
    omitKeys: string[],
): Promise<void> {
    const pattern = `**/v1/projects/${projectId}/permissions`
    // Ensure no stale SWR/projection from a prior navigation in this context.
    await page.goto('about:blank')
    await page.route(pattern, async (route) => {
        const upstream = await route.fetch()
        const body = (await upstream.json()) as { allowed?: string[] }
        if (Array.isArray(body.allowed)) {
            body.allowed = body.allowed.filter((key) => {
                if (omitKeys.includes(key)) return false
                // Role grants like `*:read` survive omitting `contacts:read` — strip
                // action wildcards for every omitted precise key (ST-10/11 negatives).
                for (const omit of omitKeys) {
                    const action = omit.split(':')[1]
                    if (action && key === `*:${action}`) return false
                }
                return true
            })
        }
        await route.fulfill({
            status: upstream.status(),
            headers: upstream.headers(),
            contentType: 'application/json',
            body: JSON.stringify(body),
        })
    })
}

async function dismissStaleShell(page: Page): Promise<void> {
    const refresh = page.getByRole('button', { name: 'Обновить страницу' })
    if (await refresh.isVisible().catch(() => false)) {
        await refresh.click()
        await expect(page.getByRole('heading', { name: 'Страница устарела' })).toHaveCount(0, {
            timeout: 30_000,
        })
    }
}

export async function seedContactsProject(
    api: { createProject: (name: string, modules: string[]) => Promise<string> },
    useProject: (pid: string, modules?: string[]) => Promise<void>,
    label: string,
    modules: string[] = [...CONTACTS_MODULES],
): Promise<string> {
    const pid = await api.createProject(label, modules)
    await useProject(pid, modules)
    return pid
}

/** Navigate to a contacts route after storageState replay (zustand rehydrate race). */
export async function gotoContacts(page: Page, path = '/contacts'): Promise<void> {
    const isList = path === '/contacts' || path.startsWith('/contacts?')
    const listFetch = isList
        ? page
              .waitForResponse(
                  (r) =>
                      r.url().includes('/v1/contacts') &&
                      r.request().method() === 'GET' &&
                      r.status() < 500,
                  { timeout: 30_000 },
              )
              .catch(() => undefined)
        : null
    await page.goto(path)
    if (listFetch) await listFetch
    await dismissStaleShell(page)
    await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 30_000 })
}

/** Pick a react-select option rendered with contacts.list.filter*.option qa-ids. */
export async function pickFilterOption(
    page: Page,
    selectId:
        | 'contacts.list.filterSource'
        | 'contacts.list.filterAssignee'
        | 'contacts.list.filterInactive'
        | 'contacts.reassign.from'
        | 'contacts.reassign.to',
    value: string,
): Promise<void> {
    const control = byQa(page, selectId)
    await expect(control).toBeVisible({ timeout: 15_000 })
    const listFetch = page
        .waitForResponse(
            (r) =>
                r.url().includes('/v1/contacts') &&
                r.request().method() === 'GET' &&
                r.status() < 500,
            { timeout: 30_000 },
        )
        .catch(() => undefined)
    if (value === CONTACTS_OWNER_UNASSIGNED) {
        await pickSelectOption(control, 'Без ответственного')
    } else {
        await control.click()
        await byQa(page, `${selectId}.option`, { value }).click()
    }
    if (listFetch) await listFetch
}

/** Open project settings tab for contacts module. */
export async function openContactsSettings(page: Page, projectId: string): Promise<void> {
    await gotoAuthenticated(
        page,
        `/account/projects/${projectId}/settings?tab=module:contacts:ContactsSettingsTab`,
    )
}

/** Map react-select mapping field on import step 2 (contacts.import.mappingField). */
export async function pickImportMappingColumn(
    page: Page,
    field: string,
    columnIndex: string,
): Promise<void> {
    await byQa(page, 'contacts.import.mappingField.control', { field }).click()
    await byQa(page, 'contacts.import.mappingField.option', { field, value: columnIndex }).click()
}

/** Duplicate-queue API may swap left/right vs creation order. */
export function duplicatePair(page: Page, a: string, b: string) {
    return byQa(page, 'contacts.duplicates.pair', { left: a, right: b }).or(
        byQa(page, 'contacts.duplicates.pair', { left: b, right: a }),
    )
}

export function duplicateMerge(page: Page, a: string, b: string) {
    return byQa(page, 'contacts.duplicates.merge', { left: a, right: b }).or(
        byQa(page, 'contacts.duplicates.merge', { left: b, right: a }),
    )
}
