import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { CONTACTS_FORBIDDEN_ALLOW } from '../support/contacts'

test.use({ forbiddenAllow: CONTACTS_FORBIDDEN_ALLOW })

test.describe('contacts edit P0', () => {
    test('#83 edit form loads with existing data', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('edit-load'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('edit').replace(/[^a-zA-Z0-9-]/g, '')
        const email = `${tag}@example.test`
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Loaded',
                lastName: tag,
                email,
            })
            await page.goto(`/contacts/${id}/edit`)
            await expect(page).toHaveURL(new RegExp(`/contacts/${id}/edit$`))
            await expect(byQa(page, 'contacts.edit.firstName')).toHaveValue('Loaded', {
                timeout: 30_000,
            })
            await expect(byQa(page, 'contacts.edit.lastName')).toHaveValue(tag)
            await expect(byQa(page, 'contacts.edit.email')).toHaveValue(email)
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#84 save changes returns to card', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('edit-save'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('save').replace(/[^a-zA-Z0-9-]/g, '')
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Before',
                lastName: tag,
                email: `${tag}@example.test`,
            })
            await page.goto(`/contacts/${id}/edit`)
            await expect(byQa(page, 'contacts.edit.firstName')).toHaveValue('Before', {
                timeout: 30_000,
            })
            await byQa(page, 'contacts.edit.firstName').fill('After')
            const put = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/contacts/${id}`) && r.request().method() === 'PUT',
            )
            await byQa(page, 'contacts.edit.save').click()
            const res = await put
            expect(res.ok()).toBeTruthy()
            await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`), { timeout: 30_000 })
            const saved = await api.getContact(pid, id)
            expect(saved.firstName).toBe('After')
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })
})
