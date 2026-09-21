import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { pickSelectOption, selectRow } from '../support/ui'
import {
    COMPANIES_MODULES,
    denyCompaniesDelete,
    denyCompaniesExport,
    denyCompaniesImport,
    denyCompaniesRead,
    denyCompaniesWrite,
    grantCompaniesExport,
    grantCompaniesImport,
} from '../support/companies'

/**
 * Companies — P1/P2 wave 2 (catalog `.e2e-scenario-catalog/companies.md`).
 * Continues closure after 10-companies-p1.spec.ts and 11-companies-p1p2.spec.ts.
 */

test.use({ forbiddenAllow: ['/v1/activities', '/v1/documents', '/v1/notifications'] })

async function createProjectOnly(
    api: { createProject: (name: string, modules: string[]) => Promise<string> },
    label: string,
    modules: string[] = [...COMPANIES_MODULES],
): Promise<string> {
    return api.createProject(uniqueName(label), modules)
}

async function seedProject(
    api: { createProject: (name: string, modules: string[]) => Promise<string> },
    useProject: (pid: string, modules?: string[]) => Promise<void>,
    label: string,
    modules: string[] = [...COMPANIES_MODULES],
): Promise<string> {
    const pid = await createProjectOnly(api, label, modules)
    await useProject(pid, modules)
    return pid
}

async function openCreateDrawer(page: import('@playwright/test').Page): Promise<void> {
    const openCreate = byQa(page, 'companies.list.create').or(
        byQa(page, 'companies.list.createEmpty'),
    )
    await expect(openCreate.first()).toBeVisible({ timeout: 30_000 })
    await openCreate.first().click()
}

