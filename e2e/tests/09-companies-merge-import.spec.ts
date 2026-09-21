import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { pickRadio, pickSelectOption } from '../support/ui'

/**
 * Companies — global create + SCR-COMPANIES-MERGE + SCR-COMPANIES-IMPORT
 * (catalog `.e2e-scenario-catalog/companies.md`).
 *
 * P0: header "+" quick create (#52), merge happy path (#132), per-field conflict
 * resolution (#137), the merge confirm dialog (#138) and the import wizard
 * (#146, #148).
 */

test.use({ forbiddenAllow: ['/v1/activities', '/v1/documents', '/v1/notifications'] })

const MODULES = ['companies', 'contacts', 'deals']

/**
 * #52 — global header «+» → company.
 *
 * BLOCKED on the stand: `GET /v1/platform/modules` returns module cards without
 * `drawerEntities[]`, so `useDrawerEntities()` is empty and `CreateDropdown`
 * renders nothing (no `host.globalCreate.trigger`).
 */
test.fixme('#52 global create: header "+" → company → card of the new company', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-globalcreate'), MODULES)
    await useProject(pid, MODULES)
    const name = uniqueName('co-global-new')
    let createdId: string | undefined
    try {
        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.globalCreate.trigger')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'host.globalCreate.trigger').click()
        await byQa(page, 'host.globalCreate.item', { entity: 'company' }).click()

        await byQa(page, 'host.globalCreate.companyName').fill(name)
        const created = page.waitForResponse(
            (r) => r.url().includes('/v1/companies') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'host.globalCreate.submit', { entity: 'company' }).click()
        const res = await created
        expect(res.ok(), `company POST ok (${res.status()})`).toBeTruthy()
        createdId = ((await res.json()) as { id?: string }).id
        expect(createdId, 'created company id').toBeTruthy()

        await expect(page).toHaveURL(new RegExp(`/companies/${createdId}$`), { timeout: 30_000 })
        await expect(byQa(page, 'companies.card.name', { company: createdId! })).toContainText(name)
    } finally {
        if (createdId) await api.deleteCompany(pid, createdId)
        await api.archiveProject(pid)
    }
})

/**
 * #132 / #138 — merge happy path + confirm dialog.
 *
 * BLOCKED on the stand: merge preview reports 0 contacts on the loser even when
 * a contact is linked (`companies.merge.relationCount[contacts]` shows «0»).
 */
test.fixme('#132 #138 merge: preview and relation counts, confirm, master card', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-merge'), MODULES)
    await useProject(pid, MODULES)
    const ids: string[] = []
    try {
        const master = await api.createCompany(pid, { name: uniqueName('co-merge-master') })
        const loser = await api.createCompany(pid, { name: uniqueName('co-merge-loser') })
        ids.push(master, loser)
        // Links on the loser are what the relation counters must report.
        const contactId = await api.createContact(pid, {
            firstName: 'Слияние',
            lastName: uniqueName('Контакт'),
            companyId: loser,
        })
        await api.createDeal(pid, {
            name: uniqueName('co-merge-deal'),
            amount: 100,
            companyId: loser,
        })

        await page.goto(`/companies/merge?master=${master}&loser=${loser}`)
        await expect(byQa(page, 'companies.merge.master', { company: master })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'companies.merge.loser', { company: loser })).toBeVisible()
        await expect(byQa(page, 'companies.merge.preview')).toBeVisible({ timeout: 20_000 })
        await expect(byQa(page, 'companies.merge.relationCount', { relation: 'contacts' })).toContainText(
            '1',
        )
        await expect(byQa(page, 'companies.merge.relationCount', { relation: 'deals' })).toContainText(
            '1',
        )

        // #138 — confirm dialog gates the merge.
        await byQa(page, 'companies.merge.submit').click()
        await expect(byQa(page, 'companies.merge.confirmDialog')).toBeVisible()
        const merged = page.waitForResponse(
            (r) => r.url().includes('/v1/companies/merge') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.merge.confirmSubmit').click()
        const res = await merged
        expect(res.ok(), `merge ok (${res.status()})`).toBeTruthy()

        await expect(page).toHaveURL(new RegExp(`/companies/${master}$`), { timeout: 30_000 })
        // The loser's contact now hangs off the master card.
        await expect(byQa(page, 'companies.card.contactRow', { contact: contactId })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        // The loser is gone after a successful merge; deleting it is a no-op then.
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})

test('#137 merge: a field conflict can be resolved in favour of the loser', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-merge-conflict'), MODULES)
    await useProject(pid, MODULES)
    const ids: string[] = []
    try {
        // Both carry a phone, so `phone` comes back as a field conflict.
        const master = await api.createCompany(pid, {
            name: uniqueName('co-conflict-master'),
            phone: '+7 900 000-00-11',
        })
        const loser = await api.createCompany(pid, {
            name: uniqueName('co-conflict-loser'),
            phone: '+7 900 000-00-22',
        })
        ids.push(master, loser)

        await page.goto(`/companies/merge?master=${master}&loser=${loser}`)
        const conflict = byQa(page, 'companies.merge.conflict', { field: 'phone' })
        await expect(conflict).toBeVisible({ timeout: 30_000 })

        await pickRadio(byQa(page, 'companies.merge.conflictLoser', { field: 'phone' }))
        await byQa(page, 'companies.merge.submit').click()

        const merged = page.waitForResponse(
            (r) => r.url().includes('/v1/companies/merge') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.merge.confirmSubmit').click()
        const req = (await merged).request()
        // The chosen side must reach the domain — a UI-only decision would merge
        // the record while silently keeping the master value.
        expect(
            (req.postDataJSON() as { fieldDecisions?: Record<string, string> })?.fieldDecisions
                ?.phone,
            'phone decision sent as loser',
        ).toBe('loser')

        await expect(page).toHaveURL(new RegExp(`/companies/${master}$`), { timeout: 30_000 })
        await expect(byQa(page, 'companies.card.phone')).toContainText('00-22', { timeout: 20_000 })
    } finally {
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})

/** #148 — BLOCKED on the stand: same `companies:import` permission gap as #36. */
test.fixme('#148 import: step 2 maps the columns and picks the dedup mode', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-import-map'), MODULES)
    await useProject(pid, MODULES)
    try {
        await page.goto('/companies/import')
        await expect(byQa(page, 'companies.import.file')).toBeAttached({ timeout: 30_000 })

        // The input is visually hidden behind its label; setInputFiles works anyway.
        await byQa(page, 'companies.import.file').setInputFiles({
            name: 'companies.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(
                'name,inn,phone\n' +
                    `${uniqueName('Импорт ООО')},7705123456,+7 900 000-01-01\n` +
                    `${uniqueName('Импорт АО')},7705123457,+7 900 000-01-02\n`,
                'utf-8',
            ),
        })
        await byQa(page, 'companies.import.next', { step: 1 }).click()

        // Step 2: map `name` to the first column and switch dedup to "skip".
        await expect(byQa(page, 'companies.import.mapping', { field: 'name' })).toBeVisible({
            timeout: 20_000,
        })
        await pickSelectOption(byQa(page, 'companies.import.mapping', { field: 'name' }), 'name')
        await pickSelectOption(byQa(page, 'companies.import.dedupMode'), 'Пропускать дубли')
        await byQa(page, 'companies.import.next', { step: 2 }).click()

        // Step 3 shows the parsed preview of the file we just mapped.
        await expect(byQa(page, 'companies.import.preview')).toBeVisible({ timeout: 20_000 })
        await expect(byQa(page, 'companies.import.submit')).toBeVisible()
    } finally {
        await api.purgeAllCompanies(pid)
        await api.archiveProject(pid)
    }
})

