import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    ACTIVITIES_FORBIDDEN_ALLOW,
    daysAgoMs,
    seedActivitiesProject,
    startOfDayMs,
} from '../support/activities'

test.use({ forbiddenAllow: ACTIVITIES_FORBIDDEN_ALLOW })

test.describe('SCR-ACTIVITIES-CARD-TAB P0', () => {
    test('#123 contact card tab lists linked activity', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('tab'),
        })
        const id = await api.createActivity(pid, {
            title: uniqueName('contact-tab'),
            links: [{ entityType: 'contact', entityId: contactId }],
        })
        try {
            await page.goto(`/contacts/${contactId}`)
            await expect(byQa(page, 'activities.cardTab.rowTitle', { activity: id })).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.deleteActivity(pid, id)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#124 deal card tab lists linked activity', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('deal-tab'),
        })
        const dealId = await api.createDeal(pid, {
            name: uniqueName('deal-tab'),
            contactId,
        })
        const id = await api.createActivity(pid, {
            title: uniqueName('deal-act'),
            links: [{ entityType: 'deal', entityId: dealId }],
        })
        try {
            await page.goto(`/deals/${dealId}`)
            await expect(byQa(page, 'activities.cardTab.rowTitle', { activity: id })).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.deleteActivity(pid, id)
            await api.deleteDeal(pid, dealId)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#125 card tab create opens drawer with prefilled link', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('tab-create'),
        })
        try {
            await page.goto(`/contacts/${contactId}`)
            await byQa(page, 'activities.cardTab.create').click()
            await expect(byQa(page, 'host.drawer.activity.title')).toBeVisible()
            await expect(byQa(page, 'host.drawer.activity.contacts')).toBeVisible()
        } finally {
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#126 next step highlights nearest open activity', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('next'),
        })
        const later = await api.createActivity(pid, {
            title: uniqueName('later'),
            dueDate: startOfDayMs(5),
            links: [{ entityType: 'contact', entityId: contactId }],
        })
        const sooner = await api.createActivity(pid, {
            title: uniqueName('sooner'),
            dueDate: startOfDayMs(1),
            links: [{ entityType: 'contact', entityId: contactId }],
        })
        try {
            await page.goto(`/contacts/${contactId}`)
            await expect(
                byQa(page, 'activities.cardTab.nextStepRow', { activity: sooner }),
            ).toBeVisible({ timeout: 30_000 })
            await expect(
                byQa(page, 'activities.cardTab.nextStepRow', { activity: later }),
            ).toHaveCount(0)
        } finally {
            await api.deleteActivity(pid, later)
            await api.deleteActivity(pid, sooner)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#127 inline complete on card tab row', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('inline'),
        })
        const id = await api.createActivity(pid, {
            title: uniqueName('inline-complete'),
            links: [{ entityType: 'contact', entityId: contactId }],
        })
        try {
            await page.goto(`/contacts/${contactId}`)
            const complete = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/activities/${id}/complete`) &&
                    r.request().method() === 'POST',
            )
            await byQa(page, 'activities.cardTab.complete', { activity: id }).click()
            expect((await complete).ok()).toBeTruthy()
        } finally {
            await api.deleteActivity(pid, id)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })

    test('#128 title click opens activity details', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: uniqueName('open-tab'),
        })
        const id = await api.createActivity(pid, {
            title: uniqueName('open-from-tab'),
            links: [{ entityType: 'contact', entityId: contactId }],
        })
        try {
            await page.goto(`/contacts/${contactId}`)
            await byQa(page, 'activities.cardTab.rowTitle', { activity: id }).click()
            await expect(page).toHaveURL(new RegExp(`/activities/${id}$`))
        } finally {
            await api.deleteActivity(pid, id)
            await api.deleteContact(pid, contactId)
            await api.archiveProject(pid)
        }
    })
})

test.describe('SCR-ACTIVITIES-DASHBOARD-WIDGET P0', () => {
    test('#136 widget shows overdue counter and rows', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('widget-overdue'),
            dueDate: daysAgoMs(1),
            status: 'planned',
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

    test('#137 widget row opens activity details', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('widget-open'),
            dueDate: daysAgoMs(2),
        })
        try {
            await page.goto('/dashboard')
            await byQa(page, 'activities.overdueWidget.row', { activity: id }).click()
            await expect(page).toHaveURL(new RegExp(`/activities/${id}$`))
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })

    test('#138 all activities link opens overdue filter', async ({ page, api, useProject }) => {
        const pid = await seedActivitiesProject(api, useProject)
        const id = await api.createActivity(pid, {
            title: uniqueName('widget-link'),
            dueDate: daysAgoMs(1),
        })
        try {
            await page.goto('/dashboard')
            await byQa(page, 'activities.overdueWidget.allActivities').click()
            await expect(page).toHaveURL(/\/activities/)
            await expect(byQa(page, 'activities.list.datePreset', { preset: 'overdue' })).toBeVisible()
            await expect(byQa(page, 'activities.list.row', { activity: id })).toBeVisible()
        } finally {
            await api.deleteActivity(pid, id)
            await api.archiveProject(pid)
        }
    })
})
