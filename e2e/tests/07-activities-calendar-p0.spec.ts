import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    gotoActivitiesList,
    seedActivitiesProject,
    startOfDayMs,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-CALENDAR P0', () => {
    test('#38 calendar loads events in visible range', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const title = uniqueName('cal-event')
        const id = await api.createActivity(pid, {
            type: 'task',
            title,
            dueDate: startOfDayMs(),
        })
        try {
            await page.goto('/activities/calendar')
            await expect(byQa(page, 'activities.calendar.grid')).toBeVisible({ timeout: 30_000 })
            const calReq = page.waitForResponse((r) =>
                r.url().includes('/v1/activities/calendar'),
            )
            await page.reload()
            await calReq
            await expect(byQa(page, 'activities.calendar.event', { activity: id })).toBeVisible({
                timeout: 20_000,
            })
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#39 event popover open navigates to details', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('cal-open'),
            dueDate: startOfDayMs(),
        })
        try {
            await page.goto('/activities/calendar')
            await expect(byQa(page, 'activities.calendar.event', { activity: id })).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'activities.calendar.event', { activity: id }).click()
            await expect(byQa(page, 'activities.calendarPreview.popover', { activity: id })).toBeVisible()
            await byQa(page, 'activities.calendarPreview.open', { activity: id }).click()
            await expect(page).toHaveURL(new RegExp(`/activities/${id}$`))
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#40 empty slot click opens new form with dueDate query', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/calendar')
            await expect(byQa(page, 'activities.calendar.grid')).toBeVisible({ timeout: 30_000 })
            await byQa(page, 'activities.calendar.grid').click({ position: { x: 120, y: 120 } })
            await expect(page).toHaveURL(/\/activities\/new\?dueDate=/)
            await expect(byQa(page, 'activities.edit.title')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#41 calendar create button navigates to /activities/new', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/calendar')
            await byQa(page, 'activities.calendar.create').click()
            await expect(page).toHaveURL(/\/activities\/new/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#42 list segment navigates to /activities', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/calendar')
            await byQa(page, 'activities.calendar.viewList').click()
            await expect(page).toHaveURL(/\/activities\/?$/)
            await expect(byQa(page, 'activities.list.search')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })
})
