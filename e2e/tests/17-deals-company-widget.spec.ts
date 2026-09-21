import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { DEALS_WITH_COMPANIES } from '../support/deals'

test.use({ forbiddenAllow: ['/v1/activities'] })

/** #163 company card deals widget + navigation. */
test('#163: company deals widget lists deal and opens card', async ({ page, api, useProject }) => {
    const pid = await api.createProject(uniqueName('company-deals'), [...DEALS_WITH_COMPANIES])
    await useProject(pid, [...DEALS_WITH_COMPANIES])
    let companyId: string | undefined
    let dealId: string | undefined
    try {
        companyId = await api.createCompany(pid, { name: uniqueName('co-deals') })
        dealId = await api.createDeal(pid, {
                name: uniqueName('co-deal'),
                amount: 4200,
                companyId,
            })
        await page.goto(`/companies/${companyId}`)
        await expect(byQa(page, 'companies.details.dealRow', { deal: dealId! })).toBeVisible({
            timeout: 30_000,
        })
        await byQa(page, 'companies.details.dealRow', { deal: dealId! }).click()
        await expect(page).toHaveURL(new RegExp(`/deals/${dealId}`))
    } finally {
        if (dealId) await api.deleteDeal(pid, dealId).catch(() => {})
        if (companyId) await api.deleteCompany(pid, companyId).catch(() => {})
        await api.archiveProject(pid)
    }
})
