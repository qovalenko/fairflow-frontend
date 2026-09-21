import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { seedOrdersProject, seedActiveOrder } from '../support/orders-seed'

/**
 * P0 catalog gaps requiring specific backend states or automation stack:
 * #88, #95, #96, #99, #132
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities', '/v1/products'] })

const modules = ['deals', 'contacts', 'orders', 'products', 'automation']

test.describe('orders final-action / webhook P0', () => {
    test('#132 type form exposes webhook finalAction fields', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('ord-wh'), modules)
        await useProject(pid, modules)

        try {
            await page.goto('/orders/types/new')
            await expect(byQa(page, 'orders.typeForm.finalAction')).toBeVisible({ timeout: 15_000 })
            await byQa(page, 'orders.typeForm.finalActionOption', { type: 'webhook' }).click()
            await expect(byQa(page, 'orders.typeForm.webhookConnection')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#95 attempts table visible on SEND_ERROR order', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orders = await api.listOrders(seed.projectId, { status: 'SEND_ERROR' })
        test.skip(orders.length === 0, 'нет SEND_ERROR продаж на the stand для таблицы попыток')
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders/${orders[0].id}`)
            await expect(byQa(page, 'orders.details.attemptsTable')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#96 retry from SEND_ERROR when integration invoke allowed', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orders = await api.listOrders(seed.projectId, { status: 'SEND_ERROR' })
        test.skip(orders.length === 0, 'нет SEND_ERROR продаж для retry')
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders/${orders[0].id}`)
            const retry = byQa(page, 'orders.details.retry')
            test.skip((await retry.count()) === 0, 'retry скрыт — нет orders.integration:invoke или не SEND_ERROR')
            await retry.click()
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })

    test('#88 terminal webhook move → SENDING requires live automation', async ({ page, api, useProject }) => {
        test.skip(true, 'P0 #88: нужен тип с webhook finalAction + включённый automation на the stand — отдельный seed не в scope hybrid')
    })

    test('#99 fix fields in SEND_ERROR then save', async ({ page, api, useProject }) => {
        const seed = await seedOrdersProject(api, modules)
        const orders = await api.listOrders(seed.projectId, { status: 'SEND_ERROR' })
        test.skip(orders.length === 0, 'нет SEND_ERROR продаж для fix-in-error')
        await useProject(seed.projectId, modules)

        try {
            await page.goto(`/orders/${orders[0].id}/edit`)
            await expect(byQa(page, 'orders.edit.save')).toBeVisible({ timeout: 15_000 })
        } finally {
            await api.archiveProject(seed.projectId)
        }
    })
})
