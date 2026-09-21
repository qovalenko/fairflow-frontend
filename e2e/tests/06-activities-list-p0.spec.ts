import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    acceptNextDialog,
    daysAgoMs,
    gotoActivitiesList,
    openActivitiesFromSidebar,
    seedActivitiesProject,
    startOfDayMs,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-LIST P0', () => {
    test('#1 open list from sidebar and see table with seeded activity', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const title = uniqueName('list-open')
        const id = await api.createActivity(pid, { title, dueDate: startOfDayMs() })
        try {
            await page.goto('/')
            await openActivitiesFromSidebar(page)
            await expect(byQa(page, 'activities.list.row', { activity: id })).toBeVisible()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#2 row click navigates to activity details', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const title = uniqueName('row-click')
        const id = await api.createActivity(pid, { title })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.rowTitle', { activity: id }).click()
            await expect(page).toHaveURL(new RegExp(`/activities/${id}$`))
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#3 create button navigates to /activities/new', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.create').click()
            await expect(page).toHaveURL(/\/activities\/new/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#4 calendar segment navigates to /activities/calendar', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.viewCalendar').click()
            await expect(page).toHaveURL(/\/activities\/calendar/)
            await expect(byQa(page, 'activities.calendar.grid')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#5 today preset filters by due date and toggles off', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const todayId = await api.createActivity(pid, {
            title: uniqueName('today'),
            dueDate: startOfDayMs(),
        })
        const otherId = await api.createActivity(pid, {
            title: uniqueName('other-day'),
            dueDate: daysAgoMs(5),
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.datePreset', { preset: 'today' }).click()
            await expect(byQa(page, 'activities.list.row', { activity: todayId })).toBeVisible()
            await expect(byQa(page, 'activities.list.row', { activity: otherId })).toHaveCount(0)
            await byQa(page, 'activities.list.datePreset', { preset: 'today' }).click()
            await expect(byQa(page, 'activities.list.row', { activity: otherId })).toBeVisible()
        } finally {
            await api.deleteActivity(pid, todayId)
            await api.deleteActivity(pid, otherId)
            await api.archiveProject(pid)
        }
    })

    test('#6 tomorrow preset filters activities', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const tomorrowId = await api.createActivity(pid, {
            title: uniqueName('tomorrow'),
            dueDate: startOfDayMs(1),
        })
        const todayId = await api.createActivity(pid, {
            title: uniqueName('today-only'),
            dueDate: startOfDayMs(),
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.datePreset', { preset: 'tomorrow' }).click()
            await expect(byQa(page, 'activities.list.row', { activity: tomorrowId })).toBeVisible()
            await expect(byQa(page, 'activities.list.row', { activity: todayId })).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, tomorrowId)
            await api.deleteActivity(pid, todayId)
            await api.archiveProject(pid)
        }
    })

    test('#7 overdue preset shows only overdue open activities', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const overdueId = await api.createActivity(pid, {
            title: uniqueName('overdue'),
            dueDate: daysAgoMs(2),
            status: 'planned',
        })
        const doneOverdueId = await api.createActivity(pid, {
            title: uniqueName('done-overdue'),
            dueDate: daysAgoMs(2),
            status: 'completed',
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.datePreset', { preset: 'overdue' }).click()
            await expect(byQa(page, 'activities.list.row', { activity: overdueId })).toBeVisible()
            await expect(
                byQa(page, 'activities.list.row', { activity: doneOverdueId }),
            ).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, overdueId)
            await api.deleteActivity(pid, doneOverdueId)
            await api.archiveProject(pid)
        }
    })

    test('#8 search by title filters list', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const needle = uniqueName('search-needle')
        const other = uniqueName('search-other')
        const id1 = await api.createActivity(pid, { title: needle })
        const id2 = await api.createActivity(pid, { title: other })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.search').fill(needle)
            await expect(byQa(page, 'activities.list.row', { activity: id1 })).toBeVisible()
            await expect(byQa(page, 'activities.list.row', { activity: id2 })).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, id1)
            await api.deleteActivity(pid, id2)
            await api.archiveProject(pid)
        }
    })

    test('#9 pagination: second page and page size change', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const ids: string[] = []
        try {
            for (let i = 0; i < 11; i++) {
                ids.push(await api.createActivity(pid, { title: uniqueName(`page-${i}`) }))
            }
            await gotoActivitiesList(page)
            await expect(byQa(page, 'activities.list.row')).toHaveCount(10)
            await byQa(page, 'activities.list.pageNext').click({ force: true })
            await expect(byQa(page, 'activities.list.row')).toHaveCount(1)
            await byQa(page, 'activities.list.pagePrev').click({ force: true })
            await byQa(page, 'activities.list.pageSize').click()
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            await expect(byQa(page, 'activities.list.row')).toHaveCount(11)
        } finally {
            for (const id of ids) await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#10 bulk complete selected activities', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id1 = await api.createActivity(pid, { title: uniqueName('bulk-a') })
        const id2 = await api.createActivity(pid, { title: uniqueName('bulk-b') })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.rowCheckbox', { activity: id1 }).click()
            await byQa(page, 'activities.list.rowCheckbox', { activity: id2 }).click()
            const bulk = page.waitForResponse(
                (r) => r.url().includes('/v1/activities/bulk') && r.request().method() === 'POST',
            )
            await byQa(page, 'activities.list.bulkComplete').click()
            expect((await bulk).ok()).toBeTruthy()
            const a1 = await api.getActivity(pid, id1)
            const a2 = await api.getActivity(pid, id2)
            expect(a1?.status).toBe('completed')
            expect(a2?.status).toBe('completed')
        } finally {
            await api.deleteActivity(pid, id1)
            await api.deleteActivity(pid, id2)
            await api.archiveProject(pid)
        }
    })

    test('#11 bulk delete with confirm removes rows', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('bulk-del') })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.rowCheckbox', { activity: id }).click()
            acceptNextDialog(page)
            const bulk = page.waitForResponse(
                (r) => r.url().includes('/v1/activities/bulk') && r.request().method() === 'POST',
            )
            await byQa(page, 'activities.list.bulkDelete').click()
            expect((await bulk).ok()).toBeTruthy()
            await expect(byQa(page, 'activities.list.row', { activity: id })).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, id).catch(() => {})
            await api.archiveProject(pid)
        }
    })

    test('#12 yellow task drawer from selected row with deal link', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('lnk'),
        })
        const dealId = await api.createDeal(pid, {
            name: uniqueName('deal'),
            contactId,
        })
        const id = await api.createActivity(pid, {
            title: uniqueName('with-deal'),
            links: [{ entityType: 'deal', entityId: dealId }],
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.rowCheckbox', { activity: id }).click()
            await byQa(page, 'activities.list.createTask').click()
            await expect(byQa(page, 'host.drawer.activity.title')).toBeVisible()
            await expect(byQa(page, 'host.drawer.activity.deal')).toBeVisible()
        } finally {
            await api.deleteActivity(pid, id)
            await api.deleteDeal(pid, dealId)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })
})
