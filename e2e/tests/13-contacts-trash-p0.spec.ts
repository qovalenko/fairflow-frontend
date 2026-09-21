import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { CONTACTS_FORBIDDEN_ALLOW } from '../support/contacts'

test.use({ forbiddenAllow: CONTACTS_FORBIDDEN_ALLOW })

test.describe('contacts trash P0', () => {
    test('#97 trash lists deleted contact', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('trash-list'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('trash').replace(/[^a-zA-Z0-9-]/g, '')
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Trashed',
                lastName: tag,
                email: `${tag}@example.test`,
            })
            await api.deleteContact(pid, id)
            await page.goto('/contacts/trash')
            await expect(byQa(page, 'contacts.trash.heading')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'contacts.trash.restore', { contact: id })).toBeVisible()
        } finally {
            if (id) await api.deleteContact(pid, id).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#100 restore contact without collision', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('restore'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('restore').replace(/[^a-zA-Z0-9-]/g, '')
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Restore',
                lastName: tag,
                email: `${tag}@example.test`,
            })
            await api.deleteContact(pid, id)
            await page.goto('/contacts/trash')
            await expect(byQa(page, 'contacts.trash.restore', { contact: id })).toBeVisible({
                timeout: 30_000,
            })
            const restore = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/contacts/${id}/restore`) &&
                    r.request().method() === 'POST',
            )
            await byQa(page, 'contacts.trash.restore', { contact: id }).click()
            await restore
            await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`), { timeout: 30_000 })
            const listed = await api.listContacts(pid, { query: tag })
            expect(listed.list.some((c) => c.id === id)).toBeTruthy()
        } finally {
            if (id) await api.deleteContact(pid, id).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
