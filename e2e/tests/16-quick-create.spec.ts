import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'

/**
 * Shell catalog #111 (P0): quick-create contact via header drawer → API create.
 * Shell catalog #112 (P0): quick-create company via drawer.
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test('#111: quick-create «Контакт» → drawer → API create → закрытие', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts', 'companies']
    const pid = await api.createProject(uniqueName('qc-contact'), modules)
    await useProject(pid, modules)
    const firstName = uniqueName('fn')
    const lastName = uniqueName('ln')

    try {
        await page.goto(`/p/${pid}`)
        await expect(byQa(page, 'host.createDropdown.trigger')).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'host.createDropdown.trigger').click()
        await byQa(page, 'host.createDropdown.item', { entity: 'contact' }).click()

        await expect(byQa(page, 'host.entityCreate.drawer', { entity: 'contact' })).toBeVisible()
        await byQa(page, 'host.entityCreate.firstName', { entity: 'contact' }).fill(firstName)
        await byQa(page, 'host.entityCreate.lastName', { entity: 'contact' }).fill(lastName)
        await byQa(page, 'host.entityCreate.phone', { entity: 'contact' }).fill('+79001234567')

        const createPromise = page.waitForResponse(
            (r) => r.url().includes('/api/v1/contacts') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'host.entityCreate.submit', { entity: 'contact' }).click()
        const createRes = await createPromise
        expect(createRes.ok(), 'contact POST should succeed').toBeTruthy()

        await expect(byQa(page, 'host.entityCreate.drawer', { entity: 'contact' })).toHaveCount(0, {
            timeout: 10_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#112: quick-create «Компания» → real API', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts', 'companies']
    const pid = await api.createProject(uniqueName('qc-company'), modules)
    await useProject(pid, modules)
    const companyName = uniqueName('co')

    try {
        await page.goto(`/p/${pid}`)
        await byQa(page, 'host.createDropdown.trigger').click()
        await byQa(page, 'host.createDropdown.item', { entity: 'company' }).click()

        await expect(byQa(page, 'host.entityCreate.drawer', { entity: 'company' })).toBeVisible()
        await byQa(page, 'host.entityCreate.name', { entity: 'company' }).fill(companyName)

        const createPromise = page.waitForResponse(
            (r) => r.url().includes('/api/v1/companies') && r.request().method() === 'POST',
            { timeout: 20_000 },
        )
        await byQa(page, 'host.entityCreate.submit', { entity: 'company' }).click()
        const createRes = await createPromise
        expect(createRes.ok(), 'company POST should succeed').toBeTruthy()
    } finally {
        await api.archiveProject(pid)
    }
})
