import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    mockActivityGetByIdError,
    mockActivityPatchError,
    pickActivityType,
    seedActivitiesProject,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-EDIT P1', () => {
    test('#84: empty title shows validation toast', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/new')
            await byQa(page, 'activities.edit.save').click()
            await expect(page.getByText('Укажите название')).toBeVisible({ timeout: 15_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#85: call without direction blocked on save', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/new')
            await pickActivityType(page, 1)
            await byQa(page, 'activities.edit.title').fill(uniqueName('call-no-dir'))
            await byQa(page, 'activities.edit.save').click()
            await expect(page).toHaveURL(/\/activities\/new/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#86: meeting end before start blocked', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/new')
            await pickActivityType(page, 2)
            await byQa(page, 'activities.edit.title').fill(uniqueName('meet-bad'))
            await byQa(page, 'activities.edit.meetingStart').fill('2026-08-21T11:00')
            await byQa(page, 'activities.edit.meetingEnd').fill('2026-08-21T10:00')
            await byQa(page, 'activities.edit.save').click()
            await expect(
                page.getByText('Окончание встречи должно быть не раньше начала'),
            ).toBeVisible({ timeout: 15_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#89: edit load error shows retry', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('edit-err') })
        try {
            await mockActivityGetByIdError(page, id)
            await page.goto(`/activities/${id}/edit`)
            await expect(byQa(page, 'activities.state.error')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'activities.state.errorRetry')).toBeVisible()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#90: edit missing id shows not found UI', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/missing-edit-id/edit')
            await expect(byQa(page, 'activities.edit.notFound')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'activities.edit.notFoundBack')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#91: dirty guard confirms on back', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('dirty') })
        try {
            await page.goto(`/activities/${id}/edit`)
            await byQa(page, 'activities.edit.title').fill(uniqueName('dirty-changed'))
            page.once('dialog', (dialog) => {
                expect(dialog.message()).toContain('несохранённые')
                dialog.dismiss()
            })
            await byQa(page, 'activities.edit.back').click()
            await expect(page).toHaveURL(new RegExp(`/activities/${id}/edit`))
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#92: save 5xx keeps form open', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('save-err') })
        try {
            await mockActivityPatchError(page, id)
            await page.goto(`/activities/${id}/edit`)
            await byQa(page, 'activities.edit.title').fill(uniqueName('save-err-changed'))
            await byQa(page, 'activities.edit.save').click()
            await expect(page).toHaveURL(new RegExp(`/activities/${id}/edit`))
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#93: status completed on edit triggers complete endpoint', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('edit-complete'),
            status: 'planned',
        })
        try {
            await page.goto(`/activities/${id}/edit`)
            await byQa(page, 'activities.edit.status').click()
            for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            const completeReq = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/activities/${id}/complete`) &&
                    r.request().method() === 'POST',
            )
            await byQa(page, 'activities.edit.save').click()
            expect((await completeReq).ok()).toBeTruthy()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#95: assignee select loads members', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/new')
            await byQa(page, 'activities.edit.assignee').click()
            await expect(page.getByRole('option').first()).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#96: reminder offset field visible for task', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/new')
            await expect(byQa(page, 'activities.edit.reminder')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })
})

test.describe('SCR-ACTIVITIES-EDIT P2', () => {
    test('#97: department field visible on edit form', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/new')
            await expect(byQa(page, 'activities.edit.department')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#98: meeting location and participants fields visible', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/new')
            await pickActivityType(page, 2)
            await expect(byQa(page, 'activities.edit.location')).toBeVisible()
            await expect(byQa(page, 'activities.edit.participants')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#99: task priority and description fields visible', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/new')
            await expect(byQa(page, 'activities.edit.priority')).toBeVisible()
            await expect(byQa(page, 'activities.edit.description')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })
})
