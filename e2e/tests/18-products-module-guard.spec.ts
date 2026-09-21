import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { PRODUCTS_FORBIDDEN_ALLOW } from '../support/products'

test.use({
    forbiddenAllow: [...PRODUCTS_FORBIDDEN_ALLOW, '/v1/products'],
})

/** Catalog #2 — модуль products выключен → ModuleDisabledState */
test('#2 module disabled: /products shows module disabled state', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts', 'orders']
    const pid = await api.createProject(uniqueName('prod-off'), modules)
    await useProject(pid, modules)

    try {
        await page.goto('/products')
        await expect(byQa(page, 'products.moduleDisabled')).toBeVisible({ timeout: 30_000 })
    } finally {
        await api.archiveProject(pid)
    }
})

/** Catalog #3 — orders выключен → products недоступен (каскад) */
test('#3 cascade: orders off hides products from sidebar', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts', 'products']
    const pid = await api.createProject(uniqueName('prod-noord'), modules)
    await useProject(pid, modules)

    try {
        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.sidebar.item', { nav: 'portfolio.products' })).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})

/** Catalog #4 — без products:read → locked LIST (admin не воспроизводит; проверяем контракт qa-id) */
test('#4 no read: locked state element exists in module (smoke via direct URL)', async ({
    page,
    api,
    useProject,
}) => {
    test.skip(true, 'Требует пользователя без products:read — admin на the stand всегда имеет read')
    const modules = ['deals', 'contacts', 'orders', 'products']
    const pid = await api.createProject(uniqueName('prod-noread'), modules)
    await useProject(pid, modules)
    try {
        await page.goto('/products')
        await expect(byQa(page, 'products.list.locked')).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})
