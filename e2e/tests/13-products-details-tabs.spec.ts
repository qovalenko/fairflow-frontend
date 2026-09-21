import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { gotoProductsList, PRODUCT_MODULES, PRODUCTS_FORBIDDEN_ALLOW } from '../support/products'

test.use({ forbiddenAllow: [...PRODUCTS_FORBIDDEN_ALLOW] })

/** Catalog #43/#44 — табы «Каталог» ↔ «Цены» */
test('#43/#44 tabs: catalog and pricing navigation', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-tabs'), modules)
    await useProject(pid, modules)

    try {
        await gotoProductsList(page)
        await expect(byQa(page, 'products.tabs.catalog')).toBeVisible()
        await byQa(page, 'products.tabs.pricing').click()
        await expect(page).toHaveURL(/\/products\/pricing/)
        await expect(byQa(page, 'products.pricing')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'products.tabs.catalog').click()
        await expect(page).toHaveURL(/\/products\/?$/)
    } finally {
        await api.archiveProject(pid)
    }
})

/** Catalog #47 — просмотр атрибутов на DETAILS */
test('#47 details: shows price, unit, order type, dates', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-view'), modules)
    await useProject(pid, modules)
    const ot = await api.createOrderType(pid, uniqueName('ot'))
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, {
            name: uniqueName('view'),
            price: 5000,
            orderTypeId: ot.id,
            orderTypeName: ot.name,
        })
        await page.goto(`/products/${productId}`)
        await expect(byQa(page, 'products.details')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'products.details.price')).toBeVisible()
        await expect(byQa(page, 'products.details.unit')).toBeVisible()
        await expect(byQa(page, 'products.details.orderType')).toContainText(ot.name)
        await expect(byQa(page, 'products.details.createdAt')).toBeVisible()
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

/** Catalog #51 — host HeaderBackButton → LIST */
test('#51 details: header back navigates to catalog list', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-back'), modules)
    await useProject(pid, modules)
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, { name: uniqueName('back') })
        await page.goto(`/products/${productId}`)
        await expect(byQa(page, 'products.details')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'host.header.back').click()
        await expect(page).toHaveURL(/\/products\/?$/)
        await expect(byQa(page, 'products.list')).toBeVisible()
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

/** Catalog #57 — archived banner + restore button */
test('#57 details: archived product shows banner and restore', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-archdet'), modules)
    await useProject(pid, modules)
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, { name: uniqueName('archdet') })
        await api.archiveProduct(pid, productId)
        await page.goto(`/products/${productId}`)
        await expect(byQa(page, 'products.details.archiveBanner')).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'products.details.restore')).toBeVisible()
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

/** Catalog #58 — dangling banner + reassign */
test('#58 details: dangling product shows amber banner', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-dang'), modules)
    await useProject(pid, modules)
    const ot = await api.createOrderType(pid, uniqueName('dang-ot'))
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, {
            name: uniqueName('dang'),
            orderTypeId: ot.id,
            orderTypeName: ot.name,
        })
        await api.deleteOrderType(pid, ot.id)

        await page.goto(`/products/${productId}`)
        await expect(byQa(page, 'products.details.danglingBanner')).toBeVisible({
            timeout: 30_000,
        })
        await expect(byQa(page, 'products.details.reassignType')).toBeVisible()
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

/** Catalog #59 — «Редактировать» → edit route */
test('#59 details: edit button opens edit form', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-editbtn'), modules)
    await useProject(pid, modules)
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, { name: uniqueName('editbtn') })
        await page.goto(`/products/${productId}`)
        await byQa(page, 'products.details.edit').click()
        await expect(page).toHaveURL(new RegExp(`/products/${productId}/edit`))
        await expect(byQa(page, 'products.edit')).toBeVisible({ timeout: 30_000 })
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
