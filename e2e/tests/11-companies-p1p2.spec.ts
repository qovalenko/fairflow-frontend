import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { selectRow, toggleSwitcher } from '../support/ui'
import {
    COMPANIES_MODULES,
    denyCompaniesImport,
    denyCompaniesManage,
    denyCompaniesOwnerWrite,
    denyCompaniesRead,
    denyCompaniesWrite,
    grantCompaniesExport,
    grantCompaniesImport,
} from '../support/companies'

/**
 * Companies — P1/P2 closure wave (catalog `.e2e-scenario-catalog/companies.md`).
 *
 * Focus: access guards, list filters/errors, edit, merge, trash/restore, card actions.
 * Builds on P0 (06–09) and first P1 batch (10-companies-p1.spec.ts).
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

test('#2 list: without companies:read shows no-access state', async ({ page, api, useProject }) => {
    const pid = await createProjectOnly(api, 'co-no-read')
    try {
        await denyCompaniesRead(page, pid)
        await useProject(pid)
        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.noAccess')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#6 list: without companies:manage hides bulk merge for two selected rows', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-no-merge-btn')
    const ids: string[] = []
    try {
        ids.push(await api.createCompany(pid, { name: uniqueName('co-no-merge-a') }))
        ids.push(await api.createCompany(pid, { name: uniqueName('co-no-merge-b') }))
        await denyCompaniesManage(page, pid)
        await useProject(pid)

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row', { company: ids[0] })).toBeVisible({
            timeout: 30_000,
        })
        await selectRow(byQa(page, 'companies.list.row', { company: ids[0] }))
        await selectRow(byQa(page, 'companies.list.row', { company: ids[1] }))
        await expect(byQa(page, 'companies.list.selectedCount')).toContainText('2')
        await expect(byQa(page, 'companies.list.bulkMerge')).toHaveCount(0)
    } finally {
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})

test('#9 import: direct URL without import permission shows no-access', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-no-import')
    try {
        await denyCompaniesImport(page, pid)
        await useProject(pid)
        await page.goto('/companies/import')
        await expect(byQa(page, 'companies.import.noAccess')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#10 merge: direct URL without manage permission shows no-access', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-merge-no-manage')
    const ids: string[] = []
    try {
        ids.push(await api.createCompany(pid, { name: uniqueName('co-merge-guard-a') }))
        ids.push(await api.createCompany(pid, { name: uniqueName('co-merge-guard-b') }))
        await denyCompaniesManage(page, pid)
        await useProject(pid)
        await page.goto(`/companies/merge?master=${ids[0]}&loser=${ids[1]}`)
        await expect(byQa(page, 'companies.merge.noAccess')).toBeVisible({ timeout: 30_000 })
    } finally {
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})

test('#11 trash: direct URL without read permission shows no-access', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-trash-no-read')
    try {
        await denyCompaniesRead(page, pid)
        await useProject(pid)
        await page.goto('/companies/trash')
        await expect(byQa(page, 'companies.trash.noAccess')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#12 edit: direct URL without write permission shows no-access', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-edit-no-write')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-edit-guard') })
        await denyCompaniesWrite(page, pid)
        await useProject(pid)
        await page.goto(`/companies/${companyId}/edit`)
        await expect(byQa(page, 'companies.edit.noAccess')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#30 list: load error shows retry and refetches on click', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-list-err')
    let failOnce = true
    await page.route('**/v1/companies?**', async (route) => {
        if (route.request().method() !== 'GET') {
            await route.continue()
            return
        }
        if (failOnce) {
            failOnce = false
            await route.fulfill({ status: 500, body: 'error' })
            return
        }
        await route.continue()
    })
    try {
        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.error')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.list.retry').click()
        await expect(byQa(page, 'companies.list.emptyNone')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#40 list: only-mine with no personal slice shows empty-filter reset', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-onlymine-empty')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-other-owner') })
        const members = await api.listMembers(pid)
        const other = members.find((m) => m.id !== api.userId)
        if (other) {
            await api.updateCompany(pid, companyId, { assigneeId: other.id })
        } else {
            await api.updateCompany(pid, companyId, { assigneeId: '00000000-0000-4000-8000-000000000099' })
        }

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })
        await toggleSwitcher(byQa(page, 'companies.list.onlyMine'))
        await expect(byQa(page, 'companies.list.emptyFilter')).toBeVisible({ timeout: 20_000 })
        await byQa(page, 'companies.list.resetFilters').click()
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible({
            timeout: 20_000,
        })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#73 card: contactsTruncated banner is visible when composite stats flag it', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-trunc')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-trunc-co') })
        await page.route(`**/v1/companies/${companyId}/card?**`, async (route) => {
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            const stats = (body.stats as Record<string, unknown> | undefined) ?? {}
            await route.fulfill({
                status: upstream.status(),
                contentType: 'application/json',
                body: JSON.stringify({ ...body, stats: { ...stats, contactsTruncated: true } }),
            })
        })

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.contactsTruncated')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#74 card: audit line shows creator metadata from the API', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-audit')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-audit-co') })
        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.audit')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'companies.card.audit')).toContainText('Создал:')
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#80 card: copy link writes the company URL to the clipboard', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-copy-link')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-copy-link-co') })
        await page.addInitScript(() => {
            let last = ''
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: {
                    writeText: async (text: string) => {
                        last = text
                    },
                    readText: async () => last,
                },
            })
        })

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.copyLink')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.card.copyLink').click()
        const copied = await page.evaluate(() =>
            (navigator.clipboard as { readText?: () => Promise<string> }).readText?.(),
        )
        expect(copied).toContain(`/companies/${companyId}`)
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#81 card: copy requisites writes INN and address lines', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-copy-req')
    let companyId: string | undefined
    const inn = '7705' + String(Date.now()).slice(-6)
    try {
        companyId = await api.createCompany(pid, {
            name: uniqueName('co-copy-req-co'),
            inn,
            kpp: '770501001',
            legalAddress: 'г. Москва, ул. Реквизитная, 1',
        })
        await page.addInitScript(() => {
            let last = ''
            Object.defineProperty(navigator, 'clipboard', {
                configurable: true,
                value: {
                    writeText: async (text: string) => {
                        last = text
                    },
                    readText: async () => last,
                },
            })
        })

        await page.goto(`/companies/${companyId}`)
        await byQa(page, 'companies.card.requisites').click()
        const copied = await page.evaluate(() =>
            (navigator.clipboard as { readText?: () => Promise<string> }).readText?.(),
        )
        expect(copied).toContain(inn)
        expect(copied).toContain('770501001')
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#82 card: phone link uses tel href', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-tel')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, {
            name: uniqueName('co-tel-co'),
            phone: '+7 900 111-22-33',
        })
        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.phone')).toHaveAttribute('href', /tel:/)
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#83 card: email link uses mailto href', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-mail')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, {
            name: uniqueName('co-mail-co'),
            email: 'billing@example.com',
        })
        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.email')).toHaveAttribute(
            'href',
            'mailto:billing@example.com',
        )
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#86 card: delete API failure keeps the user on the company card', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-del-err')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-del-err-co') })
        await page.route(`**/v1/companies/${companyId}?**`, async (route) => {
            if (route.request().method() === 'DELETE') {
                await route.fulfill({ status: 500, body: '{"error":"fail"}' })
                return
            }
            await route.continue()
        })

        await page.goto(`/companies/${companyId}`)
        await byQa(page, 'companies.card.delete').click()
        await byQa(page, 'companies.card.deleteConfirm').click()
        await expect(page).toHaveURL(new RegExp(`/companies/${companyId}$`), { timeout: 20_000 })
        await expect(byQa(page, 'companies.card.name', { company: companyId })).toBeVisible()
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#87 card: trashed company opened from trash shows the trash banner', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-trash-banner')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-trash-banner-co') })
        await api.deleteCompany(pid, companyId)

        await page.goto('/companies/trash')
        await expect(byQa(page, 'companies.trash.row', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'companies.trash.row', { company: companyId }).click()
        await expect(byQa(page, 'companies.card.trashedBanner')).toBeVisible({ timeout: 30_000 })
    } finally {
        if (companyId) await api.purgeCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#93 card: reassign button hidden without owner write or manage', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-no-reassign')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-no-reassign-co') })
        await denyCompaniesOwnerWrite(page, pid)
        await useProject(pid)
        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.infoWidget')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'companies.card.reassign')).toHaveCount(0)
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#98 card: merge picker surfaces trashed duplicates with open-trash link', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-merge-trash-hint')
    const inn = '7706' + String(Date.now()).slice(-6)
    let masterId: string | undefined
    let loserId: string | undefined
    try {
        masterId = await api.createCompany(pid, { name: uniqueName('co-merge-trash-master'), inn })
        loserId = await api.createCompany(pid, { name: uniqueName('co-merge-trash-loser'), inn })
        await api.deleteCompany(pid, loserId)

        await page.goto(`/companies/${masterId}`)
        await byQa(page, 'companies.card.merge').click()
        await expect(byQa(page, 'companies.card.mergePickerDialog')).toBeVisible({ timeout: 20_000 })
        await expect(byQa(page, 'companies.card.mergeOpenTrash')).toBeVisible({ timeout: 20_000 })
        await byQa(page, 'companies.card.mergeOpenTrash').click()
        await expect(page).toHaveURL(/\/companies\/trash$/, { timeout: 20_000 })
    } finally {
        if (loserId) await api.purgeCompany(pid, loserId)
        if (masterId) await api.deleteCompany(pid, masterId)
        await api.archiveProject(pid)
    }
})

