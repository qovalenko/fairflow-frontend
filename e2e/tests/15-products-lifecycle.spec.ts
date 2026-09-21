import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { gotoProductsList, PRODUCT_MODULES, PRODUCTS_FORBIDDEN_ALLOW } from '../support/products'

test.use({ forbiddenAllow: [...PRODUCTS_FORBIDDEN_ALLOW] })

/** Catalog #89 — «В архив» → dialog → LIST */
test('#89 archive: confirm dialog archives and redirects to list', async ({
    page,
    api,
    useProject,
}) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-arch'), modules)
    await useProject(pid, modules)
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, { name: uniqueName('arch') })
        await page.goto(`/products/${productId}`)
        await byQa(page, 'products.details.archive').click()
        await expect(byQa(page, 'products.dialog.archive')).toBeVisible()
        const archiveResponse = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/products/${productId}/archive`) &&
                r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'products.dialog.archive.confirm').click()
        expect((await archiveResponse).ok()).toBeTruthy()
        await expect(page).toHaveURL(/\/products\/?$/)
    } finally {
        if (productId) {
            try {
                await api.restoreProduct(pid, productId)
                await api.deleteProduct(pid, productId)
            } catch {
                /* ignore */
            }
        }
        await api.archiveProject(pid)
    }
})

/** Catalog #97 — hard delete без ссылок → LIST */
test('#97 delete: hard delete removes product and returns to list', async ({
    page,
    api,
    useProject,
}) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-del'), modules)
    await useProject(pid, modules)
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, { name: uniqueName('del') })
        await page.goto(`/products/${productId}`)
        await byQa(page, 'products.details.delete').click()
        await expect(byQa(page, 'products.dialog.delete')).toBeVisible()
        const deleteResponse = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/products/${productId}`) &&
                r.request().method() === 'DELETE',
            { timeout: 20_000 },
        )
        await byQa(page, 'products.dialog.delete.confirm').click()
        const res = await deleteResponse
        expect(res.ok() || res.status() === 422, `delete (${res.status()})`).toBeTruthy()
        await expect(page).toHaveURL(/\/products\/?$/)
        productId = undefined
    } finally {
        if (productId) {
            try {
                await api.deleteProduct(pid, productId)
            } catch {
                /* ignore */
            }
        }
        await api.archiveProject(pid)
    }
})

/** Catalog #98 — hard delete при ссылках → archive dialog (422 path) */
test('#98 delete blocked: linked product opens archive dialog on delete', async ({
    page,
    api,
    useProject,
}) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-del422'), modules)
    await useProject(pid, modules)
    const ot = await api.createOrderType(pid, uniqueName('del-ot'))
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, {
            name: uniqueName('linked'),
            orderTypeId: ot.id,
            orderTypeName: ot.name,
        })
        await api.createDeal(pid, { name: uniqueName('deal'), productId })

        await page.goto(`/products/${productId}`)
        await byQa(page, 'products.details.delete').click()
        await byQa(page, 'products.dialog.delete.confirm').click()
        await expect(byQa(page, 'products.dialog.archive')).toBeVisible({ timeout: 20_000 })
    } finally {
        if (productId) {
            try {
                await api.archiveProduct(pid, productId)
            } catch {
                /* ignore */
            }
            try {
                await api.deleteProduct(pid, productId)
            } catch {
                /* ignore */
            }
        }
        try {
            await api.deleteOrderType(pid, ot.id)
        } catch {
            /* ignore */
        }
        await api.archiveProject(pid)
    }
})

/** Catalog #103 — restore archived product */
test('#103 restore: archived details → dialog → active', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-rest'), modules)
    await useProject(pid, modules)
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, { name: uniqueName('rest') })
        await api.archiveProduct(pid, productId)
        await page.goto(`/products/${productId}`)
        await byQa(page, 'products.details.restore').click()
        await expect(byQa(page, 'products.dialog.restore')).toBeVisible()
        const restoreResponse = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/products/${productId}/restore`) &&
                r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'products.dialog.restore.confirm').click()
        expect((await restoreResponse).ok()).toBeTruthy()
        await expect(byQa(page, 'products.details.archiveBanner')).toHaveCount(0)
    } finally {
        if (productId) {
            try {
                await api.deleteProduct(pid, productId)
            } catch {
                /* ignore */
            }
        }
        await api.archiveProject(pid)
    }
})
