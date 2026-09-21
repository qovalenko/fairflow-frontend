import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    grantActivitiesReadWithoutWrite,
    grantActivitiesReadWriteWithoutDelete,
    mockActivitiesTrashListError,
    mockActivityCreateError,
    mockActivityRestoreError,
    seedActivitiesProject,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-TRASH P1', () => {
    test('#103: trash load error shows retry', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await mockActivitiesTrashListError(page)
            await page.goto('/activities/trash')
            await expect(byQa(page, 'activities.state.error')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'activities.state.errorRetry')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#105: restore disabled without delete permission', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('trash-ro') })
        await api.deleteActivity(pid, id)
        await grantActivitiesReadWriteWithoutDelete(page, pid)
        await useProject(pid, ['deals', 'contacts', 'activities', 'statistics'])
        try {
            await page.goto('/activities/trash')
            await expect(byQa(page, 'activities.trash.restore', { activity: id })).toBeDisabled()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#106: restore error shows danger toast', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('restore-err') })
        await api.deleteActivity(pid, id)
        try {
            await mockActivityRestoreError(page, id)
            await page.goto('/activities/trash')
            await byQa(page, 'activities.trash.restore', { activity: id }).click()
            await byQa(page, 'activities.trash.restoreConfirm').click()
            await expect(page.getByText('Не удалось восстановить активность')).toBeVisible({
                timeout: 15_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })
})

test.describe('SCR-ACTIVITIES-DRAWER P1', () => {
    test('#113: drawer defaults assignee to current user', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities')
            await byQa(page, 'host.create.open').click()
            await byQa(page, 'host.create.task').click()
            await expect(byQa(page, 'host.drawer.activity.assignee')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#114: drawer task has due date field', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities')
            await byQa(page, 'host.create.open').click()
            await byQa(page, 'host.create.task').click()
            await expect(byQa(page, 'host.drawer.activity.dueDate')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#115: drawer blocks submit without title', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities')
            await byQa(page, 'host.create.open').click()
            await byQa(page, 'host.create.task').click()
            await byQa(page, 'host.drawer.activity.submit').click()
            await expect(byQa(page, 'host.drawer.activity.title')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#116: drawer call without direction blocked', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities')
            await byQa(page, 'host.create.open').click()
            await byQa(page, 'host.create.call').click()
            await byQa(page, 'host.drawer.activity.title').fill(uniqueName('drawer-call-block'))
            await byQa(page, 'host.drawer.activity.submit').click()
            await expect(byQa(page, 'host.drawer.activity.direction')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#117: drawer meeting without dates blocked', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities')
            await byQa(page, 'host.create.open').click()
            await byQa(page, 'host.create.meeting').click()
            await byQa(page, 'host.drawer.activity.title').fill(uniqueName('drawer-meet-block'))
            await byQa(page, 'host.drawer.activity.submit').click()
            await expect(byQa(page, 'host.drawer.activity.meetingStart')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#118: drawer API error keeps drawer open', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await mockActivityCreateError(page)
            await page.goto('/activities')
            await byQa(page, 'host.create.open').click()
            await byQa(page, 'host.create.task').click()
            await byQa(page, 'host.drawer.activity.title').fill(uniqueName('drawer-api-err'))
            await byQa(page, 'host.drawer.activity.submit').click()
            await expect(byQa(page, 'host.drawer.activity.title')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#119: no write hides activities drawer items', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        await grantActivitiesReadWithoutWrite(page, pid)
        await useProject(pid, ['deals', 'contacts', 'activities', 'statistics'])
        try {
            await page.goto('/activities')
            await byQa(page, 'host.create.open').click()
            await expect(byQa(page, 'host.create.task')).toHaveCount(0)
            await expect(byQa(page, 'host.create.call')).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#120: module off hides activities drawer items', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('drawer-off'), ['deals', 'contacts'])
        await useProject(pid, ['deals', 'contacts'])
        try {
            await page.goto('/deals')
            await byQa(page, 'host.create.open').click()
            await expect(byQa(page, 'host.create.task')).toHaveCount(0)
            await expect(byQa(page, 'host.create.call')).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })
})
