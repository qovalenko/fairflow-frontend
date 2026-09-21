import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { CONTACTS_FORBIDDEN_ALLOW, pickFilterOption } from '../support/contacts'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

test.use({ forbiddenAllow: CONTACTS_FORBIDDEN_ALLOW })

test.describe('contacts list P0', () => {
    test('#1 empty state shows CTA', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('empty-list'), ['contacts'])
        await useProject(pid, ['contacts'])
        try {
            await page.goto('/contacts')
            await expect(byQa(page, 'contacts.list.empty')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'contacts.list.createEmpty')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#2 create first contact from empty state', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('empty-create'), ['contacts'])
        await useProject(pid, ['contacts'])
        const last = uniqueName('first').replace(/[^a-zA-Z0-9-]/g, '')
        const email = `${last}@example.test`
        let contactId: string | undefined
        try {
            await page.goto('/contacts')
            await byQa(page, 'contacts.list.createEmpty').click()
            await byQa(page, 'contacts.create.firstName').fill('First')
            await byQa(page, 'contacts.create.lastName').fill(last)
            await byQa(page, 'contacts.create.email').fill(email)
            const res = page.waitForResponse(
                (r) => r.url().includes('/v1/contacts') && r.request().method() === 'POST',
            )
            await byQa(page, 'contacts.create.submit').click()
            const created = await res
            expect(created.ok()).toBeTruthy()
            contactId = ((await created.json()) as { id?: string }).id
            await expect(byQa(page, 'contacts.list.row', { contact: contactId! })).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            if (contactId) await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#3 empty state import flow creates records in list', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('empty-import'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('emptyimp').replace(/[^a-zA-Z0-9-]/g, '')
        const csvPath = path.join(os.tmpdir(), `${tag}.csv`)
        fs.writeFileSync(
            csvPath,
            `firstName,lastName,phone,email\nEmpty,${tag},+79991110000,${tag}@example.test\n`,
        )
        try {
            await page.goto('/contacts')
            await expect(byQa(page, 'contacts.list.empty')).toBeVisible({ timeout: 30_000 })
            await byQa(page, 'contacts.list.importEmpty').click()
            await expect(page).toHaveURL(/\/contacts\/import/)
            await byQa(page, 'contacts.import.fileInput').setInputFiles(csvPath)
            await byQa(page, 'contacts.import.stepNext').click()
            await byQa(page, 'contacts.import.mappingNext').click()
            await byQa(page, 'contacts.import.run').click()
            await byQa(page, 'contacts.import.finish').click()
            await expect(page).toHaveURL(/\/contacts\/?$/)
            await expect(byQa(page, 'contacts.list.row').first()).toBeVisible({ timeout: 30_000 })
            const listed = await api.listContacts(pid, { query: tag })
            for (const c of listed.list) await api.deleteContact(pid, c.id)
        } finally {
            fs.unlinkSync(csvPath)
            await api.archiveProject(pid)
        }
    })

    test('#5 list table with pagination when many contacts', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('paginated'), ['contacts'])
        await useProject(pid, ['contacts'])
        const ids: string[] = []
        try {
            for (let i = 0; i < 12; i++) {
                const tag = uniqueName(`p${i}`).replace(/[^a-zA-Z0-9-]/g, '')
                ids.push(
                    await api.createContact(pid, {
                        firstName: 'Page',
                        lastName: tag,
                        email: `${tag}@example.test`,
                        phone: `+7900${String(i).padStart(7, '0')}`,
                    }),
                )
            }
            await page.goto('/contacts')
            await expect(byQa(page, 'contacts.list.table')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'contacts.list.row').first()).toBeVisible()
            const visibleRows = await byQa(page, 'contacts.list.row').count()
            expect(visibleRows).toBeLessThanOrEqual(10)
            expect(visibleRows).toBeGreaterThan(0)
        } finally {
            for (const id of ids) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#6 search narrows the list', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('search'), ['contacts'])
        await useProject(pid, ['contacts'])
        const needle = uniqueName('needle').replace(/[^a-zA-Z0-9-]/g, '')
        let targetId: string | undefined
        let otherId: string | undefined
        try {
            targetId = await api.createContact(pid, {
                firstName: 'FindMe',
                lastName: needle,
                email: `${needle}@example.test`,
            })
            otherId = await api.createContact(pid, {
                firstName: 'Other',
                lastName: 'Person',
                email: `other-${needle}@example.test`,
            })
            await page.goto('/contacts')
            await expect(byQa(page, 'contacts.list.row', { contact: targetId })).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'contacts.list.search').fill(needle)
            await expect(byQa(page, 'contacts.list.row', { contact: targetId })).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'contacts.list.row', { contact: otherId })).toHaveCount(0, {
                timeout: 30_000,
            })
        } finally {
            if (targetId) await api.deleteContact(pid, targetId)
            if (otherId) await api.deleteContact(pid, otherId)
            await api.archiveProject(pid)
        }
    })

    test('#7 source filter shows only matching contacts', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('source-filter'), ['contacts'])
        await useProject(pid, ['contacts'])
        const sources = await api.listDealSources()
        test.skip(sources.length < 2, 'need at least two deal sources on stand')
        const [sA, sB] = sources
        let idA: string | undefined
        let idB: string | undefined
        try {
            const tag = uniqueName('src').replace(/[^a-zA-Z0-9-]/g, '')
            idA = await api.createContact(pid, {
                firstName: 'SrcA',
                lastName: tag,
                email: `${tag}a@example.test`,
                source: sA.name,
            })
            idB = await api.createContact(pid, {
                firstName: 'SrcB',
                lastName: tag,
                email: `${tag}b@example.test`,
                source: sB.name,
            })
            await page.goto('/contacts')
            await expect(byQa(page, 'contacts.list.row', { contact: idA })).toBeVisible({
                timeout: 30_000,
            })
            await pickFilterOption(page, 'contacts.list.filterSource', sA.name)
            await expect(byQa(page, 'contacts.list.row', { contact: idA })).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'contacts.list.row', { contact: idB })).toHaveCount(0, {
                timeout: 30_000,
            })
        } finally {
            if (idA) await api.deleteContact(pid, idA)
            if (idB) await api.deleteContact(pid, idB)
            await api.archiveProject(pid)
        }
    })

    test('#8 assignee filter shows contacts of selected member', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('assignee-filter'), ['contacts'])
        await useProject(pid, ['contacts'])
        const members = await api.listMembers(pid)
        test.skip(members.length < 1, 'need project members on stand')
        const member = members[0]!
        let assignedId: string | undefined
        let orphanId: string | undefined
        try {
            const tag = uniqueName('asg').replace(/[^a-zA-Z0-9-]/g, '')
            assignedId = await api.createContact(pid, {
                firstName: 'Owned',
                lastName: tag,
                email: `${tag}owned@example.test`,
                assigneeId: member.id,
            })
            orphanId = await api.createContact(pid, {
                firstName: 'Orphan',
                lastName: tag,
                email: `${tag}orphan@example.test`,
            })
            await page.goto('/contacts')
            await expect(byQa(page, 'contacts.list.row', { contact: assignedId })).toBeVisible({
                timeout: 30_000,
            })
            await pickFilterOption(page, 'contacts.list.filterAssignee', member.id)
            await expect(byQa(page, 'contacts.list.row', { contact: assignedId })).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'contacts.list.row', { contact: orphanId })).toHaveCount(0, {
                timeout: 30_000,
            })
        } finally {
            if (assignedId) await api.deleteContact(pid, assignedId)
            if (orphanId) await api.deleteContact(pid, orphanId)
            await api.archiveProject(pid)
        }
    })

    test('#20 row click opens contact card', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('row-click'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('row').replace(/[^a-zA-Z0-9-]/g, '')
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Row',
                lastName: tag,
                email: `${tag}@example.test`,
            })
            await page.goto('/contacts')
            await byQa(page, 'contacts.list.row', { contact: id }).click()
            await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`))
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#22 navigate to trash', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('trash-nav'), ['contacts'])
        await useProject(pid, ['contacts'])
        try {
            await page.goto('/contacts')
            await byQa(page, 'contacts.list.goTrash').click()
            await expect(page).toHaveURL(/\/contacts\/trash/)
            await expect(byQa(page, 'contacts.trash.heading')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#24 navigate to import', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('import-nav'), ['contacts'])
        await useProject(pid, ['contacts'])
        try {
            await page.goto('/contacts')
            await byQa(page, 'contacts.list.goImport').click()
            await expect(page).toHaveURL(/\/contacts\/import/)
            await expect(byQa(page, 'contacts.import.fileInput')).toBeAttached()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#28 export all contacts server-side', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('export-all'), ['contacts'])
        await useProject(pid, ['contacts'])
        const ids: string[] = []
        try {
            for (let i = 0; i < 3; i++) {
                const tag = uniqueName(`ex${i}`).replace(/[^a-zA-Z0-9-]/g, '')
                ids.push(
                    await api.createContact(pid, {
                        firstName: 'Export',
                        lastName: tag,
                        email: `${tag}@example.test`,
                    }),
                )
            }
            await page.goto('/contacts')
            await expect(byQa(page, 'contacts.list.exportAll')).toBeVisible({ timeout: 30_000 })
            const downloadPromise = page.waitForEvent('download')
            await byQa(page, 'contacts.list.exportAll').click()
            const download = await downloadPromise
            expect(download.suggestedFilename()).toMatch(/\.csv$/i)
        } finally {
            for (const id of ids) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#34 reassign all contacts of departed owner', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('reassign'), ['contacts'])
        await useProject(pid, ['contacts'])
        const members = await api.listMembers(pid)
        test.skip(members.length < 2, 'need two project members for from→to reassign')
        const from = members[0]!
        const to = members[1]!
        const tag = uniqueName('reas').replace(/[^a-zA-Z0-9-]/g, '')
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Owned',
                lastName: tag,
                email: `${tag}@example.test`,
                assigneeId: from.id,
            })
            await page.goto('/contacts')
            await byQa(page, 'contacts.list.reassign').click()
            await expect(byQa(page, 'contacts.reassign.heading')).toBeVisible()
            await pickFilterOption(page, 'contacts.reassign.from', from.id)
            await pickFilterOption(page, 'contacts.reassign.to', to.id)
            const reassign = page.waitForResponse(
                (r) =>
                    r.url().includes('/v1/contacts/reassign') && r.request().method() === 'POST',
            )
            await byQa(page, 'contacts.reassign.submit').click()
            expect((await reassign).ok()).toBeTruthy()
            await expect(byQa(page, 'contacts.reassign.heading')).toHaveCount(0)
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#40 open create drawer from toolbar', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('open-drawer'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('drawer').replace(/[^a-zA-Z0-9-]/g, '')
        let id: string | undefined
        try {
            id = await api.createContact(pid, {
                firstName: 'Seed',
                lastName: tag,
                email: `${tag}@example.test`,
            })
            await page.goto('/contacts')
            await byQa(page, 'contacts.list.create').click()
            await expect(byQa(page, 'contacts.create.firstName')).toBeVisible()
            await expect(byQa(page, 'contacts.create.submit')).toBeVisible()
        } finally {
            if (id) await api.deleteContact(pid, id)
            await api.archiveProject(pid)
        }
    })
})
