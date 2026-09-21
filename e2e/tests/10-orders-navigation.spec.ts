import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { seedOrdersProject, seedActiveOrder } from '../support/orders-seed'

/**
 * P0 catalog: #1 (menu), #17 (list↔kanban), #18 (types gear)
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products'] })

test.describe('orders navigation', () => {
    test('#1 open orders from portfolio sidebar', async ({ page, api, useProject }) => {
        const modules = ['deals', 'contacts', 'orders']
        const seed = await seedOrdersProject(api, modules)
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/p/${seed.projectId}`)
            await byQa(page, 'host.sidebar.item', { nav: 'portfolio.orders' }).click()
            await expect(page).toHaveURL(/\/orders\/?$/, { timeout: 30_000 })
            await expect(byQa(page, 'orders.list.search')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#17 list ↔ kanban segment keeps project context', async ({ page, api, useProject }) => {
        const modules = ['deals', 'contacts', 'orders']
        const seed = await seedOrdersProject(api, modules)
        await seedActiveOrder(api, seed)
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders')
            await expect(byQa(page, 'orders.list.viewKanban')).toBeVisible({ timeout: 30_000 })
            await byQa(page, 'orders.list.viewKanban').click()
            await expect(page).toHaveURL(/\/orders\/kanban/)
            await expect(byQa(page, 'orders.kanban.typeSelect')).toBeVisible({ timeout: 30_000 })

            await byQa(page, 'orders.list.viewList').click()
            await expect(page).toHaveURL(/\/orders\/?$/)
            await expect(byQa(page, 'orders.list.search')).toBeVisible()
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#18 gear navigates to order types', async ({ page, api, useProject }) => {
        const modules = ['deals', 'contacts', 'orders']
        const seed = await seedOrdersProject(api, modules)
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders')
            await byQa(page, 'orders.list.typesGear').click()
            await expect(page).toHaveURL(/\/orders\/types/)
            await expect(byQa(page, 'orders.types.list')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })
})
