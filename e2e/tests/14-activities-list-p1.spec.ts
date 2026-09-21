import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    daysAgoMs,
    gotoActivitiesList,
    grantActivitiesReadWithoutWrite,
    grantActivitiesReadWriteWithoutDelete,
    mockActivitiesListError,
    mockActivityBulkError,
    seedActivitiesProject,
    startOfDayMs,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-LIST P1', () => {
    test('#13: empty project shows empty state with create CTA', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await gotoActivitiesList(page)
            await expect(byQa(page, 'activities.state.empty')).toBeVisible()
            await expect(byQa(page, 'activities.state.emptyCreate')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#14: filter with no matches shows empty filter state', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('visible') })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.search').fill(uniqueName('no-match-xyz'))
            await expect(byQa(page, 'activities.state.emptyFilter')).toBeVisible()
            await byQa(page, 'activities.state.filterReset').click()
            await expect(byQa(page, 'activities.list.row', { activity: id })).toBeVisible()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#15: list load error shows retry panel', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await mockActivitiesListError(page)
            await page.goto('/activities')
            await expect(byQa(page, 'activities.state.error')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'activities.state.errorRetry')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#17: read without write hides create and bulk actions', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('readonly') })
        await grantActivitiesReadWithoutWrite(page, pid)
        await useProject(pid, ['deals', 'contacts', 'activities', 'statistics'])
        try {
            await gotoActivitiesList(page)
            await expect(byQa(page, 'activities.list.create')).toHaveCount(0)
            await byQa(page, 'activities.list.rowCheckbox', { activity: id }).click()
            await expect(byQa(page, 'activities.list.bulkComplete')).toHaveCount(0)
            await expect(byQa(page, 'activities.list.createTask')).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#18: read without delete disables bulk delete', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('no-del') })
        await grantActivitiesReadWriteWithoutDelete(page, pid)
        await useProject(pid, ['deals', 'contacts', 'activities', 'statistics'])
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.rowCheckbox', { activity: id }).click()
            await expect(byQa(page, 'activities.list.bulkDelete')).toBeDisabled()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#19: type filter narrows list to selected types', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const taskId = await api.createActivity(pid, {
            title: uniqueName('type-task'),
            type: 'task',
        })
        const callId = await api.createActivity(pid, {
            title: uniqueName('type-call'),
            type: 'call',
            direction: 'outbound',
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.typeFilter').click()
            await page.getByRole('option', { name: 'Звонок' }).click()
            await expect(byQa(page, 'activities.list.row', { activity: callId })).toBeVisible()
            await expect(byQa(page, 'activities.list.row', { activity: taskId })).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, taskId)
            await api.deleteActivity(pid, callId)
            await api.archiveProject(pid)
        }
    })

    test('#20: status filter narrows list', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const plannedId = await api.createActivity(pid, {
            title: uniqueName('status-planned'),
            status: 'planned',
        })
        const doneId = await api.createActivity(pid, {
            title: uniqueName('status-done'),
            status: 'completed',
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.statusFilter').click()
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            await expect(byQa(page, 'activities.list.row', { activity: plannedId })).toBeVisible()
            await expect(byQa(page, 'activities.list.row', { activity: doneId })).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, plannedId)
            await api.deleteActivity(pid, doneId)
            await api.archiveProject(pid)
        }
    })

    test('#21: assignee filter shows only matching activities', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const mineId = await api.createActivity(pid, {
            title: uniqueName('mine'),
            assigneeId: api.userId,
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.assigneeFilter').click()
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            await expect(byQa(page, 'activities.list.row', { activity: mineId })).toBeVisible()
        } finally {
            await api.deleteActivity(pid, mineId)
            await api.archiveProject(pid)
        }
    })

    test('#22: unassigned filter shows activities without assignee', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const unassignedId = await api.createActivity(pid, {
            title: uniqueName('unassigned'),
            assigneeId: '',
        })
        const assignedId = await api.createActivity(pid, {
            title: uniqueName('assigned'),
            assigneeId: api.userId,
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.assigneeFilter').click()
            await page.getByText('Без ответственного', { exact: true }).click()
            await expect(
                byQa(page, 'activities.list.row', { activity: unassignedId }),
            ).toBeVisible()
            await expect(
                byQa(page, 'activities.list.row', { activity: assignedId }),
            ).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, unassignedId).catch(() => {})
            await api.deleteActivity(pid, assignedId)
            await api.archiveProject(pid)
        }
    })

    test('#23: date range filter limits visible rows', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const inRange = await api.createActivity(pid, {
            title: uniqueName('in-range'),
            dueDate: startOfDayMs(),
        })
        const outRange = await api.createActivity(pid, {
            title: uniqueName('out-range'),
            dueDate: daysAgoMs(30),
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.datePreset', { preset: 'today' }).click()
            await expect(byQa(page, 'activities.list.row', { activity: inRange })).toBeVisible()
            await expect(byQa(page, 'activities.list.row', { activity: outRange })).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, inRange)
            await api.deleteActivity(pid, outRange)
            await api.archiveProject(pid)
        }
    })

    test('#27: CSV export enabled only when rows selected', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('export') })
        try {
            await gotoActivitiesList(page)
            await expect(byQa(page, 'activities.list.export')).toBeDisabled()
            await byQa(page, 'activities.list.rowCheckbox', { activity: id }).click()
            await expect(byQa(page, 'activities.list.export')).toBeEnabled()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#29: bulk partial success shows warning toast', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const openId = await api.createActivity(pid, {
            title: uniqueName('bulk-partial-open'),
            status: 'planned',
        })
        const doneId = await api.createActivity(pid, {
            title: uniqueName('bulk-partial-done'),
            status: 'completed',
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.rowCheckbox', { activity: openId }).click()
            await byQa(page, 'activities.list.rowCheckbox', { activity: doneId }).click()
            await byQa(page, 'activities.list.bulkComplete').click()
            await expect(page.getByText(/Не удалось: 1|завершено: 1/i)).toBeVisible({
                timeout: 15_000,
            })
        } finally {
            await api.deleteActivity(pid, openId)
            await api.deleteActivity(pid, doneId)
            await api.archiveProject(pid)
        }
    })

    test('#28: trash button navigates to trash page', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.trash').click()
            await expect(page).toHaveURL(/\/activities\/trash/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#30: bulk network error keeps selection', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('bulk-err') })
        try {
            await mockActivityBulkError(page)
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.rowCheckbox', { activity: id }).click()
            await byQa(page, 'activities.list.bulkComplete').click()
            await expect(byQa(page, 'activities.list.bulkBar')).toBeVisible()
            await expect(byQa(page, 'activities.list.bulkCount')).toContainText('1')
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#31: column sort triggers server-side sort request', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('sort') })
        try {
            await gotoActivitiesList(page)
            const sortReq = page.waitForResponse(
                (r) =>
                    r.url().includes('/v1/activities') &&
                    r.request().method() === 'GET' &&
                    r.url().includes('sortField'),
            )
            await page.getByRole('columnheader', { name: 'Название' }).click()
            const res = await sortReq
            expect(res.ok()).toBeTruthy()
            expect(res.url()).toContain('sortField=title')
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#32: related deal link navigates to deal card', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('list-link'),
        })
        const dealId = await api.createDeal(pid, {
            name: uniqueName('list-deal'),
            contactId,
        })
        const id = await api.createActivity(pid, {
            title: uniqueName('list-deal-link'),
            links: [{ entityType: 'deal', entityId: dealId }],
        })
        try {
            await gotoActivitiesList(page)
            await byQa(page, 'activities.list.rowDealLink', { activity: id }).click()
            await expect(page).toHaveURL(new RegExp(`/deals/${dealId}`))
        } finally {
            await api.deleteActivity(pid, id)
            await api.deleteDeal(pid, dealId)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })
})
