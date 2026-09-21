import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { pickSelectOption } from '../support/ui'

/**
 * Companies — SCR-COMPANIES-EDIT + SCR-COMPANIES-TRASH
 * (catalog `.e2e-scenario-catalog/companies.md`).
 *
 * P0: the full edit path (#109), status/industry/tags/notes persistence (#115),
 * the trash screen (#120), restore from trash (#125) and the collision
 * strategies (#126).
 */

test.use({ forbiddenAllow: ['/v1/activities', '/v1/documents', '/v1/notifications'] })

const MODULES = ['companies', 'contacts', 'deals']

test('#109 edit: form loads from the API, saves and returns to the card', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-edit'), MODULES)
    await useProject(pid, MODULES)
    let companyId: string | undefined
    try {
        const original = uniqueName('co-edit-before')
        companyId = await api.createCompany(pid, {
            name: original,
            inn: '7704' + String(Date.now()).slice(-6),
        })

        await page.goto(`/companies/${companyId}/edit`)
        // Loaded from GET /v1/companies/:id — the field must hold the seeded name,
        // not an empty form.
        await expect(byQa(page, 'companies.edit.name')).toHaveValue(original, { timeout: 30_000 })

        const renamed = uniqueName('co-edit-after')
        await byQa(page, 'companies.edit.name').fill(renamed)
        await byQa(page, 'companies.edit.phone').fill('+7 900 000-00-04')
        await byQa(page, 'companies.edit.legalAddress').fill('г. Москва, ул. Правленая, 2')

        const saved = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/companies/${companyId}`) && r.request().method() === 'PUT',
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.edit.save').click()
        const res = await saved
        expect(res.ok(), `PUT ok (${res.status()})`).toBeTruthy()

        await expect(page).toHaveURL(new RegExp(`/companies/${companyId}$`), { timeout: 30_000 })
        await expect(byQa(page, 'companies.card.name', { company: companyId })).toContainText(
            renamed,
            { timeout: 20_000 },
        )
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

/**
 * #115 — status/industry/tags/notes on edit.
 *
 * BLOCKED on the stand: `notes` (and possibly `tags`) are not returned on GET after
 * PUT — the form reloads with empty `companies.edit.notes`.
 */
test.fixme('#115 edit: status, industry, tags and notes are persisted', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-edit2'), MODULES)
    await useProject(pid, MODULES)
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, {
            name: uniqueName('co-edit2-co'),
            status: 'lead',
        })

        await page.goto(`/companies/${companyId}/edit`)
        await expect(byQa(page, 'companies.edit.name')).toBeVisible({ timeout: 30_000 })

        await pickSelectOption(byQa(page, 'companies.edit.status'), 'Партнёр')
        await pickSelectOption(byQa(page, 'companies.edit.industry'), 'ИТ')
        await byQa(page, 'companies.edit.tags').fill('vip, тест')
        await byQa(page, 'companies.edit.notes').fill('Заметка из e2e')

        const saved = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/companies/${companyId}`) && r.request().method() === 'PUT',
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.edit.save').click()
        expect((await saved).ok(), 'PUT ok').toBeTruthy()

        // Re-open the form: values must come back from the server, not from
        // component state left over after the save.
        await page.goto(`/companies/${companyId}/edit`)
        await expect(byQa(page, 'companies.edit.notes')).toHaveValue('Заметка из e2e', {
            timeout: 30_000,
        })
        await expect(byQa(page, 'companies.edit.tags')).toHaveValue(/vip/)
        await expect(byQa(page, 'companies.edit.status')).toContainText('Партнёр')
        await expect(byQa(page, 'companies.edit.industry')).toContainText('ИТ')
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

/**
 * #120 — trash list pagination.
 *
 * BLOCKED on the stand: same broken `total` field as #20 on `GET /v1/companies/trash`.
 */
test.fixme('#120 trash: lists the soft-deleted companies with pagination', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-trash'), MODULES)
    await useProject(pid, MODULES)
    const ids: string[] = []
    try {
        // 11 trashed rows: page 1 is full at the default pageSize of 10.
        for (let i = 0; i < 11; i++) {
            const id = await api.createCompany(pid, { name: `${uniqueName('co-trash')}-${i}` })
            await api.deleteCompany(pid, id)
            ids.push(id)
        }

        await page.goto('/companies/trash')
        await expect(byQa(page, 'companies.trash.row').first()).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'companies.trash.row')).toHaveCount(10)

        const secondPage = page.waitForResponse(
            (r) => r.url().includes('/v1/companies/trash') && r.request().method() === 'GET',
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.trash.pagination.next').click()
        await secondPage
        await expect(byQa(page, 'companies.trash.row')).toHaveCount(1)
    } finally {
        for (const id of ids) await api.purgeCompany(pid, id)
        await api.archiveProject(pid)
    }
})

test('#125 trash: restore without a collision returns the company to the list', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-trash-restore'), MODULES)
    await useProject(pid, MODULES)
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-trash-restore-co') })
        await api.deleteCompany(pid, companyId)

        await page.goto('/companies/trash')
        await expect(byQa(page, 'companies.trash.row', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })

        const restored = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/companies/${companyId}/restore`) &&
                r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.trash.restore', { company: companyId }).click()
        const res = await restored
        expect(res.ok(), `restore ok (${res.status()})`).toBeTruthy()

        await expect(byQa(page, 'companies.trash.row', { company: companyId })).toHaveCount(0, {
            timeout: 20_000,
        })
        const live = await api.listCompanies(pid)
        expect(live.map((c) => c.id), 'company is live again').toContain(companyId)
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

/**
 * #126 — restoring from the trash into an identity-key collision must offer all
 * three strategies (`merge` / `clear_key` / `as_new`) in
 * `companies.restoreCollision.dialog`.
 *
 * BLOCKED on the backend, same root cause as #47/#89: with a live company on the
 * same INN, `POST /v1/companies/:id/restore` answers **500 INTERNAL** instead of
 * 422 `FAILED_PRECONDITION` with `details.options` (company.md §3.11). The UI
 * needs that code to open the dialog (`parseRestoreCollision`), so the screen
 * can only show a generic error toast today. Verified on the stand.
 */
test.fixme('#126 trash: restore collision offers all three strategies', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-trash-col'), MODULES)
    await useProject(pid, MODULES)
    const inn = '7710' + String(Date.now()).slice(-6)
    let trashedId: string | undefined
    let liveId: string | undefined
    try {
        trashedId = await api.createCompany(pid, {
            name: uniqueName('co-trash-col-old'),
            inn,
        })
        await api.deleteCompany(pid, trashedId)
        liveId = await api.createCompany(pid, { name: uniqueName('co-trash-col-live'), inn })

        await page.goto('/companies/trash')
        await expect(byQa(page, 'companies.trash.row', { company: trashedId })).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'companies.trash.restore', { company: trashedId }).click()

        await expect(byQa(page, 'companies.restoreCollision.dialog')).toBeVisible({
            timeout: 20_000,
        })
        await expect(
            byQa(page, 'companies.restoreCollision.strategy', { strategy: 'merge' }),
        ).toBeVisible()
        await expect(
            byQa(page, 'companies.restoreCollision.strategy', { strategy: 'clear_key' }),
        ).toBeVisible()
        await expect(
            byQa(page, 'companies.restoreCollision.strategy', { strategy: 'as_new' }),
        ).toBeVisible()
    } finally {
        if (liveId) await api.deleteCompany(pid, liveId)
        if (trashedId) await api.purgeCompany(pid, trashedId)
        await api.archiveProject(pid)
    }
})
