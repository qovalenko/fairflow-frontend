import { test, expect } from '../fixtures/onboarding-test'
import { uniqueName } from '../support/env'
import {
    resolveSystemId,
    seedEmployeeWithoutProjects,
    stubEmptyProjectsList,
} from '../support/onboarding'

/**
 * Onboarding — no-projects dead-end (catalog onboarding.md §SCR-ONB-NO-PROJECTS).
 */

test('#93: employee without projects does not see a create-project button', async ({
    page,
    api,
}) => {
    const systemId = await resolveSystemId(api)
    await stubEmptyProjectsList(page)
    await seedEmployeeWithoutProjects(page, systemId)
    await page.goto('/onboarding/no-projects')
    await expect(
        page.getByRole('heading', { name: 'Вы ещё не добавлены ни в один проект' }),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: /создать проект/i })).toHaveCount(0)
})

test('#98: no-projects screen degrades without admin contact block', async ({ page, api }) => {
    const systemId = await resolveSystemId(api)
    await seedEmployeeWithoutProjects(page, systemId, 'Test Org')
    await page.goto('/onboarding/no-projects')
    await expect(page.getByRole('link', { name: 'Профиль' })).toBeVisible()
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)
})

test.fixme(
    '#99: BUG needs employee JWT: employee direct POST /api/projects returns 403',
    async ({ api }) => {
        const res = await api.createProjectRaw({
            ownerType: 'ORGANIZATION',
            name: uniqueName('onb-emp-deny'),
            templateId: 'blank',
            modules: ['deals'],
        })
        expect(res.status).toBe(403)
        expect(res.body.toLowerCase()).toMatch(/permission|denied|forbidden/)
    },
)
