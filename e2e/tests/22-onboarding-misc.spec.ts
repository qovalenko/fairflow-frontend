import { test, expect } from '../fixtures/onboarding-test'
import { uniqueName } from '../support/env'
import { expectEventuallyUrl, resolveSystemId } from '../support/onboarding'

/**
 * Onboarding — checklist, team-status, session edge cases.
 */

test('#106: checklist auto-hides after 7 days via firstSeen localStorage', async ({
    page,
    api,
    useProject,
}) => {
    const pid = await api.createProject(uniqueName('onb-checklist'), ['deals', 'contacts'])
    try {
        await useProject(pid, ['deals', 'contacts'])
        const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
        await page.addInitScript(
            ({ projectId, firstSeen }) => {
                localStorage.setItem(
                    `ff.onboardingChecklist.${projectId}`,
                    JSON.stringify({ firstSeen, dismissed: false }),
                )
            },
            { projectId: pid, firstSeen: eightDaysAgo },
        )
        await page.goto('/dashboard')
        await expect(page.getByText('Первые шаги')).toHaveCount(0)
    } finally {
        await api.archiveProject(pid)
    }
})

test.fixme('#124: BUG team-status page has no Первый вход columnheader on box: team status table shows dash in first-login column', async ({ page, api, useProject }) => {
    const pid = await api.createProject(uniqueName('onb-team'), ['deals'])
    try {
        await useProject(pid, ['deals'])
        await page.goto('/account/projects/team-status')
        await expect(page.getByRole('columnheader', { name: 'Первый вход' })).toBeVisible({
            timeout: 30_000,
        })
        // Backend TODO OQ-UX-ONB-21: column always shows em-dash even when empty.
        await expect(page.getByText('—', { exact: true }).first()).toBeVisible()
    } finally {
        await api.archiveProject(pid)
    }
})

test('#150: session revoke mid-wizard sends user to sign-in', async ({ page, api }) => {
    await page.goto(`/account/projects/new?owner=${await resolveSystemId(api)}`)
    await page.evaluate(() => localStorage.removeItem('token'))
    await page.reload()
    await expectEventuallyUrl(page, /\/auth\/signin/)
})
