import type { Page } from '@playwright/test'
import { byQa } from './qa'
import { uniqueName, STORAGE_KEYS } from './env'
import type { ApiClient } from '../fixtures/api'

const permPattern = (projectId: string) => `**/v1/projects/${projectId}/permissions**`

function stripKeys(allowed: string[], omit: string[]): string[] {
    const drop = new Set(omit)
    return allowed.filter((k) => !drop.has(k))
}

function stripDocumentsSubject(allowed: string[]): string[] {
    return allowed.filter((k) => !k.startsWith('documents:') && !k.startsWith('documents.'))
}

async function patchPermissions(
    page: Page,
    projectId: string,
    patch: (body: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
    await page.route(permPattern(projectId), async (route) => {
        const upstream = await route.fetch()
        if (!upstream.ok()) {
            await route.fulfill({ response: upstream })
            return
        }
        const body = (await upstream.json()) as Record<string, unknown>
        await route.fulfill({
            status: upstream.status(),
            headers: upstream.headers(),
            contentType: 'application/json',
            body: JSON.stringify(patch(body)),
        })
    })
}

/** ST-10: strip all documents:* permissions and read wildcards from the PDP projection. */
export async function denyDocumentsRead(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (body) => ({
        ...body,
        allowed: stripKeys(stripDocumentsSubject((body.allowed as string[]) ?? []), ['*:read']),
    }))
}

export async function denyDocumentsManage(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (body) => ({
        ...body,
        allowed: stripKeys((body.allowed as string[]) ?? [], ['documents:manage', '*:manage']),
    }))
}

export async function denyDocumentsDelete(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (body) => ({
        ...body,
        allowed: stripKeys((body.allowed as string[]) ?? [], ['documents:delete', '*:delete']),
    }))
}

export async function denyDocumentsGenerate(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (body) => ({
        ...body,
        allowed: stripKeys((body.allowed as string[]) ?? [], [
            'documents.generate:execute',
            'documents:execute',
        ]),
    }))
}

export async function denyProjectManage(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (body) => ({
        ...body,
        allowed: stripKeys((body.allowed as string[]) ?? [], ['project:manage', '*:manage']),
    }))
}

/** Viewer-like documents access: read + download, no mutate actions. */
export async function setDocumentsViewer(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (body) => ({
        ...body,
        allowed: stripKeys((body.allowed as string[]) ?? [], [
            'documents:delete',
            'documents:manage',
            'documents.generate:execute',
            'documents:execute',
            '*:delete',
            '*:manage',
            '*:execute',
        ]),
    }))
}

/** ST-13: member with only_own visibility cannot open department journal. */
export async function setOnlyOwnVisibility(
    page: Page,
    projectId: string,
    selfId: string,
): Promise<void> {
    await patchPermissions(page, projectId, (body) => ({
        ...body,
        visibilityScope: { mode: 'hierarchy', level: 'only_own', selfId },
    }))
}

/** FR-DOCS-215: manager-like role — delete allowed, template manage denied. */
export async function setManagerDocumentsRole(page: Page, projectId: string): Promise<void> {
    await patchPermissions(page, projectId, (body) => {
        const allowed = new Set((body.allowed as string[]) ?? [])
        allowed.delete('documents:manage')
        allowed.delete('*:manage')
        allowed.add('documents:delete')
        allowed.add('documents:read')
        allowed.add('documents.generate:execute')
        return { ...body, allowed: [...allowed] }
    })
}

/** Navigate to contact card documents widget. */
export async function openContactDocuments(page: Page, contactId: string): Promise<void> {
    await page.goto(`/contacts/${contactId}`)
    await byQa(page, 'documents.tab.root').waitFor({ state: 'visible', timeout: 30_000 })
}

/** Navigate to company card documents widget. */
export async function openCompanyDocuments(page: Page, companyId: string): Promise<void> {
    await page.goto(`/companies/${companyId}`)
    await byQa(page, 'documents.tab.root').waitFor({ state: 'visible', timeout: 30_000 })
}

/** Switch host project context without full reload (ST-20). */
export async function switchProjectContext(
    page: Page,
    projectId: string,
    modules: string[] = [...DOCUMENTS_MODULES],
): Promise<void> {
    await page.evaluate(
        ({ idKey, projKey, sessionKey, id, mods }) => {
            localStorage.setItem(idKey, id)
            localStorage.setItem(projKey, JSON.stringify({ id, name: id, enabledModules: mods }))
            const raw = localStorage.getItem(sessionKey)
            if (!raw) return
            try {
                const envelope = JSON.parse(raw) as {
                    state?: { user?: { projects?: Array<{ id: string; name: string }> } }
                }
                const projects = envelope.state?.user?.projects ?? []
                if (!projects.some((p) => p.id === id)) {
                    projects.push({ id, name: id })
                    envelope.state = envelope.state ?? {}
                    envelope.state.user = envelope.state.user ?? {}
                    envelope.state.user.projects = projects
                    localStorage.setItem(sessionKey, JSON.stringify(envelope))
                }
            } catch {
                /* ignore */
            }
        },
        {
            idKey: STORAGE_KEYS.projectId,
            projKey: STORAGE_KEYS.project,
            sessionKey: STORAGE_KEYS.sessionUser,
            id: projectId,
            mods: modules,
        },
    )
}

/** Default module set for documents e2e projects. */
export const DOCUMENTS_MODULES = [
    'documents',
    'deals',
    'orders',
    'contacts',
    'products',
] as const

/** Create an isolated documents project and seed host project context. */
export async function seedDocumentsProject(
    api: ApiClient,
    useProject: (pid: string, modules?: string[]) => Promise<void>,
    label: string,
    modules: string[] = [...DOCUMENTS_MODULES],
): Promise<string> {
    const pid = await api.createDocumentsProject(uniqueName(label))
    await useProject(pid, modules)
    return pid
}

/** Navigate to project-scoped documents list. */
export async function openDocumentsList(page: Page, projectId: string): Promise<void> {
    await page.goto(`/p/${projectId}/documents`)
    await byQa(page, 'documents.list.root').waitFor({ state: 'visible', timeout: 30_000 })
}

/** Open documents settings tab for a project (admin / project:manage). */
export async function openDocumentsSettings(page: Page, projectId: string): Promise<void> {
    await page.goto(
        `/account/projects/${projectId}/settings?tab=module:documents:DocumentsSettingsTab`,
    )
    await byQa(page, 'documents.settings.root').waitFor({ state: 'visible', timeout: 30_000 })
}

/** Navigate to department documents journal. */
export async function openDocumentsDept(page: Page, projectId: string): Promise<void> {
    await page.goto(`/p/${projectId}/documents/department`)
    await byQa(page, 'documents.dept.root').waitFor({ state: 'visible', timeout: 30_000 })
}

/** Select a template in GenerateDialog via qa-ids. */
export async function pickGenerateTemplate(page: Page, templateId: string): Promise<void> {
    await byQa(page, 'documents.generate.template').click()
    await byQa(page, 'documents.generate.templateOption', { template: templateId }).click()
}
