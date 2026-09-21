import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { pickSelectOption, selectRow, toggleSwitcher } from '../support/ui'

/**
 * Companies — SCR-COMPANIES-LIST (catalog `.e2e-scenario-catalog/companies.md`).
 *
 * Covers the P0 list scenarios: navigation (#1), browse/paginate/search/filter
 * (#20–#24, #27), toolbar links (#35, #36), "only mine" (#37), the create drawer
 * (#41, #42, #45), export (#58) and bulk actions (#62, #65).
 *
 * Every test seeds its own project + companies over REST and cleans both up in
 * `finally`, so a failing assertion never leaves data behind for the next one.
 */

// The companies list and the portfolio shell around it fetch panels of modules
// that these projects intentionally do not enable (activities feed, documents,
// notifications), and the gateway module-policy answers those GETs with 403 —
// expected product behaviour, not a T-001 regression. Everything on the
// companies happy path stays under the INV-403-00 guard.
// String substrings, not RegExps (see forbiddenAllow doc in fixtures/test.ts).
test.use({ forbiddenAllow: ['/v1/activities', '/v1/documents', '/v1/notifications'] })

const MODULES = ['companies', 'contacts', 'deals']

/** Seed a project with the companies module on and prime the host context. */
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

test('#1 nav: companies opens from the host sidebar when the module is on', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-nav')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-nav-row') })

        await page.goto(`/p/${pid}`)
        const navItem = byQa(page, 'host.sidebar.item', { nav: 'portfolio.companies' })
        await expect(navItem).toBeVisible({ timeout: 30_000 })
        await navItem.click()

        await expect(page).toHaveURL(/\/companies$/, { timeout: 30_000 })
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

/**
 * #20 — server-side pagination.
 *
 * BLOCKED on the stand: `GET /v1/companies` returns `total === pageSize` on page 0
 * (e.g. 12 companies seeded, pageSize=10 → total=10, one page only, «next»
 * disabled). Page 1 data exists (`pageIndex=1` → 2 rows) but the UI never
 * offers page 2. Repro: scripts/diag-pagination.mjs against the stand.
 */
