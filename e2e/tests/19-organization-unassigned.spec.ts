import { type Page } from '@playwright/test'
import { test, expect } from '../fixtures/test'
import { uniqueName, STORAGE_KEYS } from '../support/env'
import { openProjectSettingsTab } from '../support/organization'
import { clearProjectContext } from '../support/projectContext'
import { omitPermissions } from '../support/statistics'
import { pickSelectOption } from '../support/ui'

const MODULES = ['deals', 'contacts'] as const

async function seedProject(
    api: import('../fixtures/api').ApiClient,
    useProject: (projectId: string, enabledModules?: string[]) => Promise<void>,
    label: string,
): Promise<string> {
    const pid = await api.createProject(uniqueName(label), [...MODULES])
    await useProject(pid, [...MODULES])
    return pid
}

async function openUnassignedTab(page: Page, projectId: string): Promise<void> {
    await openProjectSettingsTab(page, projectId, 'unassigned')
    await expect(page.getByRole('tab', { name: 'Без владельца' })).toBeVisible({
        timeout: 30_000,
    })
}

async function seedOrphanContact(
    api: import('../fixtures/api').ApiClient,
    projectId: string,
): Promise<{ id: string; title: string }> {
    const firstName = uniqueName('orphan')
    const lastName = 'NoOwner'
    const id = await api.createContact(projectId, { firstName, lastName })
    await api.reindexSearch(projectId)
    const title = `${firstName} ${lastName}`
    await expect
        .poll(
            async () => {
                const res = await api.listUnassigned(projectId, { resource: 'contact' })
                return res.list.some((r) => r.entityId === id)
            },
            { timeout: 45_000 },
        )
        .toBe(true)
    return { id, title }
}

async function pickUnassignedResource(page: Page, label: string): Promise<void> {
    const filter = page.locator('.select-control').first()
    await pickSelectOption(filter, label)
}

