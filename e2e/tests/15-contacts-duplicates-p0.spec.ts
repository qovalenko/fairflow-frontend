import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { CONTACTS_FORBIDDEN_ALLOW, duplicatePair } from '../support/contacts'

test.use({ forbiddenAllow: CONTACTS_FORBIDDEN_ALLOW })

test.describe('contacts duplicate queue P0', () => {
    test('#121 duplicate queue shows email/phone pairs', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('dup-queue'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('pair').replace(/[^a-zA-Z0-9-]/g, '')
        const sharedEmail = `${tag}@example.test`
        let leftId: string | undefined
        let rightId: string | undefined
        try {
            leftId = await api.createContact(pid, {
                firstName: 'QueueA',
                lastName: tag,
                email: sharedEmail,
                phone: '+79996667788',
            })
            rightId = await api.createContact(pid, {
                firstName: 'QueueB',
                lastName: `${tag}B`,
                email: sharedEmail,
                phone: '+79996667789',
            })
            await page.goto('/contacts/duplicates')
            await expect(byQa(page, 'contacts.duplicates.heading')).toBeVisible({ timeout: 30_000 })
            await expect(duplicatePair(page, leftId, rightId)).toBeVisible({ timeout: 60_000 })
        } finally {
            if (leftId) await api.deleteContact(pid, leftId).catch(() => {})
            if (rightId) await api.deleteContact(pid, rightId).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
