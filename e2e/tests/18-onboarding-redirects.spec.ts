import { test, expect } from '../fixtures/onboarding-test'
import {
    clearSystemFromSession,
    expectEventuallyUrl,
    expectCreateProjectWizard,
    APP_ENTRY_PATH,
    makeProjectInfo,
    patchSessionUser,
    resolveSystemId,
    seedEmployeeWithoutProjects,
    seedOwnerWithoutProjects,
    stubEmptyProjectsList,
} from '../support/onboarding'

/**
 * Onboarding — URL redirect chains (catalog onboarding.md §SCR-ONB-ENTRY-CHOICE,
 * §SCR-ONB-REDIRECT-LEGACY, §SCR-BOX-BOOTSTRAP-SUCCESS, §SCR-BOX-ORG-RECOVERY).
 */

test('#13: logged-in user on /bootstrap is not stuck in a redirect loop', async ({ page }) => {
    await page.goto('/bootstrap')
    await expectEventuallyUrl(page, APP_ENTRY_PATH)
    await expect(page).not.toHaveURL(/\/bootstrap/)
})

test('#17: repeat visit to /onboarding/welcome with a project redirects to /', async ({
    page,
    api,
}) => {
    const pid = await api.createProject(`t029-onb-welcome-${Date.now()}`, ['deals'])
    try {
        await patchSessionUser(page, {
            projects: [makeProjectInfo(pid)],
            system: { id: await resolveSystemId(api), name: 'Org', role: 'platform_owner' },
            systemRole: 'platform_owner',
        })
        await page.goto('/onboarding/welcome')
        await expectEventuallyUrl(page, APP_ENTRY_PATH)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#18: /onboarding/welcome without systemId or owner query redirects to organization recovery', async ({
    page,
}) => {
    await stubEmptyProjectsList(page)
    await clearSystemFromSession(page)
    await page.goto('/onboarding/welcome')
    await expectEventuallyUrl(page, /\/onboarding\/organization/)
})

test('#25: organization recovery gate redirects immediately when systemId is already in store', async ({
    page,
    api,
}) => {
    const systemId = await resolveSystemId(api)
    await stubEmptyProjectsList(page)
    await seedOwnerWithoutProjects(page, systemId)
    await page.goto('/onboarding/organization')
    await expectCreateProjectWizard(page)
})

test('#35: /onboarding redirects to / when user already has a project', async ({ page, api }) => {
    const pid = await api.createProject(`t029-onb-hasproj-${Date.now()}`, ['deals'])
    try {
        await patchSessionUser(page, {
            projects: [makeProjectInfo(pid)],
            system: { id: await resolveSystemId(api), name: 'Org', role: 'platform_owner' },
            systemRole: 'platform_owner',
        })
        await page.goto('/onboarding')
        await expectEventuallyUrl(page, APP_ENTRY_PATH)
    } finally {
        await api.archiveProject(pid)
    }
})

test('#36: /onboarding without system redirects to organization recovery', async ({ page }) => {
    await stubEmptyProjectsList(page)
    await clearSystemFromSession(page)
    await page.goto('/onboarding')
    await expectEventuallyUrl(page, /\/onboarding\/organization/)
})

test('#37: owner without projects on /onboarding lands in create-project wizard', async ({
    page,
    api,
}) => {
    const systemId = await resolveSystemId(api)
    await stubEmptyProjectsList(page)
    await seedOwnerWithoutProjects(page, systemId)
    await page.goto('/onboarding')
    await expectCreateProjectWizard(page)
})

test('#38: employee without projects on /onboarding lands on no-projects dead-end', async ({
    page,
    api,
}) => {
    const systemId = await resolveSystemId(api)
    await stubEmptyProjectsList(page)
    await seedEmployeeWithoutProjects(page, systemId)
    await page.goto('/onboarding')
    await expectEventuallyUrl(page, /\/onboarding\/no-projects/)
})

const legacyPaths = [
    '/onboarding/profile',
    '/onboarding/first-project',
    '/onboarding/invite-team',
    '/onboarding/project-model',
    '/onboarding/project-entry',
] as const

for (const legacyPath of legacyPaths) {
    const num = legacyPath.includes('profile')
        ? 41
        : legacyPath.includes('first-project')
          ? 42
          : legacyPath.includes('invite-team')
            ? 43
            : legacyPath.includes('project-model')
              ? 44
              : 45

    test(`#${num}: legacy ${legacyPath} replaces to /onboarding`, async ({ page, api }) => {
        const systemId = await resolveSystemId(api)
        await stubEmptyProjectsList(page)
        await seedOwnerWithoutProjects(page, systemId)
        await page.goto(legacyPath)
        await expectCreateProjectWizard(page)
    })
}

test('#46: legacy /onboarding/create-project preserves owner query in wizard URL', async ({
    page,
    api,
}) => {
    const systemId = await resolveSystemId(api)
    await page.goto(`/onboarding/create-project?owner=${systemId}`)
    await expectCreateProjectWizard(page)
})

test('#48: legacy create-project owner query is forwarded to the wizard', async ({ page, api }) => {
    const systemId = await resolveSystemId(api)
    await page.goto(`/onboarding/create-project?owner=${systemId}&foo=bar`)
    await expectCreateProjectWizard(page)
    expect(new URL(page.url()).searchParams.get('owner')).toBe(systemId)
})

test('#145: return to /onboarding with an existing project does not reopen the wizard', async ({
    page,
    api,
}) => {
    const pid = await api.createProject(`t029-onb-reentry-${Date.now()}`, ['deals'])
    try {
        await patchSessionUser(page, {
            projects: [makeProjectInfo(pid)],
            system: { id: await resolveSystemId(api), name: 'Org', role: 'platform_owner' },
            systemRole: 'platform_owner',
        })
        await page.goto('/onboarding')
        await expectEventuallyUrl(page, APP_ENTRY_PATH, 45_000)
        expect(new URL(page.url()).pathname).not.toMatch(/\/account\/projects\/new/)
    } finally {
        await api.archiveProject(pid)
    }
})
