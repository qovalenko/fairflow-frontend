import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName, DATA_PREFIX } from '../support/env'
import { DEALS_MODULES, gotoDealsList, countDealRows, pickSelectOption } from '../support/deals'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

/** #12 list load; #16 search; #21 status filter; #24 only-mine; #27 pagination; #34 row click. */
test.describe('deals list', () => {
    test('#12: successful load with name column and rows', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('deals-list'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        const names = [uniqueName('d1'), uniqueName('d2')]
        const ids: string[] = []
        try {
            for (const n of names) {
                const d = await api.seedOpenDeal(pid, n)
                ids.push(d.id)
            }
            await gotoDealsList(page)
            await expect(byQa(page, 'deals.list.table')).toBeVisible({ timeout: 30_000 })
            for (const id of ids) {
                await expect(byQa(page, 'deals.list.row', { deal: id })).toBeVisible()
            }
        } finally {
            for (const id of ids) await api.deleteDeal(pid, id).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#16: server search narrows list', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('deals-search'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        const needle = uniqueName('findme')
        const other = uniqueName('other')
        let idNeedle: string | undefined
        let idOther: string | undefined
        try {
            idNeedle = (await api.seedOpenDeal(pid, needle)).id
            idOther = (await api.seedOpenDeal(pid, other)).id
            await gotoDealsList(page)
            await byQa(page, 'deals.list.search').fill(needle)
            await expect(byQa(page, 'deals.list.row', { deal: idNeedle! })).toBeVisible({
                timeout: 20_000,
            })
            await expect(byQa(page, 'deals.list.row', { deal: idOther! })).toHaveCount(0)
        } finally {
            if (idNeedle) await api.deleteDeal(pid, idNeedle).catch(() => {})
            if (idOther) await api.deleteDeal(pid, idOther).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#21: status filter via UI select', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('deals-status'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let openId: string | undefined
        let wonId: string | undefined
        try {
            openId = (await api.seedOpenDeal(pid, uniqueName('open'))).id
            wonId = (await api.seedOpenDeal(pid, uniqueName('won'))).id
            await api.closeDeal(pid, wonId, 'won')
            await gotoDealsList(page)
            await pickSelectOption(page, 'deals.list.filter.status', 'won')
            await expect(byQa(page, 'deals.list.row', { deal: wonId! })).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'deals.list.row', { deal: openId! })).toHaveCount(0)
        } finally {
            if (openId) await api.deleteDeal(pid, openId).catch(() => {})
            if (wonId) await api.deleteDeal(pid, wonId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#24: only-mine toggle filters assignee', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('deals-mine'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        const mineName = uniqueName('mine')
        const otherName = uniqueName('other')
        let mineId: string | undefined
        let otherId: string | undefined
        try {
            mineId = (await api.seedOpenDeal(pid, mineName, { assigneeId: api.userId })).id
            otherId = (await api.seedOpenDeal(pid, otherName)).id
            await gotoDealsList(page)
            await byQa(page, 'deals.list.only-mine').click()
            await expect(byQa(page, 'deals.list.row', { deal: mineId! })).toBeVisible({
                timeout: 20_000,
            })
            await expect(byQa(page, 'deals.list.row', { deal: otherId! })).toHaveCount(0)
        } finally {
            if (mineId) await api.deleteDeal(pid, mineId).catch(() => {})
            if (otherId) await api.deleteDeal(pid, otherId).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#27: pagination: page 2 loads next slice', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('deals-page'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        const ids: string[] = []
        try {
            for (let i = 0; i < 11; i++) {
                ids.push((await api.seedOpenDeal(pid, `${DATA_PREFIX}page-${i}`)).id)
            }
            await gotoDealsList(page)
            const firstPageCount = await countDealRows(page)
            expect(firstPageCount).toBeLessThanOrEqual(10)
            expect(firstPageCount).toBeGreaterThan(0)
            const firstId = ids[0]
            await expect(byQa(page, 'deals.list.row', { deal: firstId })).toBeVisible()

            await byQa(page, 'deals.list.pagination.next').click()
            await expect(byQa(page, 'deals.list.row', { deal: firstId })).toHaveCount(0, {
                timeout: 20_000,
            })
            const secondPageCount = await countDealRows(page)
            expect(secondPageCount).toBeGreaterThan(0)
        } finally {
            for (const id of ids) await api.deleteDeal(pid, id).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#34: row click navigates to deal card', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('deals-row'), [...DEALS_MODULES])
        await useProject(pid, [...DEALS_MODULES])
        let dealId: string | undefined
        try {
            dealId = (await api.seedOpenDeal(pid, uniqueName('rowclick'))).id
            await gotoDealsList(page)
            await byQa(page, 'deals.list.row', { deal: dealId! }).click()
            await expect(page).toHaveURL(new RegExp(`/deals/${dealId}`))
            await expect(byQa(page, 'deals.details.edit')).toBeVisible({ timeout: 30_000 })
        } finally {
            if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})
