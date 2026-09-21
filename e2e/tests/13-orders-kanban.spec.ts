import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { pickSelectByKeyboard } from '../support/select'
import { seedOrdersProject, seedActiveOrder } from '../support/orders-seed'

/**
 * P0 catalog: #63, #64, #65
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products'] })

const modules = ['deals', 'contacts', 'orders', 'products']

test.describe('orders kanban', () => {
    test('#63 open kanban card navigates to order details', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orderId = await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders/kanban')
            await expect(byQa(page, 'orders.kanban.card', { order: orderId })).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'orders.kanban.card', { order: orderId }).click()
            await expect(page).toHaveURL(new RegExp(`/orders/${orderId}`))
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#64 type selector changes kanban columns', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        await seedActiveOrder(api, seed)
        await api.createOrder(seed.projectId, {
            dealId: seed.wonDealId,
            orderTypeId: seed.typeB.id,
            contactId: seed.contactId,
            companyId: seed.companyId,
        })
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders/kanban')
            await expect(byQa(page, 'orders.kanban.typeSelect')).toBeVisible({ timeout: 30_000 })
            const kanbanReq = page.waitForResponse(
                (r) => r.url().includes('/v1/orders/kanban') && r.url().includes(`typeId=${seed.typeB.id}`),
            )
            await pickSelectByKeyboard(page, 'orders.kanban.typeSelect', 2)
            await kanbanReq
            await expect(byQa(page, 'orders.kanban.column', { stage: seed.typeB.stageStartId })).toBeVisible()
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#65 drag card to next stage persists move', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orderId = await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders/kanban')
            const card = byQa(page, 'orders.kanban.card', { order: orderId })
            await expect(card).toBeVisible({ timeout: 30_000 })

            const targetCol = byQa(page, 'orders.kanban.column', { stage: seed.typeA.stageDoneId })
            await expect(targetCol).toBeVisible()

            const moveReq = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/orders/${orderId}/stage`) && r.request().method() === 'PUT',
            )
            await card.dragTo(targetCol)
            const res = await moveReq
            expect(res.ok(), `move stage ${res.status()}`).toBeTruthy()
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })
})