test('#113 edit: save API failure keeps the edited form on screen', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-edit-save-err')
    let companyId: string | undefined
    const edited = uniqueName('co-edit-save-err-name')
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-edit-save-err-co') })
        await page.route(`**/v1/companies/${companyId}?**`, async (route) => {
            if (route.request().method() === 'PUT') {
                await route.fulfill({ status: 500, body: '{"error":"fail"}' })
                return
            }
            await route.continue()
        })

        await page.goto(`/companies/${companyId}/edit`)
        await byQa(page, 'companies.edit.name').fill(edited)
        await byQa(page, 'companies.edit.save').click()
        await expect(page).toHaveURL(new RegExp(`/companies/${companyId}/edit$`), { timeout: 20_000 })
        await expect(byQa(page, 'companies.edit.name')).toHaveValue(edited)
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#116 edit: assignee select disabled without owner write permission', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-edit-no-owner')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-edit-no-owner-co') })
        await denyCompaniesOwnerWrite(page, pid)
        await useProject(pid)
        await page.goto(`/companies/${companyId}/edit`)
        await expect(byQa(page, 'companies.edit.assignee')).toBeVisible({ timeout: 30_000 })
        await expect(
            byQa(page, 'companies.edit.assignee').locator('input[role="combobox"]'),
        ).toBeDisabled()
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#122 trash: load error shows retry and refetches on click', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-trash-err')
    let failOnce = true
    await page.route('**/v1/companies/trash?**', async (route) => {
        if (route.request().method() !== 'GET') {
            await route.continue()
            return
        }
        if (failOnce) {
            failOnce = false
            await route.fulfill({ status: 500, body: 'error' })
            return
        }
        await route.continue()
    })
    try {
        await page.goto('/companies/trash')
        await expect(byQa(page, 'companies.trash.error')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.trash.retry').click()
        await expect(byQa(page, 'companies.trash.empty')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#127 trash: purge permanently removes the row from trash', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-purge')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-purge-co') })
        await api.deleteCompany(pid, companyId)

        await page.goto('/companies/trash')
        await expect(byQa(page, 'companies.trash.row', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'companies.trash.purge', { company: companyId }).click()
        await expect(byQa(page, 'companies.trash.purgeDialog')).toBeVisible()
        const purged = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/companies/${companyId}`) &&
                r.request().method() === 'DELETE' &&
                r.url().includes('force=true'),
            { timeout: 20_000 },
        )
        await byQa(page, 'companies.trash.purgeConfirm').click()
        expect((await purged).ok(), 'purge ok').toBeTruthy()
        await expect(byQa(page, 'companies.trash.row', { company: companyId })).toHaveCount(0, {
            timeout: 20_000,
        })
        companyId = undefined
    } finally {
        if (companyId) await api.purgeCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#136 merge: preview API error shows degraded preview banner', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-merge-preview-err')
    const ids: string[] = []
    try {
        ids.push(await api.createCompany(pid, { name: uniqueName('co-preview-a') }))
        ids.push(await api.createCompany(pid, { name: uniqueName('co-preview-b') }))
        await page.route('**/v1/companies/merge/preview?**', async (route) => {
            await route.fulfill({ status: 500, body: '{"error":"fail"}' })
        })

        await page.goto(`/companies/merge?master=${ids[0]}&loser=${ids[1]}`)
        await expect(byQa(page, 'companies.merge.previewError')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'companies.merge.submit')).toBeVisible()
    } finally {
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})

test('#139 merge: API error keeps the user on the merge screen', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-merge-api-err')
    const ids: string[] = []
    try {
        ids.push(await api.createCompany(pid, { name: uniqueName('co-merge-fail-a') }))
        ids.push(await api.createCompany(pid, { name: uniqueName('co-merge-fail-b') }))
        await page.route('**/v1/companies/merge?**', async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({ status: 500, body: '{"error":"fail"}' })
                return
            }
            await route.continue()
        })

        await page.goto(`/companies/merge?master=${ids[0]}&loser=${ids[1]}`)
        await expect(byQa(page, 'companies.merge.preview')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.merge.submit').click()
        await byQa(page, 'companies.merge.confirmSubmit').click()
        await expect(page).toHaveURL(
            new RegExp(`/companies/merge\\?master=${ids[0]}&loser=${ids[1]}`),
            { timeout: 20_000 },
        )
        expect((await api.listCompanies(pid)).map((c) => c.id).sort()).toEqual(ids.slice().sort())
    } finally {
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})

test('#142 merge: drift disclaimer text is visible on the merge screen', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-merge-disclaimer')
    const ids: string[] = []
    try {
        ids.push(await api.createCompany(pid, { name: uniqueName('co-disc-a') }))
        ids.push(await api.createCompany(pid, { name: uniqueName('co-disc-b') }))
        await page.goto(`/companies/merge?master=${ids[0]}&loser=${ids[1]}`)
        await expect(byQa(page, 'companies.merge.disclaimer')).toBeVisible({ timeout: 30_000 })
    } finally {
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})

test('#153 import: cancel on the wizard returns to the companies list', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-import-cancel')
    try {
        await grantCompaniesImport(page, pid)
        await useProject(pid)
        await page.goto('/companies/import')
        await expect(byQa(page, 'companies.import.cancel')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.import.cancel').click()
        await expect(page).toHaveURL(/\/companies$/, { timeout: 20_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#32 list: hiddenByPolicy banner shows when the API reports hidden rows', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-hidden-policy')
    try {
        await page.route('**/v1/companies?**', async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue()
                return
            }
            const upstream = await route.fetch()
            const body = (await upstream.json()) as Record<string, unknown>
            await route.fulfill({
                status: upstream.status(),
                contentType: 'application/json',
                body: JSON.stringify({ ...body, hiddenByPolicy: 3 }),
            })
        })

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.hiddenByPolicy', { count: 3 })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#49 create: server error keeps the drawer form and shows an error message', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-create-err')
    const name = uniqueName('co-create-err-name')
    try {
        await page.route('**/v1/companies**', async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({ status: 500, body: '{"error":"fail"}' })
                return
            }
            await route.continue()
        })

        await page.goto('/companies')
        await byQa(page, 'companies.list.create').click()
        await byQa(page, 'companies.create.name').fill(name)
        await byQa(page, 'companies.create.submit').click()
        await expect(byQa(page, 'companies.create.error')).toBeVisible({ timeout: 20_000 })
        await expect(byQa(page, 'companies.create.name')).toHaveValue(name)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#61 list: export failure shows a toast and leaves the list visible', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-export-err')
    try {
        await grantCompaniesExport(page, pid)
        await useProject(pid)
        await page.route('**/v1/companies/export?**', async (route) => {
            await route.fulfill({ status: 500, body: 'error' })
        })

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.export')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.list.export').click()
        await expect(page.getByText('Не удалось сформировать файл экспорта')).toBeVisible({
            timeout: 20_000,
        })
        await expect(byQa(page, 'companies.list.emptyNone')).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#63 list: bulk delete reports partial success when one delete fails', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-bulk-partial')
    const ids: string[] = []
    try {
        ids.push(await api.createCompany(pid, { name: uniqueName('co-bulk-partial-a') }))
        ids.push(await api.createCompany(pid, { name: uniqueName('co-bulk-partial-b') }))
        await page.route(`**/v1/companies/${ids[1]}?**`, async (route) => {
            if (route.request().method() === 'DELETE') {
                await route.fulfill({ status: 500, body: '{"error":"fail"}' })
                return
            }
            await route.continue()
        })

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row', { company: ids[0] })).toBeVisible({
            timeout: 30_000,
        })
        await selectRow(byQa(page, 'companies.list.row', { company: ids[0] }))
        await selectRow(byQa(page, 'companies.list.row', { company: ids[1] }))
        await byQa(page, 'companies.list.bulkDelete').click()
        await byQa(page, 'companies.list.bulkDeleteConfirm').click()
        await expect(page.getByText(/Удалено: 1, не удалось: 1/)).toBeVisible({ timeout: 20_000 })
    } finally {
        for (const id of ids) await api.deleteCompany(pid, id)
        await api.archiveProject(pid)
    }
})

test('#64 list: bulk delete dialog cancel keeps the selected companies', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await seedProject(api, useProject, 'co-bulk-cancel')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-bulk-cancel-co') })

        await page.goto('/companies')
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible({
            timeout: 30_000,
        })
        await selectRow(byQa(page, 'companies.list.row', { company: companyId }))
        await byQa(page, 'companies.list.bulkDelete').click()
        await expect(byQa(page, 'companies.list.bulkDeleteDialog')).toBeVisible()
        await byQa(page, 'companies.list.bulkDeleteCancel').click()
        await expect(byQa(page, 'companies.list.bulkDeleteDialog')).toHaveCount(0)
        await expect(byQa(page, 'companies.list.row', { company: companyId })).toBeVisible()
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#84 card: print action invokes window.print', async ({ page, api, useProject }) => {
    const pid = await seedProject(api, useProject, 'co-print')
    let companyId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-print-co') })
        await page.addInitScript(() => {
            ;(window as Window & { __printed?: boolean }).__printed = false
            window.print = () => {
                ;(window as Window & { __printed?: boolean }).__printed = true
            }
        })

        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.card.print')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'companies.card.print').click()
        expect(
            await page.evaluate(() => (window as Window & { __printed?: boolean }).__printed),
        ).toBe(true)
    } finally {
        if (companyId) await api.deleteCompany(pid, companyId)
        await api.archiveProject(pid)
    }
})

test('#147 import: empty file shows a step-1 error and stays on upload', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await createProjectOnly(api, 'co-import-empty')
    try {
        await grantCompaniesImport(page, pid)
        await useProject(pid)
        await page.goto('/companies/import')
        await expect(byQa(page, 'companies.import.file')).toBeAttached({ timeout: 30_000 })
        await byQa(page, 'companies.import.file').setInputFiles({
            name: 'empty.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(''),
        })
        await byQa(page, 'companies.import.next', { step: 1 }).click()
        await expect(byQa(page, 'companies.import.fileError')).toContainText(
            'Файл пуст или не удалось прочитать данные',
            { timeout: 20_000 },
        )
        await expect(byQa(page, 'companies.import.step', { step: 1, state: 'current' })).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})
