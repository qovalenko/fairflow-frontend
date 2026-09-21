import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { pickSelectOption, PRODUCT_MODULES, PRODUCTS_FORBIDDEN_ALLOW } from '../support/products'

test.use({ forbiddenAllow: [...PRODUCTS_FORBIDDEN_ALLOW] })

/** Catalog #63/#64 — загрузка формы + save → DETAILS */
test('#63/#64 edit: save name and price returns to details', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-save'), modules)
    await useProject(pid, modules)
    const original = uniqueName('orig')
    const updated = uniqueName('upd')
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, { name: original, price: 100 })
        await page.goto(`/products/${productId}/edit`)
        await expect(byQa(page, 'products.edit')).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'products.edit.name')).toHaveValue(original)

        await byQa(page, 'products.edit.name').fill(updated)
        await byQa(page, 'products.edit.price').fill('999')

        const saveResponse = page.waitForResponse(
            (r) =>
                r.url().includes(`/v1/products/${productId}`) && r.request().method() === 'PUT',
            { timeout: 20_000 },
        )
        await byQa(page, 'products.edit.save').click()
        expect((await saveResponse).ok()).toBeTruthy()

        await expect(page).toHaveURL(new RegExp(`/products/${productId}$`))
        await expect(byQa(page, 'products.details.name')).toContainText(updated)
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

/** Catalog #75 — привязать Order Type → save → имя на DETAILS */
test('#75 edit: link order type and save shows on details', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-ot-link'), modules)
    await useProject(pid, modules)
    const ot = await api.createOrderType(pid, uniqueName('link-ot'))
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, { name: uniqueName('ot-link') })
        await page.goto(`/products/${productId}/edit`)
        await expect(byQa(page, 'products.edit')).toBeVisible({ timeout: 30_000 })

        await pickSelectOption(page, 'products.edit.orderType', 'products.edit.orderTypeOption', {
            orderType: ot.id,
        })
        await byQa(page, 'products.edit.save').click()
        await expect(page).toHaveURL(new RegExp(`/products/${productId}$`))
        await expect(byQa(page, 'products.details.orderType')).toContainText(ot.name)
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

/** Catalog #76 — отвязать тип (clear) → save */
test('#76 edit: clear order type removes name on details', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-ot-clear'), modules)
    await useProject(pid, modules)
    const ot = await api.createOrderType(pid, uniqueName('clear-ot'))
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, {
            name: uniqueName('ot-clear'),
            orderTypeId: ot.id,
            orderTypeName: ot.name,
        })
        await page.goto(`/products/${productId}/edit`)
        await expect(byQa(page, 'products.edit.orderType')).toBeVisible({ timeout: 30_000 })
        // Clear via the clear indicator on react-select (click control then clear if visible)
        await byQa(page, 'products.edit.orderTypeClear').click()
        await byQa(page, 'products.edit.save').click()
        await expect(page).toHaveURL(new RegExp(`/products/${productId}$`))
        await expect(byQa(page, 'products.details.orderType')).toHaveCount(0)
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

/** Catalog #77 — prefill rows → save → block on DETAILS */
test('#77 edit: prefill fields persist on details', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-prefill'), modules)
    await useProject(pid, modules)
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, { name: uniqueName('prefill') })
        await page.goto(`/products/${productId}/edit`)
        await byQa(page, 'products.edit.prefillAdd').click()
        await byQa(page, 'products.edit.prefillField').fill('contractNo')
        await byQa(page, 'products.edit.prefillValue').fill('ABC-42')
        await byQa(page, 'products.edit.save').click()
        await expect(page).toHaveURL(new RegExp(`/products/${productId}$`))
        await expect(byQa(page, 'products.details.prefill')).toContainText('contractNo')
        await expect(byQa(page, 'products.details.prefillItem', { field: 'contractNo' })).toContainText(
            'ABC-42',
        )
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

/** Catalog #84 — REASSIGN dangling: banner → edit → new type → badge gone */
test('#84 reassign: fix dangling order type via edit', async ({ page, api, useProject }) => {
    const modules = [...PRODUCT_MODULES]
    const pid = await api.createProject(uniqueName('prod-reassign'), modules)
    await useProject(pid, modules)
    const otOld = await api.createOrderType(pid, uniqueName('old-ot'))
    const otNew = await api.createOrderType(pid, uniqueName('new-ot'))
    let productId: string | undefined

    try {
        productId = await api.createProduct(pid, {
            name: uniqueName('reassign'),
            orderTypeId: otOld.id,
            orderTypeName: otOld.name,
        })
        await api.deleteOrderType(pid, otOld.id)

        await page.goto(`/products/${productId}`)
        await expect(byQa(page, 'products.details.danglingBanner')).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'products.details.reassignType').click()
        await pickSelectOption(page, 'products.edit.orderType', 'products.edit.orderTypeOption', {
            orderType: otNew.id,
        })
        await byQa(page, 'products.edit.save').click()
        await expect(byQa(page, 'products.details.danglingBanner')).toHaveCount(0)
        await expect(byQa(page, 'products.details.orderType')).toContainText(otNew.name)
    } finally {
        if (productId) {
            try {
                await api.deleteProduct(pid, productId)
            } catch {
                /* ignore */
            }
        }
        for (const ot of [otOld, otNew]) {
            try {
                await api.deleteOrderType(pid, ot.id)
            } catch {
                /* ignore */
            }
        }
        await api.archiveProject(pid)
    }
})
