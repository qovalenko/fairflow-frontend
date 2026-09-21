import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { CONTACTS_FORBIDDEN_ALLOW, duplicateMerge, duplicatePair } from '../support/contacts'

test.use({ forbiddenAllow: CONTACTS_FORBIDDEN_ALLOW })

test.describe('contacts merge P0', () => {
    test('#109 merge screen loads both contacts', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('merge-open'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('merge').replace(/[^a-zA-Z0-9-]/g, '')
        let sourceId: string | undefined
        let targetId: string | undefined
        try {
            sourceId = await api.createContact(pid, {
                firstName: 'MergeA',
                lastName: tag,
                email: `${tag}a@example.test`,
                phone: '+79991111111',
            })
            targetId = await api.createContact(pid, {
                firstName: 'MergeB',
                lastName: tag,
                email: `${tag}b@example.test`,
                phone: '+79992222222',
            })
            await page.goto(`/contacts/merge?source=${sourceId}&target=${targetId}`)
            await expect(byQa(page, 'contacts.merge.heading')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'contacts.merge.submit')).toBeVisible()
        } finally {
            if (sourceId) await api.deleteContact(pid, sourceId).catch(() => {})
            if (targetId) await api.deleteContact(pid, targetId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#112 merge submits and redirects to master card', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('merge-do'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('merged').replace(/[^a-zA-Z0-9-]/g, '')
        let sourceId: string | undefined
        let targetId: string | undefined
        try {
            sourceId = await api.createContact(pid, {
                firstName: 'Slave',
                lastName: tag,
                email: `${tag}slave@example.test`,
                phone: '+79993334455',
            })
            targetId = await api.createContact(pid, {
                firstName: 'Master',
                lastName: tag,
                email: `${tag}master@example.test`,
                phone: '+79994445566',
            })
            await page.goto(`/contacts/merge?source=${sourceId}&target=${targetId}`)
            await expect(byQa(page, 'contacts.merge.submit')).toBeVisible({ timeout: 30_000 })
            const mergeReq = page.waitForResponse(
                (r) => r.url().includes('/v1/contacts/merge') && r.request().method() === 'POST',
            )
            await byQa(page, 'contacts.merge.submit').click()
            const res = await mergeReq
            expect(res.ok()).toBeTruthy()
            await expect(page).toHaveURL(new RegExp(`/contacts/${targetId}$`), { timeout: 30_000 })
            sourceId = undefined
        } finally {
            if (sourceId) await api.deleteContact(pid, sourceId).catch(() => {})
            if (targetId) await api.deleteContact(pid, targetId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#123 duplicate queue merge opens merge screen', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('dq-merge'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('dup').replace(/[^a-zA-Z0-9-]/g, '')
        const sharedEmail = `${tag}@example.test`
        let leftId: string | undefined
        let rightId: string | undefined
        try {
            leftId = await api.createContact(pid, {
                firstName: 'DupA',
                lastName: tag,
                email: sharedEmail,
                phone: '+79995556677',
            })
            rightId = await api.createContact(pid, {
                firstName: 'DupB',
                lastName: `${tag}B`,
                email: sharedEmail,
                phone: '+79995556678',
            })
            await page.goto('/contacts/duplicates')
            await expect(byQa(page, 'contacts.duplicates.heading')).toBeVisible({ timeout: 30_000 })
            await expect(duplicatePair(page, leftId, rightId)).toBeVisible({ timeout: 60_000 })
            await duplicateMerge(page, leftId, rightId).click()
            await expect(page).toHaveURL(/\/contacts\/merge\?/)
            expect(page.url()).toMatch(new RegExp(leftId))
            expect(page.url()).toMatch(new RegExp(rightId))
            await expect(byQa(page, 'contacts.merge.submit')).toBeVisible()
        } finally {
            if (leftId) await api.deleteContact(pid, leftId).catch(() => {})
            if (rightId) await api.deleteContact(pid, rightId).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
