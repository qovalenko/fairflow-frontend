import type { Page } from '@playwright/test'
import { STORAGE_KEYS } from './env'

const AUTOMATION_MODULES = ['deals', 'contacts', 'activities', 'automation']

/** Project modules preset for automation e2e (CRM triggers + automation UI). */
export const AUTOMATION_PROJECT_MODULES = AUTOMATION_MODULES

/**
 * Clear host project context so portfolio routes show NoProjectState (catalog #1 ST-19).
 */
export async function clearProjectContext(page: Page): Promise<void> {
    await page.addInitScript(({ idKey, projKey }) => {
        localStorage.removeItem(idKey)
        localStorage.removeItem(projKey)
    }, { idKey: STORAGE_KEYS.projectId, projKey: STORAGE_KEYS.project })
}

/**
 * Intercept PDP projection and deny all automation:* permissions (catalog #2 ST-10).
 * Pass through other subjects unchanged from the real stand response.
 */
export async function denyAutomationRead(page: Page, projectId: string): Promise<void> {
    const pattern = `**/api/v1/projects/${projectId}/permissions`
    await page.route(pattern, async (route) => {
        const response = await route.fetch()
        if (!response.ok()) {
            await route.fulfill({ response })
            return
        }
        const body = (await response.json()) as { allowed?: string[] }
        const allowed = (body.allowed ?? []).filter(
            (key) => !key.startsWith('automation:') && !key.startsWith('automation.'),
        )
        await route.fulfill({
            response,
            json: { ...body, allowed },
        })
    })
}

/**
 * Intercept PDP projection: automation read/write/execute but NOT manage.
 * Used for catalog #64, #77 (send_webhook blocked without manage).
 */
export async function grantAutomationWriteWithoutManage(
    page: Page,
    projectId: string,
): Promise<void> {
    const pattern = `**/api/v1/projects/${projectId}/permissions`
    await page.route(pattern, async (route) => {
        const response = await route.fetch()
        const body = response.ok()
            ? ((await response.json()) as { allowed?: string[] })
            : { allowed: [] as string[] }
        const base = new Set(body.allowed ?? [])
        for (const key of [
            'automation:read',
            'automation:write',
            'automation:execute',
            'deals:read',
            'deals:write',
            'contacts:read',
            'contacts:write',
            'activities:read',
            'activities:write',
        ]) {
            base.add(key)
        }
        base.delete('automation:manage')
        await route.fulfill({
            status: response.ok() ? response.status() : 200,
            contentType: 'application/json',
            body: JSON.stringify({ ...body, allowed: [...base] }),
        })
    })
}

/**
 * Seed project without automation module enabled (catalog #3 ST-17 nav — partial;
 * direct URL uses host module guard).
 */
export async function useProjectWithoutAutomationModule(
    useProject: (projectId: string, enabledModules?: string[]) => Promise<void>,
    projectId: string,
): Promise<void> {
    await useProject(projectId, ['deals', 'contacts'])
}
