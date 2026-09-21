import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { pickSelectByKeyboard } from '../support/select'
import { seedOrdersProject, seedActiveOrder } from '../support/orders-seed'

/**
 * P0 catalog: #42, #46, #51, #52, #57, #59
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

const modules = ['deals', 'contacts', 'orders', 'products']

test.describe('orders create flows', () => {
    test('#42 create order from list drawer', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders')
            await byQa(page, 'orders.list.create').click()
            await expect(byQa(page, 'orders.create.orderType')).toBeVisible({ timeout: 15_000 })
            await pickSelectByKeyboard(page, 'orders.create.orderType', 1)
            await pickSelectByKeyboard(page, 'orders.create.deal', 1)

            const createReq = page.waitForResponse(
                (r) => r.url().includes('/v1/orders') && r.request().method() === 'POST',
            )
            await byQa(page, 'orders.create.submit').click()
            const res = await createReq
            expect(res.ok(), `create order ${res.status()}`).toBeTruthy()
            const body = (await res.json()) as { id?: string }
            if (body.id) {
                await expect(byQa(page, 'orders.list.row', { order: body.id })).toBeVisible({
                    timeout: 30_000,
                })
            }
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#46 dealId deep-link opens drawer with prefill', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders?dealId=${seed.wonDealId}`)
            await expect(byQa(page, 'orders.create.deal')).toBeVisible({ timeout: 15_000 })
            expect(page.url()).not.toContain('dealId=')
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#51 multi=1 opens MultiCreateWizard', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders?dealId=${seed.wonDealId}&multi=1`)
            await expect(byQa(page, 'orders.multiCreate.dialog')).toBeVisible({ timeout: 15_000 })
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#52 batch create all posts batch endpoint', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders?dealId=${seed.wonDealId}&multi=1`)
            await expect(byQa(page, 'orders.multiCreate.dialog')).toBeVisible({ timeout: 15_000 })

            await pickSelectByKeyboard(page, 'orders.multiCreate.productSelect', 1, { index: 0 })

            const batchReq = page.waitForResponse(
                (r) => r.url().includes('/v1/orders/batch') && r.request().method() === 'POST',
            )
            await byQa(page, 'orders.multiCreate.submit').click()
            const res = await batchReq
            expect(res.ok(), `batch ${res.status()}`).toBeTruthy()
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#57 won deal HostSlot create navigates to orders with dealId', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/deals/${seed.wonDealId}`)
            await expect(byQa(page, 'orders.dealCreateAction.button')).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'orders.dealCreateAction.button').click()
            await expect(page).toHaveURL(new RegExp(`/orders\\?dealId=${seed.wonDealId}`))
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#59 deal card orders widget drills to order card', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orderId = await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/deals/${seed.wonDealId}`)
            await expect(byQa(page, 'deals.details.orderLink', { order: orderId })).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'deals.details.orderLink', { order: orderId }).click()
            await expect(page).toHaveURL(new RegExp(`/orders/${orderId}`))
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })
})
