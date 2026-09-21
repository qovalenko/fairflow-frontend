import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'

/**
 * Smoke 4 / catalog #41 — create a contact via the drawer (contacts module, served locally with
 * qa-ids in the hybrid). Project is seeded via API; the contact create form fields
 * carry qa-ids added by T-029 (contacts.create.firstName/lastName/email).
 * Cleanup: delete the contact + archive the project via API.
 */
// The contacts list over-fetches related panels (companies dropdown, activities
// feed) on load. Those modules aren't enabled on the seeded ['deals','contacts']
// project, so the gateway module-policy answers their GETs with 403 — expected
// product behaviour, not part of the create-contact happy path. Opt these out of
// the INV-403-00 guard so it still catches a real 403 on the contacts endpoints.
// String substrings (not RegExps) — see forbiddenAllow doc: an array of RegExps
// gets tuple-misdetected by Playwright's option parser.
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test('create contact: drawer creates a contact and it shows in the list', async ({
    page,
    api,
    useProject,
}) => {
    const modules = ['deals', 'contacts']
    const pid = await api.createProject(uniqueName('contacts'), modules)
    await useProject(pid, modules)

    const last = uniqueName('smoke').replace(/[^a-zA-Z0-9-]/g, '')
    const email = `${last}@example.test`.toLowerCase()
    let createdContactId: string | undefined

    try {
        await page.goto('/contacts')

        // Open the create drawer (toolbar button, or the empty-state CTA).
        const openCreate = byQa(page, 'contacts.list.create').or(
            byQa(page, 'contacts.list.createEmpty'),
        )
        await expect(openCreate.first()).toBeVisible({ timeout: 30_000 })
        await openCreate.first().click()

        await byQa(page, 'contacts.create.firstName').fill('T029')
        await byQa(page, 'contacts.create.lastName').fill(last)
        await byQa(page, 'contacts.create.email').fill(email)

        const createResponse = page.waitForResponse(
            (r) => r.url().includes('/v1/contacts') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'contacts.create.submit').click()
        const res = await createResponse
        expect(res.ok(), `contact POST ok (${res.status()})`).toBeTruthy()
        createdContactId = ((await res.json()) as { id?: string }).id

        // The new row appears in the list (identity via data-qa-contact).
        expect(createdContactId, 'created contact id').toBeTruthy()
        await expect(
            byQa(page, 'contacts.list.row', { contact: createdContactId! }),
        ).toBeVisible({ timeout: 30_000 })
    } finally {
        if (createdContactId) await api.deleteContact(pid, createdContactId)
        await api.archiveProject(pid)
    }
})
