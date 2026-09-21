import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { CONTACTS_FORBIDDEN_ALLOW } from '../support/contacts'

test.use({ forbiddenAllow: CONTACTS_FORBIDDEN_ALLOW })

test.describe('contacts details P0', () => {
    test('#55 open contact card shows header', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('card'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('card').replace(/[^a-zA-Z0-9-]/g, '')
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Card',
                lastName: tag,
                email: `${tag}@example.test`,
            })
            await page.goto(`/contacts/${id}`)
            await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`))
            await expect(byQa(page, 'contacts.details.edit')).toBeVisible({ timeout: 30_000 })
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#56 tel and mailto links in header', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('links'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('links').replace(/[^a-zA-Z0-9-]/g, '')
        const phone = '+79991234567'
        const email = `${tag}@example.test`
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Link',
                lastName: tag,
                email,
                phone,
            })
            await page.goto(`/contacts/${id}`)
            await expect(byQa(page, 'contacts.details.phoneLink')).toHaveAttribute(
                'href',
                `tel:${phone.replace(/\D/g, '')}`,
            )
            await expect(byQa(page, 'contacts.details.emailLink')).toHaveAttribute(
                'href',
                `mailto:${email}`,
            )
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#66 edit button navigates to edit screen', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('edit-nav'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('edit').replace(/[^a-zA-Z0-9-]/g, '')
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Edit',
                lastName: tag,
                email: `${tag}@example.test`,
            })
            await page.goto(`/contacts/${id}`)
            await byQa(page, 'contacts.details.edit').click()
            await expect(page).toHaveURL(new RegExp(`/contacts/${id}/edit$`))
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#67 #96 delete contact moves it to trash', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('delete'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('del').replace(/[^a-zA-Z0-9-]/g, '')
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Delete',
                lastName: tag,
                email: `${tag}@example.test`,
            })
            await page.goto(`/contacts/${id}`)
            await byQa(page, 'contacts.details.delete').click()
            await byQa(page, 'contacts.details.deleteConfirm').click()
            await expect(page).toHaveURL(/\/contacts\/?$/, { timeout: 30_000 })
            const listed = await api.listContacts(pid, { query: tag })
            expect(listed.list.some((c) => c.id === id)).toBeFalsy()
        } finally {
            if (id) await api.deleteContact(pid, id).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
