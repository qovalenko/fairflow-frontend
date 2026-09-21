import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    acceptNextDialog,
    daysAgoMs,
    delayActivityPatch,
    grantActivitiesReadWithoutWrite,
    mockActivityDeleteError,
    mockActivityGetByIdError,
    mockActivityPatchError,
    seedActivitiesProject,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-DETAILS P1', () => {
    test('#63: details load error shows retry', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('err-load') })
        try {
            await mockActivityGetByIdError(page, id)
            await page.goto(`/activities/${id}`)
            await expect(byQa(page, 'activities.state.error')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'activities.state.errorRetry')).toBeVisible()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#64: missing activity shows not found UI', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/nonexistent-id-000')
            await expect(byQa(page, 'activities.details.notFound')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'activities.details.notFoundBack')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#65: read-only hides complete edit delete controls', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('ro-details') })
        await grantActivitiesReadWithoutWrite(page, pid)
        await useProject(pid, ['deals', 'contacts', 'activities', 'statistics'])
        try {
            await page.goto(`/activities/${id}`)
            await expect(byQa(page, 'activities.details.complete')).toHaveCount(0)
            await expect(byQa(page, 'activities.details.edit')).toHaveCount(0)
            await expect(byQa(page, 'activities.details.delete')).toHaveCount(0)
            await expect(byQa(page, 'activities.details.status')).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#66: terminal activity hides complete and disables status', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('terminal'),
            status: 'completed',
        })
        try {
            await page.goto(`/activities/${id}`)
            await expect(byQa(page, 'activities.details.complete')).toHaveCount(0)
            await expect(byQa(page, 'activities.details.status')).toBeVisible()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#67: repeat complete on completed is idempotent', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('recomplete') })
        await api.completeActivity(pid, id)
        try {
            await page.goto(`/activities/${id}`)
            await expect(byQa(page, 'activities.details.complete')).toHaveCount(0)
            const row = await api.getActivity(pid, id)
            expect(row?.status).toBe('completed')
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#68: cancel delete confirm keeps activity', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('cancel-del') })
        try {
            await page.goto(`/activities/${id}`)
            page.once('dialog', (dialog) => dialog.dismiss())
            await byQa(page, 'activities.details.delete').click()
            await expect(page).toHaveURL(new RegExp(`/activities/${id}$`))
            const row = await api.getActivity(pid, id)
            expect(row?.id).toBe(id)
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#69: status patch error shows danger toast', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('patch-err'),
            status: 'planned',
        })
        try {
            await mockActivityPatchError(page, id)
            await page.goto(`/activities/${id}`)
            await byQa(page, 'activities.details.status').click()
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            await expect(page.getByText('Не удалось изменить статус')).toBeVisible({
                timeout: 15_000,
            })
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#70: delete error keeps user on details page', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('del-err') })
        try {
            await mockActivityDeleteError(page, id)
            await page.goto(`/activities/${id}`)
            acceptNextDialog(page)
            await byQa(page, 'activities.details.delete').click()
            await expect(page).toHaveURL(new RegExp(`/activities/${id}$`))
            await expect(page.getByText('Не удалось удалить активность')).toBeVisible({
                timeout: 15_000,
            })
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#71: overdue badge visible on overdue activity', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('overdue-badge'),
            dueDate: daysAgoMs(1),
            status: 'planned',
        })
        try {
            await page.goto(`/activities/${id}`)
            await expect(page.getByText('Просрочено')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#72: result block visible after complete', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('result'),
            type: 'call',
            direction: 'outbound',
        })
        try {
            await page.goto(`/activities/${id}`)
            await byQa(page, 'activities.details.complete').click()
            await page.goto(`/activities/${id}`)
            await expect(page.getByText('Результат', { exact: true })).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })
})

test.describe('SCR-ACTIVITIES-DETAILS P2', () => {
    test('#75: busy disables action buttons during mutation', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('busy') })
        try {
            await delayActivityPatch(page, id, 2_000)
            await page.goto(`/activities/${id}`)
            await byQa(page, 'activities.details.status').click()
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            await expect(byQa(page, 'activities.details.edit')).toBeDisabled({
                timeout: 5_000,
            })
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })
})
