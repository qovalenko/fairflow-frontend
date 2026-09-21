import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    gotoProductsList,
    pickSelectOption,
    PRODUCT_MODULES,
    PRODUCTS_FORBIDDEN_ALLOW,
} from '../support/products'

test.use({ forbiddenAllow: [...PRODUCTS_FORBIDDEN_ALLOW] })

/** Catalog #36 — серверный поиск по названию */
test('#36 filter: server search by name', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-search'), modules)
    await useProject(pid, modules)

    const alpha = uniqueName('alpha')
    const beta = uniqueName('beta')
    let idA: string | undefined
    let idB: string | undefined

    try {
        idA = await api.createProduct(pid, { name: alpha })
        idB = await api.createProduct(pid, { name: beta })

        await gotoProductsList(page)
        await byQa(page, 'products.list.search').fill(alpha.replace(/^t029-[^-]+-/, ''))
        await expect(byQa(page, 'products.list.card', { product: idA })).toBeVisible({
            timeout: 15_000,
        })
        await expect(byQa(page, 'products.list.card', { product: idB })).toHaveCount(0)
    } finally {
        for (const id of [idA, idB]) {
            if (id) {
                try {
                    await api.deleteProduct(pid, id)
                } catch {
                    /* ignore */
                }
            }
        }
        await api.archiveProject(pid)
    }
})

/** Catalog #37 — фильтр категории */
test('#37 filter: category select narrows catalog', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-cat'), modules)
    await useProject(pid, modules)

    const catA = uniqueName('CatA').replace(/[^a-zA-Z0-9]/g, '')
    const catB = uniqueName('CatB').replace(/[^a-zA-Z0-9]/g, '')
    let idA: string | undefined
    let idB: string | undefined

    try {
        idA = await api.createProduct(pid, { name: uniqueName('inA'), category: catA })
        idB = await api.createProduct(pid, { name: uniqueName('inB'), category: catB })

        await gotoProductsList(page)
        await pickSelectOption(page, 'products.list.categoryFilter', 'products.list.categoryOption', {
            category: catA,
        })
        await expect(byQa(page, 'products.list.card', { product: idA })).toBeVisible({
            timeout: 15_000,
        })
        await expect(byQa(page, 'products.list.card', { product: idB })).toHaveCount(0)
    } finally {
        for (const id of [idA, idB]) {
            if (id) {
                try {
                    await api.deleteProduct(pid, id)
                } catch {
                    /* ignore */
                }
            }
        }
        await api.archiveProject(pid)
    }
})

/** Catalog #38 — Segment «Активные» / «Архив» */
test('#38 filter: active vs archived segment shows different sets', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-seg'), modules)
    await useProject(pid, modules)

    let activeId: string | undefined
    let archivedId: string | undefined

    try {
        activeId = await api.createProduct(pid, { name: uniqueName('active') })
        archivedId = await api.createProduct(pid, { name: uniqueName('arch') })
        await api.archiveProduct(pid, archivedId)

        await gotoProductsList(page)
        await expect(byQa(page, 'products.list.card', { product: activeId })).toBeVisible()
        await expect(byQa(page, 'products.list.card', { product: archivedId })).toHaveCount(0)

        await byQa(page, 'products.list.statusArchived').click()
        await expect(byQa(page, 'products.list.card', { product: archivedId })).toBeVisible({
            timeout: 15_000,
        })
        await expect(byQa(page, 'products.list.card', { product: activeId })).toHaveCount(0)
    } finally {
        if (archivedId) {
            try {
                await api.restoreProduct(pid, archivedId)
                await api.deleteProduct(pid, archivedId)
            } catch {
                /* ignore */
            }
        }
        if (activeId) {
            try {
                await api.deleteProduct(pid, activeId)
            } catch {
                /* ignore */
            }
        }
        await api.archiveProject(pid)
    }
})

/** Catalog #96 — архивный продукт виден в фильтре «Архив» */
test('#96 archive filter: archived product appears under Archive segment', async ({
    page,
    api,
    useProject,
}) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-archfilt'), modules)
    await useProject(pid, modules)

    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, { name: uniqueName('to-archive') })
        await api.archiveProduct(pid, productId)

        await gotoProductsList(page)
        await byQa(page, 'products.list.statusArchived').click()
        await expect(byQa(page, 'products.list.card', { product: productId! })).toBeVisible({
            timeout: 15_000,
        })
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
