import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { CONTACTS_FORBIDDEN_ALLOW, pickImportMappingColumn } from '../support/contacts'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

test.use({ forbiddenAllow: CONTACTS_FORBIDDEN_ALLOW })

function writeTempCsv(name: string, content: string): string {
    const filePath = path.join(os.tmpdir(), name)
    fs.writeFileSync(filePath, content, 'utf8')
    return filePath
}

test.describe('contacts import P0', () => {
    test('#130 full import happy path', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('import-happy'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('imp').replace(/[^a-zA-Z0-9-]/g, '')
        const csvPath = writeTempCsv(
            `${tag}.csv`,
            `firstName,lastName,phone,email\nImport,${tag},+79997778899,${tag}@example.test\n`,
        )
        try {
            await page.goto('/contacts/import')
            await byQa(page, 'contacts.import.fileInput').setInputFiles(csvPath)
            await byQa(page, 'contacts.import.stepNext').click()
            await byQa(page, 'contacts.import.mappingNext').click()
            await expect(byQa(page, 'contacts.import.preview')).toBeVisible()
            const importReq = page.waitForResponse(
                (r) => r.url().includes('/v1/contacts/import') && r.request().method() === 'POST',
            )
            await byQa(page, 'contacts.import.run').click()
            const res = await importReq
            expect(res.ok()).toBeTruthy()
            await byQa(page, 'contacts.import.finish').click()
            await expect(page).toHaveURL(/\/contacts\/?$/, { timeout: 30_000 })
            const listed = await api.listContacts(pid, { query: tag })
            expect(listed.total).toBeGreaterThan(0)
            for (const c of listed.list) await api.deleteContact(pid, c.id)
        } finally {
            fs.unlinkSync(csvPath)
            await api.archiveProject(pid)
        }
    })

    test('#134 manual column mapping on non-standard headers', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('import-map'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('map').replace(/[^a-zA-Z0-9-]/g, '')
        const csvPath = writeTempCsv(
            `${tag}.csv`,
            `GivenName,FamilyName,Mobile,Mail\nMapped,${tag},+79998887766,${tag}@example.test\n`,
        )
        try {
            await page.goto('/contacts/import')
            await byQa(page, 'contacts.import.fileInput').setInputFiles(csvPath)
            await byQa(page, 'contacts.import.stepNext').click()
            await expect(byQa(page, 'contacts.import.mapping')).toBeVisible()
            await pickImportMappingColumn(page, 'firstName', '0')
            await pickImportMappingColumn(page, 'lastName', '1')
            await pickImportMappingColumn(page, 'phone', '2')
            await pickImportMappingColumn(page, 'email', '3')
            await byQa(page, 'contacts.import.mappingNext').click()
            const importReq = page.waitForResponse(
                (r) => r.url().includes('/v1/contacts/import') && r.request().method() === 'POST',
            )
            await byQa(page, 'contacts.import.run').click()
            expect((await importReq).ok()).toBeTruthy()
            await byQa(page, 'contacts.import.finish').click()
            await expect(page).toHaveURL(/\/contacts\/?$/)
            const listed = await api.listContacts(pid, { query: tag })
            expect(listed.total).toBeGreaterThan(0)
            for (const c of listed.list) await api.deleteContact(pid, c.id)
        } finally {
            fs.unlinkSync(csvPath)
            await api.archiveProject(pid)
        }
    })

    test('#139 finish navigates back to contacts list', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('import-finish'), ['contacts'])
        await useProject(pid, ['contacts'])
        const tag = uniqueName('fin').replace(/[^a-zA-Z0-9-]/g, '')
        const csvPath = writeTempCsv(
            `${tag}.csv`,
            `firstName,lastName,phone,email\nFinish,${tag},+79990001122,${tag}@example.test\n`,
        )
        try {
            await page.goto('/contacts/import')
            await byQa(page, 'contacts.import.fileInput').setInputFiles(csvPath)
            await byQa(page, 'contacts.import.stepNext').click()
            await byQa(page, 'contacts.import.mappingNext').click()
            await byQa(page, 'contacts.import.run').click()
            await expect(byQa(page, 'contacts.import.finish')).toBeVisible({ timeout: 60_000 })
            await byQa(page, 'contacts.import.finish').click()
            await expect(page).toHaveURL(/\/contacts\/?$/)
            const listed = await api.listContacts(pid, { query: tag })
            for (const c of listed.list) await api.deleteContact(pid, c.id)
        } finally {
            fs.unlinkSync(csvPath)
            await api.archiveProject(pid)
        }
    })
})