/**
 * #146 — import happy path (CSV → mapping → preview → import → report → "Done" →
 * back to the list).
 *
 * BLOCKED on a frontend/backend contract mismatch: `apiImportCompanies`
 * (host/src/services/CrmService.ts) posts **multipart/form-data** with a `file`
 * part, while the gateway's `POST /v1/companies/import` handler reads a JSON body
 * (`fileContent`, `mappingJson`, `dedupMode`). The stand answers **500** to the
 * multipart request, so the wizard can never leave step 3. Everything up to the
 * import call is covered by #148 above; un-fixme once the two sides agree on one
 * body format (contract company.md §3 does not pin it down either).
 */
test.fixme('#146 import: CSV import reports created rows and returns to the list', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-import-full'), MODULES)
    await useProject(pid, MODULES)
    try {
        await page.goto('/companies/import')
        await expect(byQa(page, 'companies.import.file')).toBeAttached({ timeout: 30_000 })

        await byQa(page, 'companies.import.file').setInputFiles({
            name: 'companies.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(
                'name,inn,phone\n' +
                    `${uniqueName('Импорт ООО')},7706123456,+7 900 000-02-01\n` +
                    `${uniqueName('Импорт АО')},7706123457,+7 900 000-02-02\n`,
                'utf-8',
            ),
        })
        await byQa(page, 'companies.import.next', { step: 1 }).click()
        await expect(byQa(page, 'companies.import.mapping', { field: 'name' })).toBeVisible({
            timeout: 20_000,
        })
        await pickSelectOption(byQa(page, 'companies.import.mapping', { field: 'name' }), 'name')
        await byQa(page, 'companies.import.next', { step: 2 }).click()
        await expect(byQa(page, 'companies.import.preview')).toBeVisible({ timeout: 20_000 })

        const imported = page.waitForResponse(
            (r) => r.url().includes('/v1/companies/import') && r.request().method() === 'POST',
            { timeout: 30_000 },
        )
        await byQa(page, 'companies.import.submit').click()
        expect((await imported).ok(), 'import POST ok').toBeTruthy()

        await expect(byQa(page, 'companies.import.result')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'companies.import.resultCreated')).toBeVisible()
        await byQa(page, 'companies.import.done').click()
        await expect(page).toHaveURL(/\/companies$/, { timeout: 30_000 })
    } finally {
        await api.purgeAllCompanies(pid)
        await api.archiveProject(pid)
    }
})
