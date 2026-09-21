import { test, expect } from '../fixtures/onboarding-test'
import { uniqueName } from '../support/env'
import {
    expectEventuallyUrl,
    expectCreateProjectWizard,
    LANDING_MODULE_PATH,
    makeProjectInfo,
    patchSessionUser,
    resolveSystemId,
    seedEmployeeWithoutProjects,
    seedOwnerWithoutProjects,
    sidebarNavItem,
    stubEmptyProjectsList,
} from '../support/onboarding'

/**
 * Onboarding — landing resolver (catalog onboarding.md §SCR-ONB-LANDING-RESOLVER).
 */

test('#26: admin with projects lands on the first enabled-module path', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('onb-land'), ['deals', 'contacts'])
    try {
        await useProject(pid, ['deals', 'contacts'])
        await page.goto('/')
        await expectEventuallyUrl(page, LANDING_MODULE_PATH)
        await expect(sidebarNavItem(page, 'portfolio.deals')).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#27: admin without projects is routed through /onboarding into the wizard', async ({
    page,
    api,
}) => {
    const systemId = await resolveSystemId(api)
    await stubEmptyProjectsList(page)
    await seedOwnerWithoutProjects(page, systemId)
    await page.goto('/')
    await expectCreateProjectWizard(page)
})

test('#28: employee without projects lands on /onboarding/no-projects', async ({ page, api }) => {
    const systemId = await resolveSystemId(api)
    await stubEmptyProjectsList(page)
    await seedEmployeeWithoutProjects(page, systemId)
    await page.goto('/')
    await expectEventuallyUrl(page, /\/onboarding\/no-projects/)
    await expect(
        page.getByRole('heading', { name: 'Вы ещё не добавлены ни в один проект' }),
    ).toBeVisible()
})

test.fixme('#29: BUG broken lastActiveProjectId lands on /deals not /account/projects: hasProjects but broken resolved id falls back to /account/projects', async ({
    page,
    api,
}) => {
    const pid = await api.createProject(uniqueName('onb-broken'), ['deals'])
    try {
        await patchSessionUser(page, {
            projects: [makeProjectInfo(pid)],
            lastActiveProjectId: 'nonexistent-project-id',
            system: { id: await resolveSystemId(api), name: 'Org', role: 'platform_owner' },
            systemRole: 'platform_owner',
        })
        await page.goto('/')
        await expectEventuallyUrl(page, /\/account\/projects/)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#31: landing waits for navigation manifest before project redirect', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('onb-navready'), ['deals'])
    try {
        await useProject(pid, ['deals'])
        await page.goto('/')
        await expectEventuallyUrl(page, LANDING_MODULE_PATH)
        // Sidebar item proves module manifest resolved (not a stale/default bounce).
        await expect(sidebarNavItem(page, 'portfolio.deals')).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        await api.archiveProject(pid)
    }
})

test('#34: unverified email does not gate landing in box mode', async ({ page, api, useProject }) => {
    const pid = await api.createProject(uniqueName('onb-unverified'), ['deals'])
    try {
        await patchSessionUser(page, {
            emailVerified: false,
            projects: [makeProjectInfo(pid)],
            system: { id: await resolveSystemId(api), name: 'Org', role: 'platform_owner' },
            systemRole: 'platform_owner',
        })
        await useProject(pid, ['deals'])
        await page.goto('/')
        await expectEventuallyUrl(page, LANDING_MODULE_PATH)
        await expect(page).not.toHaveURL(/verify|email-verif/i)
    } finally {
        await api.archiveProject(pid)
    }
})
