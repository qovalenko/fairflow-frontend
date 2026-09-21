import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    seedActivitiesProject,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-TRASH P0', () => {
    test('#100 open trash shows soft-deleted activity', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('trash-list') })
        await api.deleteActivity(pid, id)
        try {
            await page.goto('/activities/trash')
            await expect(byQa(page, 'activities.trash.row', { activity: id })).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#101 restore removes activity from trash', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('trash-restore') })
        await api.deleteActivity(pid, id)
        try {
            await page.goto('/activities/trash')
            await byQa(page, 'activities.trash.restore', { activity: id }).click()
            const restore = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/activities/${id}/restore`) &&
                    r.request().method() === 'POST',
            )
            await byQa(page, 'activities.trash.restoreConfirm').click()
            await restore
            await expect(byQa(page, 'activities.trash.row', { activity: id })).toHaveCount(0)
            const live = await api.getActivity(pid, id)
            expect(live?.id).toBe(id)
        } finally {
            await api.deleteActivity(pid, id).catch(() => {})
            await api.archiveProject(pid)
        }
    })
})

test.describe('SCR-ACTIVITIES-DRAWER P0', () => {
    test('#108 header drawer creates task', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const title = uniqueName('drawer-task')
        try {
            await page.goto('/activities')
            await byQa(page, 'host.create.open').click()
            await byQa(page, 'host.create.task').click()
            await byQa(page, 'host.drawer.activity.title').fill(title)
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/activities') && r.request().method() === 'POST',
            )
            await byQa(page, 'host.drawer.activity.submit').click()
            expect((await post).ok()).toBeTruthy()
        } finally {
            const rows = await api.listActivities(pid, { query: title })
            for (const r of rows) await api.deleteActivity(pid, r.id)
            await api.archiveProject(pid)
        }
    })

    test('#109 drawer call with outbound direction', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities')
            await byQa(page, 'host.create.open').click()
            await byQa(page, 'host.create.call').click()
            await byQa(page, 'host.drawer.activity.title').fill(uniqueName('drawer-call'))
            await byQa(page, 'host.drawer.activity.direction').click()
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/activities') && r.request().method() === 'POST',
            )
            await byQa(page, 'host.drawer.activity.submit').click()
            expect((await post).ok()).toBeTruthy()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#110 drawer meeting with start/end', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities')
            await byQa(page, 'host.create.open').click()
            await byQa(page, 'host.create.meeting').click()
            await byQa(page, 'host.drawer.activity.title').fill(uniqueName('drawer-meet'))
            await byQa(page, 'host.drawer.activity.meetingStart').fill('2026-08-21T09:00')
            await byQa(page, 'host.drawer.activity.meetingEnd').fill('2026-08-21T10:00')
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/activities') && r.request().method() === 'POST',
            )
            await byQa(page, 'host.drawer.activity.submit').click()
            expect((await post).ok()).toBeTruthy()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#111 drawer note entity', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        try {
            await page.goto('/activities')
            await byQa(page, 'host.create.open').click()
            await byQa(page, 'host.create.note').click()
            await byQa(page, 'host.drawer.activity.title').fill(uniqueName('drawer-note'))
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/activities') && r.request().method() === 'POST',
            )
            await byQa(page, 'host.drawer.activity.submit').click()
            expect((await post).ok()).toBeTruthy()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#112 drawer links contact and deal', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('drawer-lnk'),
        })
        const dealId = await api.createDeal(pid, {
            name: uniqueName('drawer-deal'),
            contactId,
        })
        try {
            await page.goto('/activities')
            await byQa(page, 'host.create.open').click()
            await byQa(page, 'host.create.task').click()
            await byQa(page, 'host.drawer.activity.title').fill(uniqueName('drawer-links'))
            await byQa(page, 'host.drawer.activity.contacts').click()
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            await byQa(page, 'host.drawer.activity.deal').click()
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/activities') && r.request().method() === 'POST',
            )
            await byQa(page, 'host.drawer.activity.submit').click()
            const body = (await (await post).json()) as { id?: string }
            expect(body.id).toBeTruthy()
        } finally {
            await api.deleteDeal(pid, dealId)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })
})
