import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { PRODUCT_MODULES, PRODUCTS_FORBIDDEN_ALLOW } from '../support/products'

test.use({ forbiddenAllow: [...PRODUCTS_FORBIDDEN_ALLOW] })

/** Catalog #108–#111 — pricing table load, inline edit, bulk save */
test('#108–#111 pricing: inline edit name/price and save changes', async ({
    page,
    api,
    useProject,
}) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-price'), modules)
    await useProject(pid, modules)
    const name = uniqueName('price')
    const newName = uniqueName('priced')
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, { name, price: 1000 })
        await page.goto('/products/pricing')
        await expect(byQa(page, 'products.pricing.table')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'products.pricing.row', { product: productId! })).toBeVisible()

        await byQa(page, 'products.pricing.nameCell', { product: productId! }).click()
        await byQa(page, 'products.pricing.nameInput', { product: productId! }).fill(newName)

        await byQa(page, 'products.pricing.priceCell', { product: productId! }).click()
        await byQa(page, 'products.pricing.priceInput', { product: productId! }).fill('2000')

        const saveResponse = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/products/${productId}`) && r.request().method() === 'PUT',
            { timeout: 20_000 },
        )
        await byQa(page, 'products.pricing.save').click()
        expect((await saveResponse).ok()).toBeTruthy()

        await page.goto(`/products/${productId}`)
        await expect(byQa(page, 'products.details.name')).toContainText(newName)
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
