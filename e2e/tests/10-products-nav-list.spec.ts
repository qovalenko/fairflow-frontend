import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { gotoProductsList, PRODUCT_MODULES, PRODUCTS_FORBIDDEN_ALLOW } from '../support/products'

test.use({ forbiddenAllow: [...PRODUCTS_FORBIDDEN_ALLOW] })

/** Catalog #1 — открыть «Портфель → Продукты», загрузка каталога /products */
test('#1 nav: sidebar opens products catalog with catalog tab active', async ({
    page,
    api,
    useProject,
}) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-nav'), modules)
    await useProject(pid, modules)

    try {
        await page.goto(`/p/${pid}`)
        await byQa(page, 'host.sidebar.item', { nav: 'portfolio.products' }).click()
        await expect(page).toHaveURL(/\/products\/?$/)
        await expect(byQa(page, 'products.list')).toBeVisible({ timeout: 30_000 })
        /** Catalog #43 — таб «Каталог» активен на /products */
        await expect(byQa(page, 'products.tabs.catalog')).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

/** Catalog #24 — клик по карточке → /products/:id */
test('#24 list: clicking a product card opens details', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-card'), modules)
    await useProject(pid, modules)
    const name = uniqueName('card')
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, { name, price: 1000 })
        await gotoProductsList(page)
        await byQa(page, 'products.list.card', { product: productId }).click()
        await expect(page).toHaveURL(new RegExp(`/products/${productId}$`))
        await expect(byQa(page, 'products.details.name')).toContainText(name)
    } finally {
        if (productId) {
            try {
                await api.deleteProduct(pid, productId)
            } catch {
                /* archived or linked */
            }
        }
        await api.archiveProject(pid)
    }
})
