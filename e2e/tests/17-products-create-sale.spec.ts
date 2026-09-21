import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { PRODUCT_MODULES, PRODUCTS_FORBIDDEN_ALLOW } from '../support/products'

test.use({ forbiddenAllow: [...PRODUCTS_FORBIDDEN_ALLOW] })

/** Catalog #122/#123 — «Создать продажу» → /orders?productId=… */
test('#122/#123 create sale: button navigates to orders with productId', async ({
    page,
    api,
    useProject,
}) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-sale'), modules)
    await useProject(pid, modules)
    const ot = await api.createOrderType(pid, uniqueName('sale-ot'))
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, {
            name: uniqueName('sale'),
            orderTypeId: ot.id,
            orderTypeName: ot.name,
        })
        await page.goto(`/products/${productId}`)
        await expect(byQa(page, 'products.details.createSale')).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'products.details.createSale').click()
        await expect(page).toHaveURL(new RegExp(`/orders\\?productId=${productId}`))
    } finally {
        if (productId) {
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
