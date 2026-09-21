import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { pickSelectByKeyboard } from '../support/select'
import { seedOrdersProject, seedActiveOrder } from '../support/orders-seed'

/**
 * P0 catalog: #76, #79, #84, #94, #102, #104, #109, #87
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products'] })

const modules = ['deals', 'contacts', 'orders', 'products']

test.describe('orders details lifecycle', () => {
    test('#76 details shows progress for pinned type revision', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orderId = await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders/${orderId}`)
            await expect(byQa(page, 'orders.details.progress')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'orders.details.tabInfo')).toBeVisible()
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#79 info tab links are present', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orderId = await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders/${orderId}`)
            await byQa(page, 'orders.details.tabInfo').click()
            await expect(byQa(page, 'orders.details.info.dealLink')).toBeVisible({ timeout: 15_000 })
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#84 header move select changes stage', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orderId = await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders/${orderId}`)
            await expect(byQa(page, 'orders.details.header.moveStage')).toBeVisible({
                timeout: 30_000,
            })
            const moveReq = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/orders/${orderId}/stage`) && r.request().method() === 'PUT',
            )
            await pickSelectByKeyboard(page, 'orders.details.header.moveStage', 2)
            const res = await moveReq
            expect(res.ok(), `move ${res.status()}`).toBeTruthy()
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#87 terminal none finalAction sets DONE on last stage move', async ({
        page,
        api,
        useProject,
    }) => {
        const seed = await seedOrdersProject(api, modules)
        const orderId = await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders/${orderId}`)
            const moveReq = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/orders/${orderId}/stage`) && r.request().method() === 'PUT',
            )
            await pickSelectByKeyboard(page, 'orders.details.header.moveStage', 2)
            const res = await moveReq
            expect(res.ok(), `terminal move ${res.status()}`).toBeTruthy()
            const order = await api.getOrder(seed.projectId, orderId)
            expect(order.status).toBe('DONE')
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#102 drift banner visible when hasDrift', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orderId = await seedActiveOrder(api, seed)
        // Simulate drift flag if backend supports patching; otherwise skip when not drifted.
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders/${orderId}`)
            const order = await api.getOrder(seed.projectId, orderId)
            test.skip(!order.hasDrift, 'stand has no drift pipeline for seeded order')
            await expect(byQa(page, 'orders.details.driftBanner')).toBeVisible({ timeout: 15_000 })
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#104 accept drift clears banner', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orderId = await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders/${orderId}`)
            const order = await api.getOrder(seed.projectId, orderId)
            test.skip(!order.hasDrift, 'stand has no drift for accept flow')

            const acceptReq = page.waitForResponse(
                (r) => r.url().includes('/accept-drift') && r.request().method() === 'POST',
            )
            await byQa(page, 'orders.details.driftAccept').click()
            await acceptReq
            await expect(byQa(page, 'orders.details.driftBanner')).toHaveCount(0)
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#109 cancel active order via confirm', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orderId = await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders/${orderId}`)
            page.once('dialog', (d) => d.accept())
            const cancelReq = page.waitForResponse(
                (r) => r.url().includes('/cancel') && r.request().method() === 'POST',
            )
            await byQa(page, 'orders.details.cancel').click()
            await cancelReq
            const order = await api.getOrder(seed.projectId, orderId)
            expect(order.status).toBe('CANCELLED')
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#94 SEND_ERROR banner when order in error state', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orders = await api.listOrders(seed.projectId, { status: 'SEND_ERROR' })
        test.skip(orders.length === 0, 'no SEND_ERROR orders on stand to assert banner')
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders/${orders[0].id}`)
            await expect(byQa(page, 'orders.details.sendErrorBanner')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })
})