test('#4 list: without companies:write hides create actions', async ({ page, api, useProject }) => {
    const pid = await createProjectOnly(api, 'co-no-write')
    try {
        await denyCompaniesWrite(page, pid)
        await useProject(pid)
        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.emptyNone')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'companies.list.create')).toHaveCount(0)
        await expect(byQa(page, 'companies.list.createEmpty')).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#5 list: without companies:delete hides bulk delete and card delete', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-no-delete')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-no-del-co') })
        await denyCompaniesDelete(page, pid)
        await useProject(pid)

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })
        await selectRow(byQa(page, 'companies.list.row', { company: companyId }))
        await expect(byQa(page, 'companies.list.bulkDelete')).toHaveCount(0)

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.name', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'companies.card.delete')).toHaveCount(0)
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#7 list: without companies:export hides the export action', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-no-export-btn')
    try {
        await denyCompaniesExport(page, pid)
        await useProject(pid)
        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.emptyNone')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'companies.list.export')).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#8 list: without companies:import hides the import link', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-no-import-btn')
    try {
        await denyCompaniesImport(page, pid)
        await useProject(pid)
        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.emptyNone')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'companies.list.import')).toHaveCount(0)
        await expect(byQa(page, 'companies.list.importEmpty')).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#13 nav: all companies routes require companies:read', async ({ page, api, useProject }) => {
    const pid = await createProjectOnly(api, 'co-route-guard')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-route-guard-co') })
        await denyCompaniesRead(page, pid)
        await useProject(pid)

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.noAccess')).toBeVisible({ timeout: 30_000 })

        await page.goto('/companies/import')
        await expect(byQa(page, 'companies.import.noAccess')).toBeVisible({ timeout: 30_000 })

        await page.goto('/companies/trash')
        await expect(byQa(page, 'companies.trash.noAccess')).toBeVisible({ timeout: 30_000 })

        await page.goto('/companies/merge')
        await expect(byQa(page, 'companies.merge.noAccess')).toBeVisible({ timeout: 30_000 })

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.noAccess')).toBeVisible({ timeout: 30_000 })

        await page.goto(`/companies/${companyId}/edit`)
        await expect(byQa(page, 'companies.edit.noAccess')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#31 list: filter change shows refetch indicator while validating', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-refetch')
    let companyId: string | undefined
    const needle = uniqueName('co-refetch-needle')
    try {
        companyId = await api.createCompany(pid, { name: needle })
        await page.route('**/v1/companies?**', async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            await new Promise((r) => setTimeout(r, 600))
            await route.continue()
        })

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })

        const refetch = page.waitForSelector('[data-qa-id="companies.list.refetching"]', {
            timeout: 20_000,
        })
        await byQa(page, 'companies.list.search').fill(needle.slice(-8))
        await refetch
        await expect(byQa(page, 'companies.list.refetching')).toBeHidden({ timeout: 30_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#48 create: TRASH_COLLISION confirm restores the trashed company', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-trash-coll')
    const inn = '7707' + String(Date.now()).slice(-6)
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-trash-coll-orig'), inn })
        await api.deleteCompany(pid, companyId)

        page.once('dialog', (dialog) => dialog.accept())

        await page.goto('/companies')
        await openCreateDrawer(page)
        await byQa(page, 'companies.create.name').fill(uniqueName('co-trash-coll-new'))
        await byQa(page, 'companies.create.inn').fill(inn)
        await byQa(page, 'companies.create.submit').click()

        await expect(page.getByText('Компания восстановлена из корзины')).toBeVisible({
            timeout: 20_000,
        })
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible({
            timeout: 20_000,
        })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#50 create: duplicate name without INN shows locked error', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-locked-name')
    const sharedName = uniqueName('co-locked-same')
    let firstId: string | undefined
    try {
        firstId = await api.createCompany(pid, { name: sharedName })

        await page.goto('/companies')
        await openCreateDrawer(page)
        await byQa(page, 'companies.create.name').fill(sharedName)
        await byQa(page, 'companies.create.submit').click()

        await expect(byQa(page, 'companies.create.error')).toBeVisible({ timeout: 20_000 })
        await expect(byQa(page, 'companies.create.name')).toHaveValue(sharedName)
    } finally {
        if (firstId) await api.deleteCompany(pid, firstId)
        await api.archiveProject(pid)
    }
})

test('#60 list: export truncated shows ceiling toast', async ({ page, api, useProject }) => {
    const pid = await createProjectOnly(api, 'co-export-trunc')
    try {
        await grantCompaniesExport(page, pid)
        await useProject(pid)
        await page.route('**/v1/companies/export?**', async (route) => {
            await route.fulfill({
                status: 200,
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': 'attachment; filename="companies.csv"',
                    'X-Export-Count': '1000',
                    'X-Export-Truncated': 'true',
                },
                body: 'name\n',
            })
        })

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.export')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.list.export').click()
        await expect(
            page.getByText(/достигнут потолок выгрузки, файл неполный/),
        ).toBeVisible({ timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#94 card: reassign API failure shows error toast', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-reassign-err')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-reassign-err-co') })
        const members = await api.listMembers(pid)
        const other = members.find((m) => m.id !== api.userId)
        expect(other, 'second project member for reassign').toBeTruthy()

        await page.route(`**/v1/companies/${companyId}/owner**`, async (route) => {
            if (route.request().method() === 'PATCH') {
                await route.fulfill({ status: 500, body: '{"error":"fail"}' })
                return
            }
            await route.continue()
        })

        await page.goto(`/companies/${companyId}`)
        await byQa(page, 'companies.card.reassign').click()
        await expect(byQa(page, 'companies.card.reassignDialog')).toBeVisible()
        await pickSelectOption(byQa(page, 'companies.card.reassignOwner'), other!.name.slice(0, 6))
        await byQa(page, 'companies.card.reassignConfirm').click()
        await expect(page.getByText('Не удалось переназначить владельца')).toBeVisible({
            timeout: 20_000,
        })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#99 card: merge picker survives duplicates API failure', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-dup-api-err')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-dup-api-err-co') })
        await page.route('**/v1/companies/duplicates?**', async (route) => {
            await route.fulfill({ status: 500, body: '{"error":"fail"}' })
        })

        await page.goto(`/companies/${companyId}`)
        await byQa(page, 'companies.card.merge').click()
        await expect(byQa(page, 'companies.card.mergePickerDialog')).toBeVisible({ timeout: 20_000 })
        await expect(byQa(page, 'companies.card.mergePickerEmpty')).toBeVisible({ timeout: 20_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test.fixme(
    '#101 card: BUG GET /card contacts empty: M2M contact on each company card',
    async ({ page, api, useProject }) => {
        const pid = await seedProject(api, useProject, 'co-m2m')
        let companyA: string | undefined
        let companyB: string | undefined
        let contactId: string | undefined
        try {
            companyA = await api.createCompany(pid, { name: uniqueName('co-m2m-a') })
            companyB = await api.createCompany(pid, { name: uniqueName('co-m2m-b') })
            contactId = await api.createContact(pid, {
                firstName: 'M2M',
                lastName: uniqueName('contact'),
                companyId: companyA,
            })
            await api.updateContact(pid, contactId, { companyIds: [companyA, companyB] })

            for (const cid of [companyA, companyB]) {
                await page.goto(`/companies/${cid}`)
                await expect(
                    byQa(page, 'companies.card.contactRow', { contact: contactId }),
                ).toBeVisible({ timeout: 30_000 })
            }
        } finally {
            if (contactId) await api.deleteContact(pid, contactId).catch(() => {})
            if (companyA) await api.deleteCompany(pid, companyA).catch(() => {})
            if (companyB) await api.deleteCompany(pid, companyB).catch(() => {})
            await api.archiveProject(pid)
        }
    },
)

test('#128 trash: purge API failure shows error toast', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-purge-err')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-purge-err-co') })
        await api.deleteCompany(pid, companyId)

        await page.route(`**/v1/companies/${companyId}**`, async (route) => {
            const url = route.request().url()
            if (route.request().method() === 'DELETE' && url.includes('force=true')) {
                await route.fulfill({ status: 500, body: '{"error":"fail"}' })
                return
            }
            await route.continue()
        })

        await page.goto('/companies/trash')
        await expect(byQa(page, 'companies.trash.row', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'companies.trash.purge', { company: companyId }).click()
        await byQa(page, 'companies.trash.purgeConfirm').click()
        await expect(page.getByText('Не удалось удалить навсегда')).toBeVisible({
            timeout: 20_000,
        })
    } finally {
        if (companyId) await api.purgeCompany(pid, companyId).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#141 merge: repeating merge URL after success shows unavailable loser', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-merge-noop')
    const ids: string[] = []
    try {
        ids.push(await api.createCompany(pid, { name: uniqueName('co-merge-noop-a') }))
        ids.push(await api.createCompany(pid, { name: uniqueName('co-merge-noop-b') }))

        await page.goto(`/companies/merge?master=${ids[0]}&loser=${ids[1]}`)
        await expect(byQa(page, 'companies.merge.preview')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.merge.submit').click()
        await byQa(page, 'companies.merge.confirmSubmit').click()
        await expect(page).toHaveURL(new RegExp(`/companies/${ids[0]}$`), { timeout: 30_000 })

        await page.goto(`/companies/merge?master=${ids[0]}&loser=${ids[1]}`)
        await expect(byQa(page, 'companies.merge.unavailable')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (ids[0]) await api.deleteCompany(pid, ids[0]).catch(() => {})
        await api.archiveProject(pid)
    }
})

test('#149 import: dedup update mode shows updated count in the report', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-import-upd')
    try {
        await grantCompaniesImport(page, pid)
        await useProject(pid)
        await page.route('**/v1/companies/import**', async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        created: 0,
                        updated: 2,
                        skipped: 0,
                        errors: 0,
                    }),
                })
                return
            }
            await route.continue()
        })

        await page.goto('/companies/import')
        await byQa(page, 'companies.import.file').setInputFiles({
            name: 'companies.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('name,inn\nAcme,7701234567\n'),
        })
        await byQa(page, 'companies.import.next', { step: 1 }).click()
        await byQa(page, 'companies.import.next', { step: 2 }).click()
        await byQa(page, 'companies.import.submit').click()
        await expect(byQa(page, 'companies.import.resultUpdated')).toContainText('2', {
            timeout: 20_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#150 import: create mode with duplicate inn lands row in errorRows', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-import-dup-err')
    try {
        await grantCompaniesImport(page, pid)
        await useProject(pid)
        await page.route('**/v1/companies/import**', async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        created: 0,
                        updated: 0,
                        skipped: 0,
                        errors: 1,
                        errorRows: [{ row: 2, message: 'duplicate inn locked' }],
                    }),
                })
                return
            }
            await route.continue()
        })

        await page.goto('/companies/import')
        await byQa(page, 'companies.import.file').setInputFiles({
            name: 'dup.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('name,inn\nDup,7701234567\n'),
        })
        await byQa(page, 'companies.import.next', { step: 1 }).click()
        await pickSelectOption(byQa(page, 'companies.import.dedupMode'), 'Создавать')
        await byQa(page, 'companies.import.next', { step: 2 }).click()
        await byQa(page, 'companies.import.submit').click()
        await expect(byQa(page, 'companies.import.errorRows')).toBeVisible({ timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#151 import: partial success keeps batch and shows mixed report', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-import-partial')
    try {
        await grantCompaniesImport(page, pid)
        await useProject(pid)
        await page.route('**/v1/companies/import**', async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        created: 1,
                        updated: 0,
                        skipped: 0,
                        errors: 1,
                        errorRows: [{ row: 3, message: 'invalid inn' }],
                    }),
                })
                return
            }
            await route.continue()
        })

        await page.goto('/companies/import')
        await byQa(page, 'companies.import.file').setInputFiles({
            name: 'mix.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('name,inn\nOk,7701234567\nBad,xxx\n'),
        })
        await byQa(page, 'companies.import.next', { step: 1 }).click()
        await byQa(page, 'companies.import.next', { step: 2 }).click()
        await byQa(page, 'companies.import.submit').click()
        await expect(byQa(page, 'companies.import.resultCreated')).toContainText('1')
        await expect(byQa(page, 'companies.import.resultErrors')).toContainText('1')
    } finally {
        await api.archiveProject(pid)
    }
})

