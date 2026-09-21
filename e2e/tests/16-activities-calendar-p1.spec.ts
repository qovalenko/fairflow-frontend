import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    daysAgoMs,
    gotoActivitiesCalendar,
    grantActivitiesReadWithoutWrite,
    mockActivitiesCalendarError,
    seedActivitiesProject,
    startOfDayMs,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-CALENDAR P1', () => {
    test('#43: overdue event is highlighted in calendar', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('cal-overdue'),
            dueDate: daysAgoMs(2),
            status: 'planned',
        })
        try {
            await gotoActivitiesCalendar(page)
            const event = byQa(page, 'activities.calendar.event', { activity: id })
            await expect(event).toBeVisible()
            const bg = await event.evaluate((el) => getComputedStyle(el).backgroundColor)
            expect(bg).toMatch(/rgb\(2(2[0-9]|3[0-9]|4[0-9]),|rgb\(239/)
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#44: calendar type filter narrows events', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const taskId = await api.createActivity(pid, {
            title: uniqueName('cal-task'),
            type: 'task',
            dueDate: startOfDayMs(),
        })
        const callId = await api.createActivity(pid, {
            title: uniqueName('cal-call'),
            type: 'call',
            direction: 'outbound',
            dueDate: startOfDayMs(),
        })
        try {
            await gotoActivitiesCalendar(page)
            await byQa(page, 'activities.calendar.filter').click()
            await byQa(page, 'activities.calendar.typeFilter', { type: 'call' }).click()
            await expect(
                byQa(page, 'activities.calendar.event', { activity: callId }),
            ).toBeVisible()
            await expect(
                byQa(page, 'activities.calendar.event', { activity: taskId }),
            ).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, taskId)
            await api.deleteActivity(pid, callId)
            await api.archiveProject(pid)
        }
    })

    test('#45: mine-only filter shows self activities', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const mineId = await api.createActivity(pid, {
            title: uniqueName('cal-mine'),
            assigneeId: api.userId,
            dueDate: startOfDayMs(),
        })
        try {
            await gotoActivitiesCalendar(page)
            await byQa(page, 'activities.calendar.mineOnly').click()
            await expect(
                byQa(page, 'activities.calendar.event', { activity: mineId }),
            ).toBeVisible()
        } finally {
            await api.deleteActivity(pid, mineId)
            await api.archiveProject(pid)
        }
    })

    test('#46: empty period shows empty state with create CTA', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await gotoActivitiesCalendar(page)
            await expect(byQa(page, 'activities.state.empty')).toBeVisible()
            await expect(byQa(page, 'activities.state.emptyCreate')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#47: calendar filter with no events shows empty filter state', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('cal-filter'),
            type: 'task',
            dueDate: startOfDayMs(),
        })
        try {
            await gotoActivitiesCalendar(page)
            await byQa(page, 'activities.calendar.filter').click()
            await byQa(page, 'activities.calendar.typeFilter', { type: 'note' }).click()
            await expect(byQa(page, 'activities.state.emptyFilter')).toBeVisible()
            await byQa(page, 'activities.calendar.filterReset').click()
            await expect(
                byQa(page, 'activities.calendar.event', { activity: id }),
            ).toBeVisible()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#48: calendar load error shows retry', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await mockActivitiesCalendarError(page)
            await page.goto('/activities/calendar')
            await expect(byQa(page, 'activities.state.error')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'activities.state.errorRetry')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#50: read-only calendar dateClick does not navigate to new', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        await grantActivitiesReadWithoutWrite(page, pid)
        await useProject(pid, ['deals', 'contacts', 'activities', 'statistics'])
        try {
            await gotoActivitiesCalendar(page)
            await byQa(page, 'activities.calendar.grid').click({ position: { x: 120, y: 120 } })
            await expect(page).toHaveURL(/\/activities\/calendar/)
            await expect(page).not.toHaveURL(/\/activities\/new/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#51: calendar view switch month week day', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('cal-views'),
            dueDate: startOfDayMs(),
        })
        try {
            await gotoActivitiesCalendar(page)
            await page.locator('.fc-timeGridWeek-button, button:has-text("Неделя")').first().click()
            await expect(byQa(page, 'activities.calendar.grid')).toBeVisible()
            await page.locator('.fc-timeGridDay-button, button:has-text("День")').first().click()
            await expect(byQa(page, 'activities.calendar.grid')).toBeVisible()
            await page.locator('.fc-dayGridMonth-button, button:has-text("Месяц")').first().click()
            await expect(
                byQa(page, 'activities.calendar.event', { activity: id }),
            ).toBeVisible({ timeout: 20_000 })
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })
})
