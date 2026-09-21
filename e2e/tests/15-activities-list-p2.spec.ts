import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    daysAgoMs,
    gotoActivitiesList,
    seedActivitiesProject,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-LIST P2', () => {
    test('#33: column visibility toggle hides column', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('cols') })
        try {
            await gotoActivitiesList(page)
            await expect(page.getByRole('columnheader', { name: 'Приоритет' })).toBeVisible()
            await byQa(page, 'activities.list.columns').click()
            await byQa(page, 'activities.list.columnToggle', { column: 'priority' }).click()
            await expect(page.getByRole('columnheader', { name: 'Приоритет' })).toHaveCount(0)
            await expect(byQa(page, 'activities.list.row', { activity: id })).toBeVisible()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#34: select all on page checks every row', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id1 = await api.createActivity(pid, { title: uniqueName('sel-a') })
        const id2 = await api.createActivity(pid, { title: uniqueName('sel-b') })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.selectAll').click()
            await expect(byQa(page, 'activities.list.bulkCount')).toContainText('2')
            await expect(byQa(page, 'activities.list.bulkBar')).toBeVisible()
        } finally {
            await api.deleteActivity(pid, id1)
            await api.deleteActivity(pid, id2)
            await api.archiveProject(pid)
        }
    })

    test('#35: combined filters type overdue and search', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const needle = uniqueName('combo')
        const matchId = await api.createActivity(pid, {
            title: needle,
            type: 'task',
            dueDate: daysAgoMs(1),
        })
        const otherId = await api.createActivity(pid, {
            title: uniqueName('combo-other'),
            type: 'call',
            direction: 'outbound',
            dueDate: daysAgoMs(1),
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.search').fill(needle)
            await byQa(page, 'activities.list.datePreset', { preset: 'overdue' }).click()
            await byQa(page, 'activities.list.typeFilter').click()
            await page.getByRole('option', { name: 'Задача' }).click()
            await expect(byQa(page, 'activities.list.row', { activity: matchId })).toBeVisible()
            await expect(byQa(page, 'activities.list.row', { activity: otherId })).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, matchId)
            await api.deleteActivity(pid, otherId)
            await api.archiveProject(pid)
        }
    })

    test('#37: automation rule badge visible on list row', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('auto-badge') })
        try {
            await page.route('**/v1/activities?**', async (route) => {
                if (route.request().method() !== 'GET') {
                    await route.continue()
                    return
                }
                const upstream = await route.fetch()
                const body = (await upstream.json()) as {
                    list?: Array<Record<string, unknown>>
                }
                if (Array.isArray(body.list)) {
                    body.list = body.list.map((row) =>
                        row.id === id || row._id === id
                            ? { ...row, createdByRule: { ruleId: 'r1', name: 'demo' } }
                            : row,
                    )
                }
                await route.fulfill({
                    status: upstream.status(),
                    headers: upstream.headers(),
                    contentType: 'application/json',
                    body: JSON.stringify(body),
                })
            })
            await gotoActivitiesList(page)
            await expect(byQa(page, 'activities.list.row', { activity: id })).toContainText(
                'Авто: demo',
            )
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })
})
