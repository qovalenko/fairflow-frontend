import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    pickActivityType,
    seedActivitiesProject,
    startOfDayMs,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-EDIT P0', () => {
    test('#76 create task with title only redirects to details', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const title = uniqueName('task-create')
        let createdId: string | undefined
        try {
            await page.goto('/activities/new')
            await byQa(page, 'activities.edit.title').fill(title)
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/activities') && r.request().method() === 'POST',
            )
            await byQa(page, 'activities.edit.save').click()
            const res = await post
            expect(res.ok()).toBeTruthy()
            createdId = ((await res.json()) as { id?: string }).id
            await expect(page).toHaveURL(new RegExp(`/activities/${createdId}$`))
        } finally {
            if (createdId) await api.deleteActivity(pid, createdId)
            await api.archiveProject(pid)
        }
    })

    test('#77 create call requires direction', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        let createdId: string | undefined
        try {
            await page.goto('/activities/new')
            await pickActivityType(page, 1)
            await byQa(page, 'activities.edit.title').fill(uniqueName('call'))
            await byQa(page, 'activities.edit.direction', { direction: 'outbound' }).click()
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/activities') && r.request().method() === 'POST',
            )
            await byQa(page, 'activities.edit.save').click()
            const res = await post
            expect(res.ok()).toBeTruthy()
            createdId = ((await res.json()) as { id?: string }).id
        } finally {
            if (createdId) await api.deleteActivity(pid, createdId)
            await api.archiveProject(pid)
        }
    })

    test('#78 create meeting with start/end', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        let createdId: string | undefined
        try {
            await page.goto('/activities/new')
            await pickActivityType(page, 2)
            await byQa(page, 'activities.edit.title').fill(uniqueName('meeting'))
            await byQa(page, 'activities.edit.meetingStart').fill('2026-08-20T10:00')
            await byQa(page, 'activities.edit.meetingEnd').fill('2026-08-20T11:00')
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/activities') && r.request().method() === 'POST',
            )
            await byQa(page, 'activities.edit.save').click()
            expect((await post).ok()).toBeTruthy()
            createdId = ((await (await post).json()) as { id?: string }).id
        } finally {
            if (createdId) await api.deleteActivity(pid, createdId)
            await api.archiveProject(pid)
        }
    })

    test('#79 create note without due date', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        let createdId: string | undefined
        try {
            await page.goto('/activities/new')
            await pickActivityType(page, 3)
            await byQa(page, 'activities.edit.noteText').fill(uniqueName('note-body'))
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/activities') && r.request().method() === 'POST',
            )
            await byQa(page, 'activities.edit.save').click()
            expect((await post).ok()).toBeTruthy()
            createdId = ((await (await post).json()) as { id?: string }).id
        } finally {
            if (createdId) await api.deleteActivity(pid, createdId)
            await api.archiveProject(pid)
        }
    })

    test('#80 edit dueDate patches activity', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('edit-due'),
            type: 'task',
            dueDate: startOfDayMs(),
        })
        try {
            await page.goto(`/activities/${id}/edit`)
            await byQa(page, 'activities.edit.dueDate').fill('2026-09-01')
            const patch = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/activities/${id}`) &&
                    r.request().method() === 'PATCH',
            )
            await byQa(page, 'activities.edit.save').click()
            expect((await patch).ok()).toBeTruthy()
            await expect(page).toHaveURL(new RegExp(`/activities/${id}$`))
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#81 edit assignee (same user reassignment)', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('assignee'),
            assigneeId: api.userId,
        })
        try {
            await page.goto(`/activities/${id}/edit`)
            await byQa(page, 'activities.edit.assignee').click()
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            const patch = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/activities/${id}`) &&
                    r.request().method() === 'PATCH',
            )
            await byQa(page, 'activities.edit.save').click()
            expect((await patch).ok()).toBeTruthy()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#82 calendar prefill dueDate query on new form', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities/new?dueDate=2026-08-20T10:00')
            await expect(byQa(page, 'activities.edit.dueDate')).toHaveValue('2026-08-20')
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#83 type select enabled on create only', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('type-lock') })
        try {
            await page.goto('/activities/new')
            await expect(byQa(page, 'activities.edit.type')).toBeVisible()
            await expect(byQa(page, 'activities.edit.typeLocked')).toHaveCount(0)
            await page.goto(`/activities/${id}/edit`)
            await expect(byQa(page, 'activities.edit.typeLocked')).toBeDisabled()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })
})
