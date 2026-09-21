import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    denyActivitiesRead,
    seedActivitiesProject,
    setDefaultActivitiesView,
    startOfDayMs,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES P2 automatable:yes', () => {
    test('#36: defaultActivitiesView calendar opens calendar index', async ({
        page,
        api,
        useProject,
    }) => {
        await setDefaultActivitiesView(page, 'calendar')
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities')
            await expect(page).toHaveURL(/\/activities\/calendar/, { timeout: 30_000 })
            await expect(byQa(page, 'activities.calendar.grid')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#52: calendar legend shows types and overdue label', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/calendar')
            const legend = byQa(page, 'activities.calendar.legend')
            await expect(legend).toBeVisible({ timeout: 30_000 })
            await expect(legend).toContainText('Задачи')
            await expect(legend).toContainText('Звонки')
            await expect(legend).toContainText('Встречи')
            await expect(legend).toContainText('Просрочено')
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#73: activity details footer shows created and updated timestamps', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const title = uniqueName('meta-footer')
        const id = await api.createActivity(pid, { title, dueDate: startOfDayMs() })
        try {
            await page.goto(`/activities/${id}/edit`)
            await byQa(page, 'activities.edit.title').fill(`${title}-edited`)
            await byQa(page, 'activities.edit.save').click()
            await expect(page).toHaveURL(new RegExp(`/activities/${id}$`), { timeout: 30_000 })
            await expect(byQa(page, 'activities.details.metaCreated')).toBeVisible()
            await expect(byQa(page, 'activities.details.metaUpdated')).toBeVisible()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#74: call direction tag is visible on details header', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('call-dir'),
            type: 'call',
            direction: 'outbound',
        })
        try {
            await page.goto(`/activities/${id}`)
            await expect(
                byQa(page, 'activities.details.directionTag', { direction: 'outbound' }),
            ).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#107: trash back navigates to activities list', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/trash')
            await byQa(page, 'activities.trash.back').click()
            await expect(page).toHaveURL(/\/activities\/?$/, { timeout: 15_000 })
            await expect(byQa(page, 'activities.list.search')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#135: card tab header shows activity count', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('tab-count'),
        })
        const a1 = await api.createActivity(pid, {
            title: uniqueName('tab-a1'),
            links: [{ entityType: 'contact', entityId: contactId }],
        })
        const a2 = await api.createActivity(pid, {
            title: uniqueName('tab-a2'),
            links: [{ entityType: 'contact', entityId: contactId }],
        })
        try {
            await page.goto(`/contacts/${contactId}`)
            await expect(byQa(page, 'activities.cardTab.count')).toHaveText('2', {
                timeout: 30_000,
            })
        } finally {
            await api.deleteActivity(pid, a1)
            await api.deleteActivity(pid, a2)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#144: overdue widget shows cache lag hint', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/dashboard')
            await expect(byQa(page, 'activities.overdueWidget.lag')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#147: next-step sidebar hidden without activities read', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('sidebar-noread'),
        })
        await api.createActivity(pid, {
            title: uniqueName('sidebar-act'),
            links: [{ entityType: 'contact', entityId: contactId }],
        })
        await denyActivitiesRead(page, pid)
        await useProject(pid, ['deals', 'contacts', 'activities', 'statistics'])
        try {
            await page.goto(`/contacts/${contactId}`)
            await expect(byQa(page, 'activities.nextStepSidebar.root')).toHaveCount(0, {
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })
})
