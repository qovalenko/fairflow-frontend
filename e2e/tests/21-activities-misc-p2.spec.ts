import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    gotoActivitiesCalendar,
    mockActivityGetByIdError,
    seedActivitiesProject,
    startOfDayMs,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-CALENDAR P2', () => {
    test('#53: preview get-by-id error still navigates to details', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('preview-err'),
            dueDate: startOfDayMs(),
        })
        try {
            await mockActivityGetByIdError(page, id, 404)
            await gotoActivitiesCalendar(page)
            await byQa(page, 'activities.calendar.event', { activity: id }).click()
            await byQa(page, 'activities.calendarPreview.open', { activity: id }).click()
            await expect(page).toHaveURL(new RegExp(`/activities/${id}$`))
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#54: preview link navigates to related deal', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('preview-link'),
        })
        const dealId = await api.createDeal(pid, {
            name: uniqueName('preview-deal'),
            contactId,
        })
        const id = await api.createActivity(pid, {
            title: uniqueName('preview-deal-act'),
            dueDate: startOfDayMs(),
            links: [{ entityType: 'deal', entityId: dealId }],
        })
        try {
            await gotoActivitiesCalendar(page)
            await byQa(page, 'activities.calendar.event', { activity: id }).click()
            await expect(
                byQa(page, 'activities.calendarPreview.popover', { activity: id }),
            ).toBeVisible()
            await byQa(page, 'activities.calendarPreview.entityLink', { entity: 'deal' }).click()
            await expect(page).toHaveURL(new RegExp(`/deals/${dealId}`))
        } finally {
            await api.deleteActivity(pid, id)
            await api.deleteDeal(pid, dealId)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })
})

test.describe('SCR-ACTIVITIES-MISC P2', () => {
    test('#122: drawer create refreshes activities list', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const title = uniqueName('drawer-refresh')
        try {
            await page.goto('/activities')
            await byQa(page, 'host.create.open').click()
            await byQa(page, 'host.create.task').click()
            await byQa(page, 'host.drawer.activity.title').fill(title)
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/activities') && r.request().method() === 'POST',
            )
            await byQa(page, 'host.drawer.activity.submit').click()
            await post
            const rows = await api.listActivities(pid, { query: title })
            expect(rows.length).toBeGreaterThan(0)
            await expect(byQa(page, 'activities.list.row', { activity: rows[0]!.id })).toBeVisible()
        } finally {
            const rows = await api.listActivities(pid, { query: title })
            for (const r of rows) await api.deleteActivity(pid, r.id)
            await api.archiveProject(pid)
        }
    })

    test('#146: next-step sidebar empty when no open activities', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('sidebar-empty'),
        })
        try {
            await page.goto(`/contacts/${contactId}`)
            await expect(byQa(page, 'activities.nextStepSidebar.empty')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#163: project switch reloads activities list', async ({ page, api, useProject }) => {
        const pidA = await seedActivitiesProject(api, useProject)
        const pidB = await api.createProject(uniqueName('switch-b'), [
            'deals',
            'contacts',
            'activities',
            'statistics',
        ])
        const titleA = uniqueName('proj-a')
        const titleB = uniqueName('proj-b')
        const idA = await api.createActivity(pidA, { title: titleA })
        const idB = await api.createActivity(pidB, { title: titleB })
        try {
            await useProject(pidA, ['deals', 'contacts', 'activities', 'statistics'])
            await page.goto('/activities')
            await expect(byQa(page, 'activities.list.row', { activity: idA })).toBeVisible({
                timeout: 30_000,
            })
            await useProject(pidB, ['deals', 'contacts', 'activities', 'statistics'])
            await page.goto('/activities')
            await expect(byQa(page, 'activities.list.row', { activity: idB })).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'activities.list.row', { activity: idA })).toHaveCount(0)
        } finally {
            await api.deleteActivity(pidA, idA)
            await api.deleteActivity(pidB, idB)
            await api.archiveProject(pidA)
            await api.archiveProject(pidB)
        }
    })
})
