import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { pickSelectByKeyboard } from '../support/select'
import { seedOrdersProject, seedActiveOrder } from '../support/orders-seed'

/**
 * P0 catalog: #5, #12, #14, #15, #26, #28, #29, #31, #33, #34
 * P1 catalog: #31, #33 (also listed as P1 in combo section — covered here)
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products'] })

const modules = ['deals', 'contacts', 'orders', 'products']

test.describe('orders list', () => {
    test('#12 happy path: list row opens order card', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orderId = await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders')
            await expect(byQa(page, 'orders.list.row', { order: orderId })).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'orders.list.row', { order: orderId }).click()
            await expect(page).toHaveURL(new RegExp(`/orders/${orderId}`))
            await expect(byQa(page, 'orders.details.progress')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#26 search by order number narrows list', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orderId = await seedActiveOrder(api, seed)
        await seedActiveOrder(api, seed)
        const order = await api.getOrder(seed.projectId, orderId)
        const number = String(order.number ?? '')
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders')
            await expect(byQa(page, 'orders.list.row', { order: orderId })).toBeVisible({
                timeout: 30_000,
            })
            const listReq = page.waitForResponse(
                (r) => r.url().includes('/v1/orders') && r.request().method() === 'GET',
            )
            await byQa(page, 'orders.list.search').fill(number.slice(0, Math.max(4, number.length - 2)))
            await listReq
            await expect(byQa(page, 'orders.list.row', { order: orderId })).toBeVisible()
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#28 filter by order type refetches with typeId', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orderA = await seedActiveOrder(api, seed)
        await api.createOrder(seed.projectId, {
            dealId: seed.wonDealId,
            orderTypeId: seed.typeB.id,
            contactId: seed.contactId,
            companyId: seed.companyId,
        })
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders')
            await expect(byQa(page, 'orders.list.row', { order: orderA })).toBeVisible({
                timeout: 30_000,
            })
            const filtered = page.waitForResponse(
                (r) =>
                    r.url().includes('/v1/orders') &&
                    r.url().includes(`typeId=${seed.typeA.id}`) &&
                    r.request().method() === 'GET',
            )
            await pickSelectByKeyboard(page, 'orders.list.filterType', 1)
            await filtered
            await expect(byQa(page, 'orders.list.row', { order: orderA })).toBeVisible()
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#29 status filter refetches with status', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const activeId = await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders')
            await expect(byQa(page, 'orders.list.row', { order: activeId })).toBeVisible({
                timeout: 30_000,
            })
            const filtered = page.waitForResponse(
                (r) => r.url().includes('/v1/orders') && r.url().includes('status=ACTIVE'),
            )
            await pickSelectByKeyboard(page, 'orders.list.filterStatus', 1)
            await filtered
            await expect(byQa(page, 'orders.list.row', { order: activeId })).toBeVisible()
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#34 server export by filters triggers download request', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders')
            await expect(byQa(page, 'orders.list.export')).toBeVisible({ timeout: 30_000 })

            const exportReq = page.waitForResponse(
                (r) => r.url().includes('/v1/orders/export') && r.request().method() === 'GET',
            )
            await byQa(page, 'orders.list.export').click()
            await byQa(page, 'orders.list.exportFiltered').click()
            const res = await exportReq
            expect(res.ok(), `export status ${res.status()}`).toBeTruthy()
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#5 module disabled shows graceful notice on list', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('ord-off'), ['deals', 'contacts'])
        await useProject(pid, ['deals', 'contacts'])

        try {
            await page.goto('/orders')
            await expect(byQa(page, 'orders.list.moduleDisabled')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'orders.list.retry')).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#15 empty project shows ST-3 with create CTA', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('ord-empty'), modules)
        await useProject(pid, modules)

        try {
            await page.goto('/orders')
            await expect(byQa(page, 'orders.list.empty')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'orders.list.createEmpty')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#31+#33 incompatible filters ST-4 then reset restores list', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders')
            await byQa(page, 'orders.list.search').fill(uniqueName('nope-nomatch'))
            await expect(byQa(page, 'orders.list.resetFilters')).toBeVisible({ timeout: 30_000 })
            await byQa(page, 'orders.list.resetFilters').click()
            await expect(byQa(page, 'orders.list.empty')).toHaveCount(0)
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#14 load error shows retry control', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders')
            await expect(byQa(page, 'orders.list.search')).toBeVisible({ timeout: 30_000 })

            await page.route('**/v1/orders?**', (route) => route.fulfill({ status: 500, body: '{}' }))
            await page.reload()
            await expect(byQa(page, 'orders.list.retry')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })
})
