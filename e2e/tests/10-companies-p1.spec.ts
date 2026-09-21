import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName, STORAGE_KEYS } from '../support/env'
import { toggleSwitcher } from '../support/ui'

/**
 * Companies — P1 scenarios (catalog `.e2e-scenario-catalog/companies.md`).
 *
 * Automatable-now P1 flows that do not duplicate the P0 specs in 06–09 and are
 * expected to pass green against the stand via the hybrid harness.
 */

test.use({ forbiddenAllow: ['/v1/activities', '/v1/documents', '/v1/notifications'] })

const MODULES = ['companies', 'contacts', 'deals', 'orders']

async function seedProject(
    api: { createProject: (name: string, modules: string[]) => Promise<string> },
    useProject: (pid: string, modules?: string[]) => Promise<void>,
    label: string,
    modules: string[] = MODULES,
): Promise<string> {
    const pid = await api.createProject(uniqueName(label), modules)
    await useProject(pid, modules)
    return pid
}

test('#3 list: without a selected project shows the empty-project state', async ({ page }) => {
    // Host auto-picks userProjects[0] whenever membership is non-empty
    // (useResolvedProjectId). ST-19 is the !pid branch — reachable only when
    // the live project list is empty. Empty the session snapshot and the
    // GET /v1/projects refresh so the shell does not re-select a project.
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
                /* keep going — route stub below is the real gate */
            }
        },
        {
            idKey: STORAGE_KEYS.projectId,
            projKey: STORAGE_KEYS.project,
            sessionKey: STORAGE_KEYS.sessionUser,
        },
    )
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
    await page.goto('/companies')
    await expect(byQa(page, 'companies.list.noProject')).toBeVisible({ timeout: 30_000 })
})

test('#28 list: an empty project shows the onboarding empty state', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-empty', ['companies'])
    try {
        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.emptyNone')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'companies.list.createEmpty')).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#29 list: a filter with no matches offers to reset filters', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-nomatch')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-visible') })

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })

        await byQa(page, 'companies.list.search').fill(uniqueName('co-absent-needle'))
        await expect(byQa(page, 'companies.list.emptyFilter')).toBeVisible({ timeout: 20_000 })
        await byQa(page, 'companies.list.resetFilters').click()
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible({
            timeout: 20_000,
        })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#38 list: "only mine" preference survives a page reload', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-mine-persist')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-mine-persist-row') })

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })

        const mineOnly = page.waitForResponse(
            (r) =>
                r.url().includes('/v1/companies?') &&
                r.url().includes('filterOwnerId=') &&
                r.request().method() === 'GET',
            { timeout: 20_000 },
        )
        await toggleSwitcher(byQa(page, 'companies.list.onlyMine'))
        await mineOnly

        const stored = await page.evaluate(
            (key) => localStorage.getItem(key),
            `ff.companies.filters.${pid}`,
        )
        expect(stored, 'onlyMine persisted per-project').toContain('"onlyMine":true')

        await page.reload()
        await expect(byQa(page, 'companies.list.onlyMine')).toBeChecked({ timeout: 30_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#43 create: empty name shows validation and blocks submit', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-val-create')
    try {
        await page.goto('/companies')
        const openCreate = byQa(page, 'companies.list.create').or(
            byQa(page, 'companies.list.createEmpty'),
        )
        await expect(openCreate.first()).toBeVisible({ timeout: 30_000 })
        await openCreate.first().click()

        // Empty name: Button is visually blocked (no HTML disabled attr) and
        // swallows the click — VAL-MCOM-1 "submit blocked".
        await expect(byQa(page, 'companies.create.submit')).toHaveClass(/cursor-not-allowed/)
        // Whitespace-only name enables the button; handleCreateCompany trims
        // and surfaces the inline error.
        await byQa(page, 'companies.create.name').fill('   ')
        await byQa(page, 'companies.create.submit').click()
        await expect(byQa(page, 'companies.create.error')).toContainText('Название обязательно')
    } finally {
        await api.archiveProject(pid)
    }
})

