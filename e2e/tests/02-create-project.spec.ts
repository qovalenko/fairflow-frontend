import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'

/**
 * Smoke 2 — create project through the wizard (host.createProject.*).
 * Verifies: template pick -> name -> submit -> redirect to /p/:id, and the
 * portfolio sidebar is populated (deals is the always-on module, FR-ONB-4).
 * Cleanup: archive the created project via API.
 */
test('#51: happy-path мастер → /p/:id + ProjectHomeRedirect в первый модуль', async ({
    page,
    api,
}) => {
    const projectName = uniqueName('project')
    let createdProjectId: string | undefined

    try {
        await page.goto('/account/projects/new')

        // Step 1 — pick the first available template.
        const template = byQa(page, 'host.createProject.template').first()
        await expect(template).toBeVisible({ timeout: 30_000 })
        await template.click()
        await byQa(page, 'host.createProject.next').click()

        // Step 2 — project name (overwrite any template-derived default).
        const nameInput = byQa(page, 'host.createProject.name')
        await expect(nameInput).toBeVisible()
        await nameInput.fill(projectName)

        // Advance through remaining steps (personal = 3, org = 4) until submit shows.
        const submit = byQa(page, 'host.createProject.submit')
        const next = byQa(page, 'host.createProject.next')
        for (let i = 0; i < 4 && !(await submit.isVisible()); i++) {
            await next.click()
        }

        await expect(submit).toBeVisible()
        await submit.click()

        // Provisioning redirects to the new project.
        await expect(page).toHaveURL(/\/p\/[^/]+/, { timeout: 45_000 })
        createdProjectId = page.url().match(/\/p\/([^/?#]+)/)?.[1]
        expect(createdProjectId, 'project id parsed from URL').toBeTruthy()

        // Sidebar built from the project's module cards — deals is always present.
        await expect(byQa(page, 'host.sidebar.item', { nav: 'portfolio.deals' })).toBeVisible({
            timeout: 30_000,
        })
    } finally {
        if (createdProjectId) await api.archiveProject(createdProjectId)
        else await api.cleanupProjects()
    }
})
