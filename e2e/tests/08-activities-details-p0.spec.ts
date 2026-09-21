import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    acceptNextDialog,
    seedActivitiesProject,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-DETAILS P0', () => {
    test('#55 open card shows header widgets', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const title = uniqueName('details-view')
        const id = await api.createActivity(pid, { title, description: 'e2e-desc' })
        try {
            await page.goto(`/activities/${id}`)
            await expect(byQa(page, 'activities.details.complete')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'activities.details.edit')).toBeVisible()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#56 complete marks activity completed', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('complete') })
        try {
            await page.goto(`/activities/${id}`)
            const completeReq = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/activities/${id}/complete`) &&
                    r.request().method() === 'POST',
            )
            await byQa(page, 'activities.details.complete').click()
            expect((await completeReq).ok()).toBeTruthy()
            const row = await api.getActivity(pid, id)
            expect(row?.status).toBe('completed')
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#57 complete and follow-up creates next activity', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const title = uniqueName('follow-src')
        const id = await api.createActivity(pid, { title })
        try {
            await page.goto(`/activities/${id}`)
            await byQa(page, 'activities.details.completeFollowUp').click()
            await byQa(page, 'activities.followUp.title').fill(uniqueName('follow-up'))
            const completeReq = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/activities/${id}/complete`) &&
                    r.request().method() === 'POST',
            )
            const createReq = page.waitForResponse(
                (r) => r.url().includes('/v1/activities') && r.request().method() === 'POST',
            )
            await byQa(page, 'activities.followUp.confirm').click()
            expect((await completeReq).ok()).toBeTruthy()
            expect((await createReq).ok()).toBeTruthy()
            await expect(page).toHaveURL(/\/activities\/[^/]+$/)
            expect(page.url()).not.toContain(id)
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#58 status select changes to in_progress', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('status'), status: 'planned' })
        try {
            await page.goto(`/activities/${id}`)
            const patch = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/activities/${id}`) &&
                    r.request().method() === 'PATCH',
            )
            await byQa(page, 'activities.details.status').click()
            await page.keyboard.press('ArrowDown')
            await page.keyboard.press('Enter')
            await patch
            const row = await api.getActivity(pid, id)
            expect(row?.status).toBe('in_progress')
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#59 delete with confirm redirects to list', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('delete') })
        try {
            await page.goto(`/activities/${id}`)
            acceptNextDialog(page)
            const del = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/activities/${id}`) &&
                    r.request().method() === 'DELETE',
            )
            await byQa(page, 'activities.details.delete').click()
            expect((await del).ok()).toBeTruthy()
            await expect(page).toHaveURL(/\/activities\/?$/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#60 edit navigates to edit form', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, { title: uniqueName('edit-nav') })
        try {
            await page.goto(`/activities/${id}`)
            await byQa(page, 'activities.details.edit').click()
            await expect(page).toHaveURL(new RegExp(`/activities/${id}/edit`))
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#61 related deal link navigates to deal card', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('rel'),
        })
        const dealId = await api.createDeal(pid, {
            name: uniqueName('rel-deal'),
            contactId,
        })
        const id = await api.createActivity(pid, {
            title: uniqueName('linked'),
            links: [{ entityType: 'deal', entityId: dealId }],
        })
        try {
            await page.goto(`/activities/${id}`)
            await byQa(page, 'activities.info.dealLink', { deal: dealId }).click()
            await expect(page).toHaveURL(new RegExp(`/deals/${dealId}`))
        } finally {
            await api.deleteActivity(pid, id)
            await api.deleteDeal(pid, dealId)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })
})
