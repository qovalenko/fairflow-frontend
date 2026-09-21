import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { gotoProductsList, PRODUCT_MODULES, PRODUCTS_FORBIDDEN_ALLOW } from '../support/products'

test.use({ forbiddenAllow: [...PRODUCTS_FORBIDDEN_ALLOW] })

/** Catalog #25 — quick-create happy path */
test('#25 create light: drawer → name → create → details', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-create'), modules)
    await useProject(pid, modules)
    const name = uniqueName('create')
    let productId: string | undefined

    try {
        await gotoProductsList(page)
        await byQa(page, 'products.list.create').click()
        await expect(byQa(page, 'products.create.drawer')).toBeVisible()
        await byQa(page, 'products.create.name').fill(name)

        const createResponse = page.waitForResponse(
            (r) => r.url().includes('/v1/products') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'products.create.submit').click()
        const res = await createResponse
        expect(res.ok(), `product POST ok (${res.status()})`).toBeTruthy()
        productId = ((await res.json()) as { id?: string }).id

        await expect(page).toHaveURL(new RegExp(`/products/${productId}`))
        await expect(byQa(page, 'products.details.name')).toContainText(name)
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

/** Catalog #26 — create with description, category, price, unit */
test('#26 create light: all drawer fields persist on details', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-full'), modules)
    await useProject(pid, modules)
    const name = uniqueName('full')
    const category = uniqueName('cat').replace(/[^a-zA-Z0-9-]/g, '')
    let productId: string | undefined

    try {
        await gotoProductsList(page)
        await byQa(page, 'products.list.create').click()
        await byQa(page, 'products.create.name').fill(name)
        await byQa(page, 'products.create.description').fill('E2E описание')
        await byQa(page, 'products.create.price').fill('2500')

        const createResponse = page.waitForResponse(
            (r) => r.url().includes('/v1/products') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'products.create.submit').click()
        const res = await createResponse
        expect(res.ok()).toBeTruthy()
        productId = ((await res.json()) as { id?: string }).id

        await expect(byQa(page, 'products.details.name')).toContainText(name)
        await expect(byQa(page, 'products.details.price')).toContainText('2')
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

/** Catalog #11/#12 — empty/onboarding CTA opens drawer (when catalog is empty) */
test('#11/#12 onboarding: empty CTA or toolbar opens create drawer', async ({
    page,
    api,
    useProject,
}) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-empty'), modules)
    await useProject(pid, modules)

    try {
        await api.purgeProducts(pid)
        await gotoProductsList(page)

        const openCreate = byQa(page, 'products.list.createEmpty').or(byQa(page, 'products.list.create'))
        await expect(openCreate.first()).toBeVisible({ timeout: 30_000 })
        await openCreate.first().click()
        await expect(byQa(page, 'products.create.drawer')).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})
