import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'

/**
 * Companies — SCR-COMPANIES-CARD (catalog `.e2e-scenario-catalog/companies.md`).
 *
 * P0 card scenarios: header (#68), composite widgets (#69), edit entry (#79),
 * soft-delete (#85), restore (#88, #89), the merge picker (#96), adding a contact
 * from the card (#100) and cross-module navigation to contact / deal / order
 * (#102–#104).
 */

// The card composite pulls activities/documents/notifications panels; those
// modules stay off in these projects, and the gateway answers their GETs with
// 403 by module policy — expected, unlike a 403 on the companies path itself.
test.use({ forbiddenAllow: ['/v1/activities', '/v1/documents', '/v1/notifications'] })

const MODULES = ['companies', 'contacts', 'deals', 'orders']

test('#68 card: header shows name, inn, phone and e-mail', async ({ page, api, useProject }) => {
    const pid = await api.createProject(uniqueName('co-card'), MODULES)
    await useProject(pid, MODULES)
    let companyId: string | undefined
    try {
        const name = uniqueName('co-card-hdr')
        companyId = await api.createCompany(pid, {
            name,
            inn: '7703' + String(Date.now()).slice(-6),
            phone: '+7 900 000-00-02',
            email: 'card@example.test',
        })

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.name', { company: companyId })).toContainText(name, {
            timeout: 30_000,
        })
        await expect(byQa(page, 'companies.card.inn')).toBeVisible()
        await expect(byQa(page, 'companies.card.phone')).toBeVisible()
        await expect(byQa(page, 'companies.card.email')).toBeVisible()
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

/**
 * #69 — composite `/card` widgets.
 *
 * BLOCKED on the stand: `GET /v1/companies/:id/card` returns `contacts: []` even
 * when a contact was created with `companyId` + `companyIds[]` (deals/orders
 * widgets do populate). Contact row assertion cannot pass until the BFF links
 * contacts on the card composite.
 */
test.fixme('#69 card: composite renders contacts, deals, orders, history widgets', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-composite'), MODULES)
    await useProject(pid, MODULES)
    let companyId: string | undefined
    let contactId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-composite-co') })
        contactId = await api.createContact(pid, {
            firstName: 'Композит',
            lastName: uniqueName('Контакт'),
            companyId,
        })
        const dealId = await api.createDeal(pid, {
            name: uniqueName('co-composite-deal'),
            amount: 1000,
            companyId,
        })
        const orderTypeId = (await api.createOrderType(pid, uniqueName('co-composite-ot'))).id
        const orderId = await api.createOrder(pid, { orderTypeId, companyId, dealId, amount: 500 })

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.infoWidget')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'companies.card.requisitesWidget')).toBeVisible()
        await expect(byQa(page, 'companies.card.dealsWidget')).toBeVisible()
        await expect(byQa(page, 'companies.card.ordersWidget')).toBeVisible()
        await expect(byQa(page, 'companies.card.historyWidget')).toBeVisible()

        // The seeded links must actually show up — an empty widget would pass a
        // "widget is visible" check while the composite silently returned nothing.
        await expect(byQa(page, 'companies.card.contactRow', { contact: contactId })).toBeVisible({
            timeout: 20_000,
        })
        await expect(byQa(page, 'companies.card.dealRow', { deal: dealId })).toBeVisible()
        await expect(byQa(page, 'companies.card.orderRow', { order: orderId })).toBeVisible()
    } finally {
        if (contactId) await api.deleteContact(pid, contactId)
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#79 card: "edit" opens the edit form', async ({ page, api, useProject }) => {
    const pid = await api.createProject(uniqueName('co-editnav'), MODULES)
    await useProject(pid, MODULES)
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-editnav-co') })

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.edit')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.card.edit').click()

        await expect(page).toHaveURL(new RegExp(`/companies/${companyId}/edit$`), {
            timeout: 30_000,
        })
        await expect(byQa(page, 'companies.edit.name')).toBeVisible({ timeout: 20_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#85 card: soft-delete confirms, redirects to the list and fills the trash', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-carddel'), MODULES)
    await useProject(pid, MODULES)
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-carddel-co') })

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.delete')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.card.delete').click()
        await expect(byQa(page, 'companies.card.deleteDialog')).toBeVisible()

        const deleted = page.waitForResponse(
            (r) => r.url().includes(`/v1/companies/${companyId}`) && r.request().method() === 'DELETE',
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.card.deleteConfirm').click()
        const res = await deleted
        expect(res.ok(), `soft-delete ok (${res.status()})`).toBeTruthy()

        await expect(page).toHaveURL(/\/companies$/, { timeout: 30_000 })
        const trashed = await api.listCompaniesTrash(pid)
        expect(trashed.map((c) => c.id), 'company is in trash').toContain(companyId)
    } finally {
        if (companyId) await api.purgeCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

/**
 * #88 — restore from the card without collision.
 *
 * BLOCKED on the stand: soft-deleted company opened by id shows ST-9 «Компания не
 * найдена» instead of the trashed banner + restore action (GET by id masks trash).
 */
test.fixme('#88 card: restore without a collision clears the trashed banner', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-restore'), MODULES)
    await useProject(pid, MODULES)
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-restore-co') })
        await api.deleteCompany(pid, companyId)

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.trashedBanner')).toBeVisible({ timeout: 30_000 })

        const restored = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/companies/${companyId}/restore`) &&
                r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.card.restore').click()
        const res = await restored
        expect(res.ok(), `restore ok (${res.status()})`).toBeTruthy()

        await expect(byQa(page, 'companies.card.trashedBanner')).toHaveCount(0, { timeout: 20_000 })
        const live = await api.listCompanies(pid)
        expect(live.map((c) => c.id), 'company is live again').toContain(companyId)
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

/**
 * #89 — restore from the card WITH an identity-key collision must open
 * `RestoreCollisionDialog` and let the user pick `merge`.
 *
 * BLOCKED on the backend: `POST /v1/companies/:id/restore` answers **500
 * INTERNAL** when a live company holds the same INN, instead of the documented
 * 422 `FAILED_PRECONDITION` + `details.options` (company.md §3.11). The UI's
 * `parseRestoreCollision` only recognises `FAILED_PRECONDITION`, so the dialog
 * never opens and the card shows a generic toast. Reproduced on the stand:
 * create A(inn=X) → delete A → create B(inn=X) → restore A ⇒ 500.
 */
test.fixme('#89 card: restore collision offers the merge strategy', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-restore-col'), MODULES)
    await useProject(pid, MODULES)
    const inn = '7709' + String(Date.now()).slice(-6)
    let trashedId: string | undefined
    let liveId: string | undefined
    try {
        trashedId = await api.createCompany(pid, {
            name: uniqueName('co-restore-col-old'),
            inn,
        })
        await api.deleteCompany(pid, trashedId)
        liveId = await api.createCompany(pid, { name: uniqueName('co-restore-col-live'), inn })

        await page.goto(`/companies/${trashedId}`)
        await expect(byQa(page, 'companies.card.trashedBanner')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.card.restore').click()

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
        expect((await restored).ok(), 'restore-with-merge ok').toBeTruthy()
    } finally {
        if (liveId) await api.deleteCompany(pid, liveId)
        if (trashedId) await api.purgeCompany(pid, trashedId)
        await api.archiveProject(pid)
    }
})

/**
 * #96 — merge duplicate picker.
 *
 * BLOCKED on the stand: duplicate search in the picker does not surface the seeded
 * loser (`companies.card.mergeCandidate` never appears for a same-stem pair).
 */
test.fixme('#96 card: "merge duplicate" picks a loser and opens the merge screen', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-mergepick'), MODULES)
    await useProject(pid, MODULES)
    const ids: string[] = []
    try {
        // Same name stem so the picker's search finds the duplicate.
        const stem = uniqueName('co-dup')
        ids.push(await api.createCompany(pid, { name: `${stem} master` }))
        ids.push(await api.createCompany(pid, { name: `${stem} loser` }))

        await page.goto(`/companies/${ids[0]}`)
        await expect(byQa(page, 'companies.card.merge')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.card.merge').click()
        await expect(byQa(page, 'companies.card.mergePickerDialog')).toBeVisible()

        const candidate = byQa(page, 'companies.card.mergeCandidate', { company: ids[1] })
        await expect(candidate).toBeVisible({ timeout: 20_000 })
        await candidate.click()

        await expect(page).toHaveURL(
            new RegExp(`/companies/merge\\?master=${ids[0]}&loser=${ids[1]}`),
            { timeout: 30_000 },
        )
    } finally {
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})

/**
 * #100 — add contact from the card via host drawer.
 *
 * BLOCKED on the stand: after a successful contact POST the company `/card`
 * composite still returns `contacts: []`, so `companies.card.contactRow` never
 * appears on reload (same root cause as #69).
 */
test.fixme('#100 card: "add contact" creates a contact attached to the company', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-addcontact'), MODULES)
    await useProject(pid, MODULES)
    let companyId: string | undefined
    let contactId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-addcontact-co') })

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.addContact')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.card.addContact').click()

        // Host `EntityCreateDrawer` (bundled into the remote through the `@` →
        // host/src alias), pre-filled with this company. Phone is required by
        // `canSubmit()` for a contact, so fill it too or the button stays disabled.
        await byQa(page, 'host.globalCreate.contactFirstName').fill('Карточный')
        await byQa(page, 'host.globalCreate.contactLastName').fill(uniqueName('Контакт'))
        await byQa(page, 'host.globalCreate.contactPhone').fill('+7 900 000-00-03')
        const created = page.waitForResponse(
            (r) => r.url().includes('/v1/contacts') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'host.globalCreate.submit', { entity: 'contact' }).click()
        const res = await created
        expect(res.ok(), `contact POST ok (${res.status()})`).toBeTruthy()
        contactId = ((await res.json()) as { id?: string }).id

        // The drawer navigates to the new contact; the link is what matters, so
        // check it from the company card the contact was created from.
        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.contactRow', { contact: contactId! })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (contactId) await api.deleteContact(pid, contactId)
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

/**
 * #102 / #103 / #104 — cross-nav from card widgets.
 *
 * BLOCKED on the stand for #102 (contact row): card composite omits linked contacts.
 * Deal (#103) and order (#104) rows are covered indirectly when #69 unblocks;
 * until then the contact click at the start of this test cannot run.
 */
test.fixme('#102 #103 #104 card: rows navigate to the linked contact, deal and order', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('co-crossnav'), MODULES)
    await useProject(pid, MODULES)
    let companyId: string | undefined
    let contactId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-crossnav-co') })
        contactId = await api.createContact(pid, {
            firstName: 'Кросс',
            lastName: uniqueName('Навигация'),
            companyId,
        })
        const dealId = await api.createDeal(pid, {
            name: uniqueName('co-crossnav-deal'),
            amount: 2000,
            companyId,
        })
        const orderTypeId = (await api.createOrderType(pid, uniqueName('co-crossnav-ot'))).id
        const orderId = await api.createOrder(pid, { orderTypeId, companyId, dealId, amount: 700 })

        // #102 — contact
        await page.goto(`/companies/${companyId}`)
        await byQa(page, 'companies.card.contactRow', { contact: contactId }).click()
        await expect(page).toHaveURL(new RegExp(`/contacts/${contactId}$`), { timeout: 30_000 })

        // #103 — deal
        await page.goto(`/companies/${companyId}`)
        await byQa(page, 'companies.card.dealRow', { deal: dealId }).click()
        await expect(page).toHaveURL(new RegExp(`/deals/${dealId}$`), { timeout: 30_000 })

        // #104 — order
        await page.goto(`/companies/${companyId}`)
        await byQa(page, 'companies.card.orderRow', { order: orderId }).click()
        await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`), { timeout: 30_000 })
    } finally {
        if (contactId) await api.deleteContact(pid, contactId)
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})