test('#152 import: API error on step 3 keeps wizard and allows retry', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-import-api-err')
    let failOnce = true
    try {
        await grantCompaniesImport(page, pid)
        await useProject(pid)
        await page.route('**/v1/companies/import**', async (route) => {
            if (route.request().method() !== 'POST') {
                await route.continue()
                return
            }
            if (failOnce) {
                failOnce = false
                await route.fulfill({ status: 500, body: '{"error":"fail"}' })
                return
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ created: 1, updated: 0, skipped: 0, errors: 0 }),
            })
        })

        await page.goto('/companies/import')
        await byQa(page, 'companies.import.file').setInputFiles({
            name: 'one.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('name,inn\nOne,7701234567\n'),
        })
        await byQa(page, 'companies.import.next', { step: 1 }).click()
        await byQa(page, 'companies.import.next', { step: 2 }).click()
        await byQa(page, 'companies.import.submit').click()
        await expect(byQa(page, 'companies.import.error')).toBeVisible({ timeout: 20_000 })
        await byQa(page, 'companies.import.submit').click()
        await expect(byQa(page, 'companies.import.resultCreated')).toContainText('1', {
            timeout: 20_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#154 import: header row is auto-detected for column mapping', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-import-header')
    try {
        await grantCompaniesImport(page, pid)
        await useProject(pid)
        await page.goto('/companies/import')
        await byQa(page, 'companies.import.file').setInputFiles({
            name: 'header.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('name,inn,email\nRowCo,7701234567,a@test.com\n'),
        })
        await byQa(page, 'companies.import.next', { step: 1 }).click()
        await byQa(page, 'companies.import.next', { step: 2 }).click()
        await expect(page.getByText('Первая строка распознана как заголовок')).toBeVisible({
            timeout: 20_000,
        })
        await expect(byQa(page, 'companies.import.preview')).toContainText('RowCo')
    } finally {
        await api.archiveProject(pid)
    }
})