test('#71 card: unknown company id shows not-found and back link', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-404')
    try {
        await page.goto(`/companies/nonexistent-${Date.now()}`)
        await expect(byQa(page, 'companies.card.notFound')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.card.backToList').click()
        await expect(page).toHaveURL(/\/companies$/, { timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#72 card: company without links shows empty widgets', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-empty-widgets')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-empty-widgets-co') })

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.infoWidget')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'companies.card.contactsEmpty')).toBeVisible()
        await expect(byQa(page, 'companies.card.dealsEmpty')).toBeVisible()
        await expect(byQa(page, 'companies.card.ordersEmpty')).toBeVisible()
        // Fresh create writes an audit event, so historyEmpty is not reachable
        // for a just-seeded company (каталог #72 «Нет истории» расходится с BFF).
        await expect(byQa(page, 'companies.card.historyWidget')).toBeVisible()
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#97 card: merge picker shows empty state when no duplicates exist', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-merge-empty')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-unique-merge') })

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.merge')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.card.merge').click()
        await expect(byQa(page, 'companies.card.mergePickerDialog')).toBeVisible()
        await expect(byQa(page, 'companies.card.mergePickerEmpty')).toBeVisible({ timeout: 20_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#103 card: deal row navigates to the deal card', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-deal-nav')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-deal-nav-co') })
        const dealId = await api.createDeal(pid, {
            name: uniqueName('co-deal-nav-deal'),
            amount: 1500,
            companyId,
        })

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.dealRow', { deal: dealId })).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'companies.card.dealRow', { deal: dealId }).click()
        await expect(page).toHaveURL(new RegExp(`/deals/${dealId}$`), { timeout: 30_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#104 card: order row navigates to the order card', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-order-nav')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-order-nav-co') })
        const dealId = await api.createDeal(pid, {
            name: uniqueName('co-order-nav-deal'),
            amount: 800,
            companyId,
        })
        const orderTypeId = (await api.createOrderType(pid, uniqueName('co-order-nav-ot'))).id
        const orderId = await api.createOrder(pid, { orderTypeId, companyId, dealId, amount: 400 })

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.orderRow', { order: orderId })).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'companies.card.orderRow', { order: orderId }).click()
        await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`), { timeout: 30_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#110 edit: empty name shows inline validation', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-edit-val')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-edit-val-co') })

        await page.goto(`/companies/${companyId}/edit`)
        await expect(byQa(page, 'companies.edit.name')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.edit.name').fill('')
        await byQa(page, 'companies.edit.save').click()
        await expect(byQa(page, 'companies.edit.nameError')).toContainText('Название обязательно')
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#111 edit: save stays disabled until the form is dirty', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-edit-dirty-btn')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-edit-dirty-btn-co') })

        await page.goto(`/companies/${companyId}/edit`)
        await expect(byQa(page, 'companies.edit.name')).toBeVisible({ timeout: 30_000 })
        // host Button does not set HTML disabled — only opacity/cursor classes.
        const save = byQa(page, 'companies.edit.save')
        await expect(save).toHaveClass(/cursor-not-allowed/)
        await byQa(page, 'companies.edit.phone').fill('+7 900 000-00-99')
        await expect(save).not.toHaveClass(/cursor-not-allowed/)
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#112 edit: dirty guard «Остаться» / «Уйти без сохранения»', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-edit-guard')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-edit-guard-co') })

        await page.goto(`/companies/${companyId}/edit`)
        await expect(byQa(page, 'companies.edit.name')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.edit.notes').fill('unsaved note')
        await byQa(page, 'companies.edit.back').click()
        await expect(byQa(page, 'companies.edit.dirtyGuard')).toBeVisible({ timeout: 10_000 })
        await byQa(page, 'companies.edit.dirtyGuardStay').click()
        await expect(byQa(page, 'companies.edit.notes')).toHaveValue('unsaved note')

        await byQa(page, 'companies.edit.back').click()
        await expect(byQa(page, 'companies.edit.dirtyGuard')).toBeVisible({ timeout: 10_000 })
        await byQa(page, 'companies.edit.dirtyGuardLeave').click()
        await expect(page).toHaveURL(new RegExp(`/companies/${companyId}$`), { timeout: 20_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#114 edit: unknown company shows not-found on the edit screen', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-edit-404')
    try {
        await page.goto(`/companies/nonexistent-${Date.now()}/edit`)
        await expect(byQa(page, 'companies.edit.notFound')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#121 trash: empty trash shows the empty state', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-trash-empty')
    try {
        await page.goto('/companies/trash')
        await expect(byQa(page, 'companies.trash.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#124 trash: row click opens the trashed company card', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-trash-row')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-trash-row-co') })
        await api.deleteCompany(pid, companyId)

        await page.goto('/companies/trash')
        await expect(byQa(page, 'companies.trash.row', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'companies.trash.row', { company: companyId }).click()
        await expect(page).toHaveURL(new RegExp(`/companies/${companyId}$`), { timeout: 30_000 })
    } finally {
        if (companyId) await api.purgeCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#133 merge: bare URL shows the no-selection state', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-merge-noselect')
    try {
        await page.goto('/companies/merge')
        await expect(byQa(page, 'companies.merge.noSelection')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#134 merge: master equals loser shows validation', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-merge-same')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-merge-same-co') })
        await page.goto(`/companies/merge?master=${companyId}&loser=${companyId}`)
        await expect(byQa(page, 'companies.merge.sameRecord')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#135 merge: trashed loser shows unavailable state', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-merge-unavail')
    const ids: string[] = []
    try {
        ids.push(await api.createCompany(pid, { name: uniqueName('co-merge-master') }))
        ids.push(await api.createCompany(pid, { name: uniqueName('co-merge-loser') }))
        await api.deleteCompany(pid, ids[1])

        await page.goto(`/companies/merge?master=${ids[0]}&loser=${ids[1]}`)
        await expect(byQa(page, 'companies.merge.unavailable')).toBeVisible({ timeout: 30_000 })
    } finally {
        for (const id of ids) await api.purgeCompany(pid, id)
        await api.archiveProject(pid)
    }
})

test('#140 merge: cancel on the merge screen returns without merging', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-merge-cancel')
    const ids: string[] = []
    try {
        ids.push(await api.createCompany(pid, { name: uniqueName('co-merge-cancel-a') }))
        ids.push(await api.createCompany(pid, { name: uniqueName('co-merge-cancel-b') }))

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row')).toHaveCount(2, { timeout: 30_000 })
        await page.goto(`/companies/merge?master=${ids[0]}&loser=${ids[1]}`)
        await expect(byQa(page, 'companies.merge.preview')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.merge.cancel').click()
        await expect(page).toHaveURL(/\/companies$/, { timeout: 30_000 })
        expect((await api.listCompanies(pid)).map((c) => c.id).sort()).toEqual(ids.slice().sort())
    } finally {
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})
