import type { Page } from '@playwright/test'

/** Default module set for companies-area e2e fixtures. */
export const COMPANIES_MODULES = ['companies', 'contacts', 'deals', 'orders'] as const

const permPattern = (projectId: string) => `**/api/v1/projects/${projectId}/permissions**`

function stripKeys(allowed: string[], omit: string[]): string[] {
    const drop = new Set(omit)
    return allowed.filter((k) => !drop.has(k))
}

function stripCompaniesSubject(allowed: string[]): string[] {
    return allowed.filter((k) => !k.startsWith('companies:') && !k.startsWith('companies.'))
}

async function patchPermissions(
    page: Page,
    projectId: string,
    patch: (allowed: string[]) => string[],
): Promise<void> {
    await page.route(permPattern(projectId), async (route) => {
        const upstream = await route.fetch()
        if (!upstream.ok()) {
            await route.fulfill({ response: upstream })
            return
        }
        const body = (await upstream.json()) as { allowed?: string[] }
        const allowed = patch(body.allowed ?? [])
        await route.fulfill({
            status: upstream.status(),
            headers: upstream.headers(),
            contentType: 'application/json',
            body: JSON.stringify({ ...body, allowed }),
        })
    })
}

/** ST-10: strip all companies:* permissions and read wildcards from the PDP projection. */
export async function denyCompaniesRead(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (allowed) =>
        stripKeys(stripCompaniesSubject(allowed), ['*:read']),
    )
}

export async function denyCompaniesWrite(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (allowed) =>
        stripKeys(allowed, ['companies:write', 'companies:execute', '*:write']),
    )
}

export async function denyCompaniesManage(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (allowed) =>
        stripKeys(allowed, ['companies:manage', '*:manage']),
    )
}

export async function denyCompaniesImport(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (allowed) =>
        stripKeys(allowed, ['companies:import', '*:import']),
    )
}

export async function denyCompaniesOwnerWrite(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (allowed) =>
        stripKeys(allowed, ['companies.owner:write', 'companies:manage', '*:manage']),
    )
}

export async function denyCompaniesDelete(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (allowed) =>
        stripKeys(allowed, ['companies:delete', '*:delete']),
    )
}

export async function denyCompaniesExport(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (allowed) =>
        stripKeys(allowed, ['companies:export', '*:export']),
    )
}

/** Ensure export action is visible when the stand projection omits companies:export. */
export async function grantCompaniesExport(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (allowed) => {
        const next = new Set(allowed)
        next.add('companies:export')
        return [...next]
    })
}

/** Ensure import wizard is reachable when the stand projection omits companies:import. */
export async function grantCompaniesImport(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (allowed) => {
        const next = new Set(allowed)
        next.add('companies:import')
        return [...next]
    })
}