test('#119: tab visible for project admin, empty «Все записи имеют владельца»', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'unassigned-empty')

    try {
        await openUnassignedTab(page, pid)
        await expect(page.getByText('Все записи имеют владельца.')).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test.fixme('#120: orphans after offboard — flaky pipeline', async () => {
    /* Offboard + search reindex timing is unstable on shared CI stand. */
})

test('#121: filter by resource type', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'unassigned-filter')
    let orphan: { id: string; title: string } | undefined

    try {
        orphan = await seedOrphanContact(api, pid)
        await openUnassignedTab(page, pid)
        await expect(page.getByText(orphan.title)).toBeVisible({ timeout: 30_000 })

        await pickUnassignedResource(page, 'Контакты')
        await expect(page.getByText(orphan.title)).toBeVisible({ timeout: 20_000 })

        await pickUnassignedResource(page, 'Сделки')
        await expect(page.getByText(orphan.title)).toHaveCount(0, { timeout: 20_000 })
    } finally {
        if (orphan) await api.deleteContact(pid, orphan.id).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test('#122: select records + reassign bulk', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'unassigned-bulk')
    let orphan: { id: string; title: string } | undefined

    try {
        orphan = await seedOrphanContact(api, pid)
        const members = await api.listMembers(pid)
        const owner = members.find((m) => m.name || m.id)
        const ownerLabel = String(owner?.name ?? owner?.id ?? '')
        if (!ownerLabel) throw new Error('No project members for bulk reassign')

        await openUnassignedTab(page, pid)
        await expect(page.getByText(orphan.title)).toBeVisible({ timeout: 30_000 })

        const row = page.locator('div').filter({ hasText: orphan.title }).last()
        await row.locator('input[type="checkbox"]').first().check()
        await expect(page.getByText(/Выбрано:\s*1/)).toBeVisible()

        const ownerSelect = page.locator('.select-control').nth(1)
        await pickSelectOption(ownerSelect, ownerLabel)
        await page.getByRole('button', { name: 'Переназначить' }).click()

        await expect(page.getByText(/Переназначено записей:/)).toBeVisible({ timeout: 20_000 })
        await expect(page.getByText('Все записи имеют владельца.')).toBeVisible({
            timeout: 20_000,
        })
        orphan = undefined
    } finally {
        if (orphan) await api.deleteContact(pid, orphan.id).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test('#123: bulk reassign error toast mock 5xx', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'unassigned-bulk-err')
    let orphan: { id: string; title: string } | undefined

    try {
        orphan = await seedOrphanContact(api, pid)
        const members = await api.listMembers(pid)
        const ownerLabel = String(members[0]?.name ?? members[0]?.id ?? '')
        if (!ownerLabel) throw new Error('No project members for bulk reassign')

        await openUnassignedTab(page, pid)
        await expect(page.getByText(orphan.title)).toBeVisible({ timeout: 30_000 })

        const row = page.locator('div').filter({ hasText: orphan.title }).last()
        await row.locator('input[type="checkbox"]').first().check()

        const ownerSelect = page.locator('.select-control').nth(1)
        await pickSelectOption(ownerSelect, ownerLabel)

        await page.route('**/unassigned/bulk-reassign', (route) =>
            route.fulfill({ status: 500, body: '{"error":"fail"}' }),
        )
        await page.getByRole('button', { name: 'Переназначить' }).click()
        await expect(page.getByText('Не удалось переназначить записи')).toBeVisible({
            timeout: 15_000,
        })
    } finally {
        if (orphan) await api.deleteContact(pid, orphan.id).catch(() => undefined)
        await api.archiveProject(pid)
    }
})

test('#124: load more pagination via cursor', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'unassigned-paginate')
    const firstTitle = uniqueName('orphan-page1')
    const secondTitle = uniqueName('orphan-page2')
    const cursor = 'cursor-mock-page2'

    try {
        await page.route(`**/v1/projects/${pid}/unassigned**`, async (route) => {
            const url = route.request().url()
            if (route.request().method() !== 'GET') return route.continue()
            if (url.includes('cursor=')) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        list: [
                            {
                                entityType: 'contact',
                                entityId: 'orphan-2',
                                title: secondTitle,
                                updatedAt: new Date().toISOString(),
                            },
                        ],
                        nextCursor: '',
                    }),
                })
            }
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    list: [
                        {
                            entityType: 'contact',
                            entityId: 'orphan-1',
                            title: firstTitle,
                            updatedAt: new Date().toISOString(),
                        },
                    ],
                    nextCursor: cursor,
                }),
            })
        })

        await openUnassignedTab(page, pid)
        await expect(page.getByText(firstTitle)).toBeVisible({ timeout: 30_000 })
        await expect(page.getByText(secondTitle)).toHaveCount(0)

        await page.getByRole('button', { name: 'Загрузить ещё' }).click()
        await expect(page.getByText(secondTitle)).toBeVisible({ timeout: 15_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#125: load error 5xx', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'unassigned-5xx')

    try {
        await page.route(`**/v1/projects/${pid}/unassigned**`, (route) =>
            route.fulfill({ status: 500, body: '{"error":"fail"}' }),
        )
        await openUnassignedTab(page, pid)
        await expect(page.getByText('Не удалось загрузить записи без владельца.')).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#126: no project selected «Проект не выбран»', async ({ page }) => {
    await page.addInitScript(
        ({ idKey, projKey, sessionKey }) => {
            localStorage.removeItem(idKey)
            localStorage.removeItem(projKey)
            const raw = localStorage.getItem(sessionKey)
            if (!raw) return
            try {
                const envelope = JSON.parse(raw) as {
                    state?: { user?: { projects?: unknown[] } }
                }
                if (envelope.state?.user) envelope.state.user.projects = []
                localStorage.setItem(sessionKey, JSON.stringify(envelope))
            } catch {
                /* route below is the gate */
            }
        },
        {
            idKey: STORAGE_KEYS.projectId,
            projKey: STORAGE_KEYS.project,
            sessionKey: STORAGE_KEYS.sessionUser,
        },
    )
    await clearProjectContext(page)
    await page.goto('/account/projects/settings?tab=unassigned')
    await expect(page.getByText('Проект не выбран.')).toBeVisible({ timeout: 30_000 })
})

test('#127: non-admin tab hidden — member without project:manage', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'unassigned-gated')

    try {
        await omitPermissions(page, pid, ['project:manage'])
        await page.goto(`/account/projects/${pid}/settings?tab=general`)
        await expect(page.getByRole('tab', { name: 'Основное' })).toBeVisible({
            timeout: 30_000,
        })
        await expect(page.getByRole('tab', { name: 'Доступ' })).toHaveCount(0)
        await expect(page.getByRole('tab', { name: 'Без владельца' })).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})
