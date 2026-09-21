import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    ACTIVITIES_MODULES,
    ACTIVITIES_NAV_KEY,
    delayActivityGetById,
    denyActivitiesRead,
    grantActivitiesReadWithoutWrite,
    resetProjectSelection,
    seedActivitiesProject,
} from '../support/activities'
import { clearProjectContext } from '../support/projectContext'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES P1 automatable:yes (subset)', () => {
    test('#16: no read permission shows no-permission state', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        await denyActivitiesRead(page, pid)
        await useProject(pid, [...ACTIVITIES_MODULES])
        try {
            await page.goto('/activities')
            await expect(byQa(page, 'activities.state.noPermission')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#24: deep-link overdue=1 applies overdue preset', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('deeplink-overdue'),
            dueDate: Date.now() - 86_400_000,
        })
        try {
            await page.goto('/activities?overdue=1')
            await expect(byQa(page, 'activities.list.row', { activity: id })).toBeVisible({
                timeout: 30_000,
            })
            expect(page.url()).not.toContain('overdue=1')
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#49: calendar no-permission state', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        await denyActivitiesRead(page, pid)
        await useProject(pid, [...ACTIVITIES_MODULES])
        try {
            await page.goto('/activities/calendar')
            await expect(byQa(page, 'activities.state.noPermission')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#102: empty trash state', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/trash')
            await expect(byQa(page, 'activities.trash.empty')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#140: widget positive empty when no overdue', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('not-overdue'),
            dueDate: Date.now() + 7 * 86_400_000,
        })
        try {
            await page.goto('/dashboard')
            await expect(byQa(page, 'activities.overdueWidget.empty')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#131: card tab no read shows no-permission', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('noperm'),
        })
        await denyActivitiesRead(page, pid)
        await useProject(pid, [...ACTIVITIES_MODULES])
        try {
            await page.goto(`/contacts/${contactId}`)
            await expect(byQa(page, 'activities.state.noPermission')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#25: deep-link assigneeId applies assignee filter', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('assignee-slice'),
            dueDate: Date.now() + 2 * 86_400_000,
            assigneeId: api.userId,
        })
        try {
            await page.goto(`/activities?assigneeId=${api.userId}`)
            await expect(byQa(page, 'activities.list.row', { activity: id })).toBeVisible({
                timeout: 30_000,
            })
            expect(page.url()).not.toContain('assigneeId=')
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#26: deep-link upcoming=1 applies upcoming date window', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const inWindow = await api.createActivity(pid, {
            title: uniqueName('upcoming-in'),
            dueDate: Date.now() + 3 * 86_400_000,
        })
        const outWindow = await api.createActivity(pid, {
            title: uniqueName('upcoming-out'),
            dueDate: Date.now() + 30 * 86_400_000,
        })
        try {
            await page.goto('/activities?upcoming=1')
            await expect(
                byQa(page, 'activities.list.row', { activity: inWindow }),
            ).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'activities.list.row', { activity: outWindow })).toHaveCount(0)
            expect(page.url()).not.toContain('upcoming=1')
        } finally {
            await api.deleteActivity(pid, inWindow)
            await api.deleteActivity(pid, outWindow)
            await api.archiveProject(pid)
        }
    })

    test('#62: details loading shows fullscreen spinner', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('loading') })
        try {
            await delayActivityGetById(page, id, 3_000)
            await page.goto(`/activities/${id}`)
            await expect(byQa(page, 'activities.details.loading')).toBeVisible({
                timeout: 15_000,
            })
            await expect(byQa(page, 'activities.details.complete')).toBeVisible({
                timeout: 15_000,
            })
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#88: edit without write shows no-permission state', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        await grantActivitiesReadWithoutWrite(page, pid)
        await useProject(pid, [...ACTIVITIES_MODULES])
        try {
            await page.goto('/activities/new')
            await expect(byQa(page, 'activities.state.noPermission')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#94: edit form keeps activity type locked', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('type-lock') })
        try {
            await page.goto(`/activities/${id}/edit`)
            await expect(byQa(page, 'activities.edit.typeLocked')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'activities.edit.typeLocked')).toBeDisabled()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#104: trash without read shows no-permission state', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        await denyActivitiesRead(page, pid)
        await useProject(pid, [...ACTIVITIES_MODULES])
        try {
            await page.goto('/activities/trash')
            await expect(byQa(page, 'activities.state.noPermission')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#121: create dropdown without project redirects to projects list', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/dashboard')
            await expect(byQa(page, 'host.create.open')).toBeVisible({ timeout: 30_000 })
            await resetProjectSelection(page)
            await byQa(page, 'host.create.open').click()
            await byQa(page, 'host.create.task').click()
            await expect(page).toHaveURL(/\/account\/projects/, { timeout: 20_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#142: overdue widget hidden without activities read', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        await denyActivitiesRead(page, pid)
        await useProject(pid, [...ACTIVITIES_MODULES])
        try {
            await page.goto('/dashboard')
            await expect(byQa(page, 'activities.overdueWidget.empty')).toHaveCount(0)
            await expect(byQa(page, 'activities.overdueWidget.row')).toHaveCount(0)
            await expect(byQa(page, 'activities.overdueWidget.allActivities')).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#158: disabled activities module hides sidebar item', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('act-off-nav'), ['deals', 'contacts'])
        await useProject(pid, ['deals', 'contacts'])
        try {
            await page.goto(`/p/${pid}`)
            await expect(byQa(page, 'host.sidebar.item', { nav: 'portfolio.deals' })).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'host.sidebar.item', { nav: ACTIVITIES_NAV_KEY })).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#159: direct /activities URL redirects when module disabled', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('act-off-url'), ['deals', 'contacts'])
        await useProject(pid, ['deals', 'contacts'])
        try {
            await page.goto('/activities')
            await expect(page).not.toHaveURL(/\/activities(\/|$)/, { timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#162: activities list without project redirects to projects list', async ({ page }) => {
        await page.goto('/account/projects')
        await clearProjectContext(page)
        await page.goto('/activities')
        await expect(page).toHaveURL(/\/account\/projects/, { timeout: 20_000 })
    })
})
