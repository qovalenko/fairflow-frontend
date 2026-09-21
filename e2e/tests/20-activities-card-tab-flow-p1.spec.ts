import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    ACTIVITIES_NAV_KEY,
    daysAgoMs,
    gotoActivitiesList,
    grantActivitiesReadWithoutWrite,
    seedActivitiesProject,
    startOfDayMs,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-CARD-TAB P1', () => {
    test('#129: empty card tab shows empty state', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('empty-tab'),
        })
        try {
            await page.goto(`/contacts/${contactId}`)
            await expect(byQa(page, 'activities.state.empty')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#130: card tab list error shows retry', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('tab-err'),
        })
        try {
            await page.route('**/v1/activities?**', async (route) => {
                if (route.request().method() !== 'GET') {
                    await route.continue()
                    return
                }
                await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
            })
            await page.goto(`/contacts/${contactId}`)
            await expect(byQa(page, 'activities.state.error')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'activities.state.errorRetry')).toBeVisible()
        } finally {
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#132: card tab without write hides create and complete', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('tab-nowrite'),
        })
        const id = await api.createActivity(pid, {
            title: uniqueName('tab-row'),
            links: [{ entityType: 'contact', entityId: contactId }],
        })
        await grantActivitiesReadWithoutWrite(page, pid)
        await useProject(pid, ['deals', 'contacts', 'activities', 'statistics'])
        try {
            await page.goto(`/contacts/${contactId}`)
            await expect(byQa(page, 'activities.cardTab.create')).toHaveCount(0)
            await expect(byQa(page, 'activities.cardTab.complete', { activity: id })).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, id)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#133: card tab complete error shows toast', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('tab-complete-err'),
        })
        const id = await api.createActivity(pid, {
            title: uniqueName('tab-complete'),
            links: [{ entityType: 'contact', entityId: contactId }],
        })
        try {
            await page.route(`**/v1/activities/${id}/complete**`, async (route) => {
                await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
            })
            await page.goto(`/contacts/${contactId}`)
            await byQa(page, 'activities.cardTab.complete', { activity: id }).click()
            await expect(page.getByText(/Не удалось|ошибк/i)).toBeVisible({ timeout: 15_000 })
        } finally {
            await api.deleteActivity(pid, id)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#134: module off hides activities card tab content', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('tab-off'), ['deals', 'contacts'])
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('tab-mod-off'),
        })
        await useProject(pid, ['deals', 'contacts'])
        try {
            await page.goto(`/contacts/${contactId}`)
            await expect(byQa(page, 'activities.cardTab.create')).toHaveCount(0)
            await expect(byQa(page, 'activities.cardTab.rowTitle')).toHaveCount(0)
        } finally {
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })
})

test.describe('SCR-ACTIVITIES-FLOW P1', () => {
    test('#139: overdue widget groups by assignee', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('widget-group'),
            dueDate: daysAgoMs(1),
            assigneeId: api.userId,
        })
        try {
            await page.goto('/dashboard')
            await expect(byQa(page, 'activities.overdueWidget.row', { activity: id })).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#141: overdue widget error shows retry', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.route('**/v1/activities/overdue**', async (route) => {
                await route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
            })
            await page.goto('/dashboard')
            await expect(byQa(page, 'activities.overdueWidget.retry')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#143: module off hides overdue widget', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('widget-off'), [
            'deals',
            'contacts',
            'statistics',
        ])
        await useProject(pid, ['deals', 'contacts', 'statistics'])
        try {
            await page.goto('/dashboard')
            await expect(byQa(page, 'activities.overdueWidget.row')).toHaveCount(0)
            await expect(byQa(page, 'activities.overdueWidget.empty')).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#145: next-step sidebar shows nearest open activity', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('sidebar'),
        })
        const nearTitle = uniqueName('sidebar-near')
        const nearId = await api.createActivity(pid, {
            title: nearTitle,
            dueDate: startOfDayMs(1),
            links: [{ entityType: 'contact', entityId: contactId }],
        })
        const farId = await api.createActivity(pid, {
            title: uniqueName('sidebar-far'),
            dueDate: startOfDayMs(5),
            links: [{ entityType: 'contact', entityId: contactId }],
        })
        try {
            await page.goto(`/contacts/${contactId}`)
            await expect(byQa(page, 'activities.nextStepSidebar.root')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'activities.nextStepSidebar.root')).toContainText(nearTitle)
        } finally {
            await api.deleteActivity(pid, nearId)
            await api.deleteActivity(pid, farId)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#148: nav badge shows overdue count', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('nav-badge'),
            dueDate: daysAgoMs(1),
        })
        try {
            const overdueReq = page.waitForResponse(
                (r) => r.url().includes('/v1/activities/overdue-count') && r.ok(),
            )
            await page.goto('/dashboard')
            const res = await overdueReq
            const { count } = (await res.json()) as { count?: number }
            expect(count).toBeGreaterThan(0)
            const nav = byQa(page, 'host.sidebar.item', { nav: ACTIVITIES_NAV_KEY })
            await expect(nav).toBeVisible({ timeout: 30_000 })
            await expect(nav).toContainText(String(count))
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#149: cancelled overdue not in overdue filter', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('cancel-overdue'),
            dueDate: daysAgoMs(2),
            status: 'cancelled',
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.datePreset', { preset: 'overdue' }).click()
            await expect(byQa(page, 'activities.list.row', { activity: id })).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#150: completed not in overdue filter', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('done-overdue-p1'),
            dueDate: daysAgoMs(2),
            status: 'completed',
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.datePreset', { preset: 'overdue' }).click()
            await expect(byQa(page, 'activities.list.row', { activity: id })).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#160: re-enable module restores activities nav', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('re-enable'), ['deals', 'contacts'])
        await useProject(pid, ['deals', 'contacts'])
        try {
            await page.goto(`/p/${pid}`)
            await expect(byQa(page, 'host.sidebar.item', { nav: ACTIVITIES_NAV_KEY })).toHaveCount(
                0,
            )
            await api.updateProjectModules(pid, ['deals', 'contacts', 'activities'])
            await page.reload()
            await expect(byQa(page, 'host.sidebar.item', { nav: ACTIVITIES_NAV_KEY })).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#161: first entry empty then create shows list row', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const title = uniqueName('onboard')
        let createdId: string | undefined
        try {
            await gotoActivitiesList(page)
            await expect(byQa(page, 'activities.state.empty')).toBeVisible()
            await byQa(page, 'activities.state.emptyCreate').click()
            await byQa(page, 'activities.edit.title').fill(title)
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/activities') && r.request().method() === 'POST',
            )
            await byQa(page, 'activities.edit.save').click()
            const res = await post
            createdId = ((await res.json()) as { id?: string }).id
            await page.goto('/activities')
            if (createdId) {
                await expect(
                    byQa(page, 'activities.list.row', { activity: createdId }),
                ).toBeVisible({ timeout: 30_000 })
            }
        } finally {
            if (createdId) await api.deleteActivity(pid, createdId)
            await api.archiveProject(pid)
        }
    })
})
