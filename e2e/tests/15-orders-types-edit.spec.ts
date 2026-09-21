import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { seedOrdersProject, orderTypePayload } from '../support/orders-seed'

/**
 * P0 catalog: #122, #128, #130, #132, #141, #142, #113
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products'] })

const modules = ['deals', 'contacts', 'orders', 'products']

test.describe('orders types', () => {
    test('#122 types list loads from API', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders/types')
            await expect(byQa(page, 'orders.types.list')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'orders.types.edit', { type: seed.typeA.id })).toBeVisible()
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#128 edit navigates to type form', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        await useProject(seed.projectId, modules)

        try {
            await page.goto('/orders/types')
            await byQa(page, 'orders.types.edit', { type: seed.typeA.id }).click()
            await expect(page).toHaveURL(new RegExp(`/orders/types/${seed.typeA.id}/edit`))
            await expect(byQa(page, 'orders.typeForm.name')).toBeVisible({ timeout: 15_000 })
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#130 create type happy path', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('types-new'), modules)
        await useProject(pid, modules)

        try {
            await page.goto('/orders/types/new')
            await byQa(page, 'orders.typeForm.name').fill(uniqueName('new-type'))
            await byQa(page, 'orders.typeForm.addStage').click()
            const createReq = page.waitForResponse(
                (r) => r.url().includes('/v1/order-types') && r.request().method() === 'POST',
            )
            await byQa(page, 'orders.typeForm.save').click()
            const res = await createReq
            expect(res.ok(), `create type ${res.status()}`).toBeTruthy()
            await expect(page).toHaveURL(/\/orders\/types/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#141+#142 edit existing type loads revision and save creates new one', async ({
        page,
        api,
        useProject,
    }) => {
        const seed = await seedOrdersProject(api, modules)
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders/types/${seed.typeA.id}/edit`)
            await expect(byQa(page, 'orders.typeForm.name')).toHaveValue(seed.typeA.name, {
                timeout: 15_000,
            })
            const saveReq = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/order-types/${seed.typeA.id}`) &&
                    r.request().method() === 'PUT',
            )
            await byQa(page, 'orders.typeForm.save').click()
            const res = await saveReq
            expect(res.ok(), `update type ${res.status()}`).toBeTruthy()
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#113 edit order fields and save', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const typeId = await api.createOrderType(
            seed.projectId,
            orderTypePayload(uniqueName('typed-fields'), 'sf1', 'sf2'),
        )
        const orderId = await api.createOrder(seed.projectId, {
            dealId: seed.wonDealId,
            orderTypeId: typeId,
            contactId: seed.contactId,
            companyId: seed.companyId,
        })
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders/${orderId}/edit`)
            await expect(byQa(page, 'orders.edit.save')).toBeVisible({ timeout: 30_000 })
            const saveReq = page.waitForResponse(
                (r) => r.url().includes(`/v1/orders/${orderId}`) && r.request().method() === 'PUT',
            )
            await byQa(page, 'orders.edit.save').click()
            await saveReq
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })
})