test('#155 import: file without header treats first row as data columns', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-import-no-header')
    try {
        await grantCompaniesImport(page, pid)
        await useProject(pid)
        await page.goto('/companies/import')
        await byQa(page, 'companies.import.file').setInputFiles({
            name: 'no-header.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('DataCo,7701234567\n'),
        })
        await byQa(page, 'companies.import.next', { step: 1 }).click()
        await byQa(page, 'companies.import.next', { step: 2 }).click()
        await expect(
            page.getByText('Строка заголовков не найдена — первая строка файла будет импортирована как данные.'),
        ).toBeVisible({ timeout: 20_000 })
        await expect(byQa(page, 'companies.import.preview')).toContainText('DataCo')
    } finally {
        await api.archiveProject(pid)
    }
})

test('#160 mount: contact tab shows empty state without linked companies', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-mp-contact-empty')
    let contactId: string | undefined
    try {
        contactId = await api.createContact(pid, {
            firstName: 'No',
            lastName: uniqueName('Co'),
        })
        await page.goto(`/contacts/${contactId}`)
        await expect(byQa(page, 'companies.mp.contact.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (contactId) await api.deleteContact(pid, contactId)
        await api.archiveProject(pid)
    }
})

test('#161 mount: contact tab without companies:read shows no-access', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-mp-contact-no-read')
    let contactId: string | undefined
    try {
        contactId = await api.createContact(pid, {
            firstName: 'Deny',
            lastName: uniqueName('Co'),
        })
        await denyCompaniesRead(page, pid)
        await useProject(pid)
        await page.goto(`/contacts/${contactId}`)
        await expect(byQa(page, 'companies.mp.contact.noAccess')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (contactId) await api.deleteContact(pid, contactId)
        await api.archiveProject(pid)
    }
})

test('#163 mount: deal sidebar shows empty state when deal has no company', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-mp-deal-empty')
    let dealId: string | undefined
    try {
        dealId = await api.createDeal(pid, uniqueName('co-deal-no-co'))
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'companies.mp.deal.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId)
        await api.archiveProject(pid)
    }
})

test('#164 mount: deal sidebar hidden without companies:read', async ({ page, api, useProject }) => {
    const pid = await createProjectOnly(api, 'co-mp-deal-no-read')
    let dealId: string | undefined
    try {
        dealId = await api.createDeal(pid, uniqueName('co-deal-deny'))
        await denyCompaniesRead(page, pid)
        await useProject(pid)
        await page.goto(`/deals/${dealId}`)
        await expect(byQa(page, 'deals.details.edit')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'companies.mp.deal.sidebar')).toHaveCount(0)
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId)
        await api.archiveProject(pid)
    }
})

test('#166 mount: order tab shows empty state when order has no company', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-mp-order-empty')
    let orderId: string | undefined
    try {
        orderId = await api.createOrder(pid, uniqueName('co-order-no-co'))
        await page.goto(`/orders/${orderId}`)
        await expect(byQa(page, 'companies.mp.order.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (orderId) await api.deleteOrder(pid, orderId).catch(() => {})
        await api.archiveProject(pid)
    }
})