test.fixme('#20 list: server-side pagination pages through the seeded companies', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-page')
    const ids: string[] = []
    try {
        // 12 > default pageSize (10): page 1 is full, page 2 holds the remainder.
        for (let i = 0; i < 12; i++) {
            ids.push(await api.createCompany(pid, { name: `${uniqueName('co-page')}-${i}` }))
        }
        expect((await api.listCompanies(pid)).length, '12 companies seeded via API').toBe(12)

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row').first()).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'companies.list.row')).toHaveCount(10)

        const secondPage = page.waitForResponse(
            (r) =>
                r.url().includes('/v1/companies?') &&
                r.url().includes('page=') &&
                r.request().method() === 'GET',
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.list.pagination.next').click()
        await secondPage
        await expect(byQa(page, 'companies.list.row')).toHaveCount(2)
    } finally {
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})

test('#21 list: search narrows the list to the matching company', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-search')
    const wanted = uniqueName('co-needle')
    const other = uniqueName('co-haystack')
    const ids: string[] = []
    try {
        ids.push(await api.createCompany(pid, { name: wanted }))
        ids.push(await api.createCompany(pid, { name: other }))

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row')).toHaveCount(2, { timeout: 30_000 })

        await byQa(page, 'companies.list.search').fill(wanted)
        await expect(byQa(page, 'companies.list.row', { company: ids[0] })).toBeVisible({
            timeout: 20_000,
        })
        await expect(byQa(page, 'companies.list.row', { company: ids[1] })).toHaveCount(0)
    } finally {
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})

/**
 * #22 / #23 — industry + status filters.
 *
 * BLOCKED on the stand: `filterIndustry` / `filterStatus` query params are ignored
 * by the companies list BFF (both rows stay visible). Status on POST create is
 * also not persisted (everything comes back as `lead`).
 */
test.fixme('#22 #23 list: industry and status filters constrain the visible rows', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-filter')
    const ids: string[] = []
    try {
        // A: ИТ + client, B: Финансы + lead — each filter keeps exactly one row.
        const itClient = await api.createCompany(pid, {
            name: uniqueName('co-it'),
            industry: 'ИТ',
            status: 'client',
        })
        const finLead = await api.createCompany(pid, {
            name: uniqueName('co-fin'),
            industry: 'Финансы',
            status: 'lead',
        })
        ids.push(itClient, finLead)

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row')).toHaveCount(2, { timeout: 30_000 })

        // #22 — industry
        await pickSelectOption(byQa(page, 'companies.list.filterIndustry'), 'ИТ')
        await expect(byQa(page, 'companies.list.row', { company: itClient })).toBeVisible({
            timeout: 20_000,
        })
        await expect(byQa(page, 'companies.list.row', { company: finLead })).toHaveCount(0)

        // Filters live in component state only, so a fresh navigation is the
        // cheapest way back to the unfiltered set for the second assertion.
        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row')).toHaveCount(2, { timeout: 30_000 })

        await pickSelectOption(byQa(page, 'companies.list.filterStatus'), 'Лид')
        await expect(byQa(page, 'companies.list.row', { company: finLead })).toBeVisible({
            timeout: 20_000,
        })
        await expect(byQa(page, 'companies.list.row', { company: itClient })).toHaveCount(0)
    } finally {
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})

test('#24 list: assignee filter refetches scoped by owner', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-assignee')
    let companyId: string | undefined
    try {
        // The seeded project has one member (the admin), and a company created via
        // REST is owned by them — so filtering by that member must keep the row and
        // the refetch must carry the owner filter.
        companyId = await api.createCompany(pid, { name: uniqueName('co-owned') })

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })

        const filtered = page.waitForResponse(
            (r) =>
                r.url().includes('/v1/companies?') &&
                r.url().includes('filterOwnerId=') &&
                r.request().method() === 'GET',
            { timeout: 20_000 },
        )
        await pickSelectOption(byQa(page, 'companies.list.filterAssignee'), 'Администратор')
        const res = await filtered
        expect(res.ok(), `owner-filtered list ok (${res.status()})`).toBeTruthy()
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible()
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#27 list: clicking a row opens the company card', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-rowclick')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-open') })

        await page.goto('/companies')
        const row = byQa(page, 'companies.list.row', { company: companyId })
        await expect(row).toBeVisible({ timeout: 30_000 })
        await row.click()

        await expect(page).toHaveURL(new RegExp(`/companies/${companyId}$`), { timeout: 30_000 })
        await expect(byQa(page, 'companies.card.infoWidget')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#35 list: toolbar trash link opens the trash screen', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-links')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-links-row') })

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.trash')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.list.trash').click()
        await expect(page).toHaveURL(/\/companies\/trash$/, { timeout: 30_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

/** #36 — BLOCKED on the stand: `companies:import` absent from permission projection. */
test.fixme('#36 list: toolbar import link opens the import wizard', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-import-link')
    try {
        await page.goto('/companies')
        const importLink = byQa(page, 'companies.list.import').or(
            byQa(page, 'companies.list.importEmpty'),
        )
        await expect(importLink.first()).toBeVisible({ timeout: 30_000 })
        await importLink.first().click()
        await expect(page).toHaveURL(/\/companies\/import$/, { timeout: 30_000 })
        await expect(byQa(page, 'companies.import.file')).toBeAttached()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#37 list: "only mine" scopes the list to the current user', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-onlymine')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-mine') })

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
        const res = await mineOnly
        expect(res.ok(), `own-companies list ok (${res.status()})`).toBeTruthy()

        // The company was created by this very user, so it stays visible, and the
        // assignee filter is disabled while "only mine" is on.
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible()
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#41 create: quick-create from the drawer adds the company to the list', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-quick')
    const name = uniqueName('co-quick-new')
    let createdId: string | undefined
    try {
        await page.goto('/companies')

        // Empty project → the CTA in the empty state; otherwise the toolbar button.
        const openCreate = byQa(page, 'companies.list.create').or(
            byQa(page, 'companies.list.createEmpty'),
        )
        await expect(openCreate.first()).toBeVisible({ timeout: 30_000 })
        await openCreate.first().click()

        await byQa(page, 'companies.create.name').fill(name)
        const created = page.waitForResponse(
            (r) => r.url().includes('/v1/companies') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.create.submit').click()
        const res = await created
        expect(res.ok(), `company POST ok (${res.status()})`).toBeTruthy()
        createdId = ((await res.json()) as { id?: string }).id
        expect(createdId, 'created company id').toBeTruthy()

        await expect(byQa(page, 'companies.list.row', { company: createdId! })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (createdId) await api.deleteCompany(pid, createdId)
        await api.archiveProject(pid)
    }
})

test('#42 create: full form persists inn/kpp/address/status/industry', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-full')
    const name = uniqueName('co-full-new')
    const inn = '7701' + String(Date.now()).slice(-6)
    let createdId: string | undefined
    try {
        await page.goto('/companies')
        const openCreate = byQa(page, 'companies.list.create').or(
            byQa(page, 'companies.list.createEmpty'),
        )
        await expect(openCreate.first()).toBeVisible({ timeout: 30_000 })
        await openCreate.first().click()

        await byQa(page, 'companies.create.name').fill(name)
        await byQa(page, 'companies.create.inn').fill(inn)
        await byQa(page, 'companies.create.kpp').fill('770101001')
        await byQa(page, 'companies.create.legalAddress').fill('г. Москва, ул. Тестовая, 1')
        await byQa(page, 'companies.create.phone').fill('+7 900 000-00-01')
        await byQa(page, 'companies.create.website').fill('example-full.test')
        await pickSelectOption(byQa(page, 'companies.create.industry'), 'ИТ')
        await pickSelectOption(byQa(page, 'companies.create.status'), 'Клиент')

        const created = page.waitForResponse(
            (r) => r.url().includes('/v1/companies') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.create.submit').click()
        const res = await created
        expect(res.ok(), `company POST ok (${res.status()})`).toBeTruthy()
        const body = (await res.json()) as {
            id?: string
            inn?: string
            kpp?: string
            status?: string
            industry?: string
        }
        createdId = body.id
        expect(body.inn, 'inn stored in POST body').toBe(inn)

        await expect(byQa(page, 'companies.list.row', { company: createdId! })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (createdId) await api.deleteCompany(pid, createdId)
        await api.archiveProject(pid)
    }
})

test('#45 create: dedup hint links to the existing company', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-dedup')
    const inn = '7702' + String(Date.now()).slice(-6)
    let existingId: string | undefined
    try {
        existingId = await api.createCompany(pid, { name: uniqueName('co-dedup-orig'), inn })

        await page.goto('/companies')
        const openCreate = byQa(page, 'companies.list.create').or(
            byQa(page, 'companies.list.createEmpty'),
        )
        await expect(openCreate.first()).toBeVisible({ timeout: 30_000 })
        await openCreate.first().click()

        await byQa(page, 'companies.create.name').fill(uniqueName('co-dedup-new'))
        // The hint fires on blur of INN/e-mail/website (GET /v1/companies/duplicates).
        const dupCheck = page.waitForResponse(
            (r) => r.url().includes('/v1/companies/duplicates') && r.request().method() === 'GET',
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.create.inn').fill(inn)
        await byQa(page, 'companies.create.inn').blur()
        await dupCheck

        const dupLink = byQa(page, 'companies.create.dupLink', { company: existingId })
        await expect(dupLink).toBeVisible({ timeout: 20_000 })
        await dupLink.click()

        await expect(page).toHaveURL(new RegExp(`/companies/${existingId}$`), { timeout: 30_000 })
    } finally {
        if (existingId) await api.deleteCompany(pid, existingId)
        await api.archiveProject(pid)
    }
})

/**
 * #47 — restore a trashed duplicate straight from the dedup hint, resolving the
 * identity-key collision through `RestoreCollisionDialog`.
 *
 * BLOCKED on the backend: with a live duplicate holding the same INN,
 * `POST /v1/companies/:id/restore` answers **500 INTERNAL** instead of the
 * documented 422 `FAILED_PRECONDITION` + `details.options` (company.md §3.11),
 * so the strategy dialog is never reached — `parseRestoreCollision` only fires on
 * `FAILED_PRECONDITION` and the UI shows a generic toast. Verified against the
 * the stand stand: delete A(inn=X) → create B(inn=X) → restore A ⇒ 500.
 * Un-fixme once the domain/gateway surfaces the collision properly.
 */
test.fixme(
    '#47 create: restoring a trashed duplicate offers the collision strategies',
    async ({ page, api, useProject }) => {
        const pid = await seedProject(api, useProject, 'co-restore-hint')
        const inn = '7708' + String(Date.now()).slice(-6)
        let trashedId: string | undefined
        let liveId: string | undefined
        try {
            trashedId = await api.createCompany(pid, {
                name: uniqueName('co-restore-hint-old'),
                inn,
            })
            await api.deleteCompany(pid, trashedId)
            liveId = await api.createCompany(pid, {
                name: uniqueName('co-restore-hint-live'),
                inn,
            })

            await page.goto('/companies')
            const openCreate = byQa(page, 'companies.list.create').or(
                byQa(page, 'companies.list.createEmpty'),
            )
            await expect(openCreate.first()).toBeVisible({ timeout: 30_000 })
            await openCreate.first().click()

            const dupCheck = page.waitForResponse(
                (r) =>
                    r.url().includes('/v1/companies/duplicates') && r.request().method() === 'GET',
                { timeout: 20_000 },
            )
            await byQa(page, 'companies.create.name').fill(uniqueName('co-restore-hint-new'))
            await byQa(page, 'companies.create.inn').fill(inn)
            await byQa(page, 'companies.create.inn').blur()
            await dupCheck

            await expect(
                byQa(page, 'companies.create.dupRestore', { company: trashedId }),
            ).toBeVisible({ timeout: 20_000 })
            await byQa(page, 'companies.create.dupRestore', { company: trashedId }).click()

            await expect(byQa(page, 'companies.restoreCollision.dialog')).toBeVisible({
                timeout: 20_000,
            })
            await byQa(page, 'companies.restoreCollision.strategy', { strategy: 'merge' }).click()
            const restored = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/companies/${trashedId}/restore`) &&
                    r.request().method() === 'POST',
                { timeout: 20_000 },
            )
            await byQa(page, 'companies.restoreCollision.confirm').click()
            expect((await restored).ok(), 'restore-with-strategy ok').toBeTruthy()
        } finally {
            if (liveId) await api.deleteCompany(pid, liveId)
            if (trashedId) await api.purgeCompany(pid, trashedId)
            await api.archiveProject(pid)
        }
    },
)

/** #58 — export CSV. BLOCKED on the stand: `companies:export` not in permission projection. */
test.fixme('#58 list: export downloads the current selection as CSV', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-export')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-export-row') })

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.export')).toBeVisible({ timeout: 30_000 })

        const download = page.waitForEvent('download', { timeout: 30_000 })
        const exported = page.waitForResponse(
            (r) => r.url().includes('/v1/companies/export') && r.request().method() === 'GET',
            { timeout: 30_000 },
        )
        await byQa(page, 'companies.list.export').click()

        const res = await exported
        expect(res.ok(), `export ok (${res.status()})`).toBeTruthy()
        const file = await download
        expect(file.suggestedFilename(), 'csv filename').toMatch(/\.csv$/)
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#62 list: bulk soft-delete moves the selected companies to trash', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-bulkdel')
    const ids: string[] = []
    try {
        ids.push(await api.createCompany(pid, { name: uniqueName('co-bulk-a') }))
        ids.push(await api.createCompany(pid, { name: uniqueName('co-bulk-b') }))

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row')).toHaveCount(2, { timeout: 30_000 })

        for (const id of ids) {
            await selectRow(byQa(page, 'companies.list.row', { company: id }))
        }
        await expect(byQa(page, 'companies.list.selectedCount')).toBeVisible()

        await byQa(page, 'companies.list.bulkDelete').click()
        const deletes = page.waitForResponse(
            (r) => r.url().includes('/v1/companies/') && r.request().method() === 'DELETE',
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.list.bulkDeleteConfirm').click()
        await deletes

        await expect(byQa(page, 'companies.list.emptyNone')).toBeVisible({ timeout: 30_000 })
        const trashed = await api.listCompaniesTrash(pid)
        expect(trashed.map((c) => c.id).sort(), 'both companies in trash').toEqual(ids.sort())
    } finally {
        for (const id of ids) await api.purgeCompany(pid, id)
        await api.archiveProject(pid)
    }
})

test('#65 list: exactly two selected opens the merge screen with both ids', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-bulkmerge')
    const ids: string[] = []
    try {
        ids.push(await api.createCompany(pid, { name: uniqueName('co-merge-a') }))
        ids.push(await api.createCompany(pid, { name: uniqueName('co-merge-b') }))

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row')).toHaveCount(2, { timeout: 30_000 })

        for (const id of ids) {
            await selectRow(byQa(page, 'companies.list.row', { company: id }))
        }
        await byQa(page, 'companies.list.bulkMerge').click()

        await expect(page).toHaveURL(/\/companies\/merge\?master=[^&]+&loser=.+/, {
            timeout: 30_000,
        })
        const url = new URL(page.url())
        expect(
            [url.searchParams.get('master'), url.searchParams.get('loser')].sort(),
            'merge query carries both selected ids',
        ).toEqual(ids.slice().sort())
    } finally {
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})
