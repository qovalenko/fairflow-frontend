import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { pickSelectOption } from '../support/select'
import { AUTOMATION_PROJECT_MODULES } from '../support/automation'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

async function seedProject(api: import('../fixtures/api').ApiClient, useProject: (pid: string, m?: string[]) => Promise<void>) {
    const pid = await api.createProject(uniqueName('autom-list'), AUTOMATION_PROJECT_MODULES)
    await useProject(pid, AUTOMATION_PROJECT_MODULES)
    return pid
}

test.describe('automation list flows (catalog #11, #17, #20, #27–31, #36–37, #44, #50)', () => {
    test('#17 happy: list title and seeded rule card', async ({ page, api, useProject }) => {
        const pid = await seedProject(api, useProject)
        const name = uniqueName('rule-a')
        const ruleId = await api.createAutomationRule(pid, { name, enabled: true })
        try {
            await page.goto('/automation')
            await expect(byQa(page, 'automation.list.title')).toBeVisible({ timeout: 30_000 })
            await expect(byQa(page, 'automation.list.card', { rule: ruleId })).toBeVisible()
        } finally {
            await api.deleteAutomationRule(pid, ruleId)
            await api.archiveProject(pid)
        }
    })

    test('#11 onboarding: empty list CTA navigates to /automation/new', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await seedProject(api, useProject)
        try {
            await page.goto('/automation')
            await expect(byQa(page, 'automation.list.empty')).toBeVisible({ timeout: 30_000 })
            await byQa(page, 'automation.list.createFirst').click()
            await expect(page).toHaveURL(/\/automation\/new$/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#20 search filters rule cards by name', async ({ page, api, useProject }) => {
        const pid = await seedProject(api, useProject)
        const visible = uniqueName('find-me')
        const hidden = uniqueName('other-rule')
        const idVisible = await api.createAutomationRule(pid, { name: visible })
        const idHidden = await api.createAutomationRule(pid, { name: hidden })
        try {
            await page.goto('/automation')
            await expect(byQa(page, 'automation.list.card', { rule: idVisible })).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'automation.list.search').fill(visible)
            await expect(byQa(page, 'automation.list.card', { rule: idVisible })).toBeVisible()
            await expect(byQa(page, 'automation.list.card', { rule: idHidden })).toHaveCount(0)
        } finally {
            await api.deleteAutomationRule(pid, idVisible)
            await api.deleteAutomationRule(pid, idHidden)
            await api.archiveProject(pid)
        }
    })

    test('#27 nav: Connections and DLQ links', async ({ page, api, useProject }) => {
        const pid = await seedProject(api, useProject)
        try {
            await page.goto('/automation')
            await expect(byQa(page, 'automation.list.navConnections')).toBeVisible({
                timeout: 30_000,
            })
            await byQa(page, 'automation.list.navConnections').click()
            await expect(page).toHaveURL(/\/automation\/connections$/)
            await page.goto('/automation')
            await byQa(page, 'automation.list.navDlq').click()
            await expect(page).toHaveURL(/\/automation\/dlq$/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#28 nav: Problems link', async ({ page, api, useProject }) => {
        const pid = await seedProject(api, useProject)
        try {
            await page.goto('/automation')
            await byQa(page, 'automation.list.navProblems').click()
            await expect(page).toHaveURL(/\/automation\/problems$/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#29 nav: Editor v2 link', async ({ page, api, useProject }) => {
        const pid = await seedProject(api, useProject)
        try {
            await page.goto('/automation')
            await byQa(page, 'automation.list.navEditorV2').click()
            await expect(page).toHaveURL(/\/automation\/v2\/new$/)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#30 create rule button opens /automation/new', async ({ page, api, useProject }) => {
        const pid = await seedProject(api, useProject)
        const ruleId = await api.createAutomationRule(pid, { name: uniqueName('seed') })
        try {
            await page.goto('/automation')
            await byQa(page, 'automation.list.create').click()
            await expect(page).toHaveURL(/\/automation\/new$/)
        } finally {
            await api.deleteAutomationRule(pid, ruleId)
            await api.archiveProject(pid)
        }
    })

    test('#31 edit navigates to rule edit form', async ({ page, api, useProject }) => {
        const pid = await seedProject(api, useProject)
        const ruleId = await api.createAutomationRule(pid, { name: uniqueName('edit-me') })
        try {
            await page.goto('/automation')
            await byQa(page, 'automation.list.edit', { rule: ruleId }).click()
            await expect(page).toHaveURL(new RegExp(`/automation/${ruleId}/edit$`))
        } finally {
            await api.deleteAutomationRule(pid, ruleId)
            await api.archiveProject(pid)
        }
    })

    test('#36–37 toggle off→on and on→off', async ({ page, api, useProject }) => {
        const pid = await seedProject(api, useProject)
        const ruleId = await api.createAutomationRule(pid, { name: uniqueName('toggle'), enabled: false })
        try {
            await page.goto('/automation')
            const toggle = byQa(page, 'automation.list.toggle', { rule: ruleId })
            await expect(toggle).toBeVisible({ timeout: 30_000 })
            const enableReq = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/automation/rules/${ruleId}/enabled`) &&
                    r.request().method() === 'PUT',
            )
            await toggle.click()
            await enableReq
            await expect(byQa(page, 'automation.list.statusTag', { rule: ruleId })).toContainText(
                /Включ/i,
                { timeout: 15_000 },
            )
            const disableReq = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/automation/rules/${ruleId}/enabled`) &&
                    r.request().method() === 'PUT',
            )
            await toggle.click()
            await disableReq
        } finally {
            await api.deleteAutomationRule(pid, ruleId)
            await api.archiveProject(pid)
        }
    })

    test('#44 delete rule via confirm dialog', async ({ page, api, useProject }) => {
        const pid = await seedProject(api, useProject)
        const ruleId = await api.createAutomationRule(pid, { name: uniqueName('delete-me') })
        try {
            await page.goto('/automation')
            await byQa(page, 'automation.list.delete', { rule: ruleId }).click()
            await expect(byQa(page, 'automation.list.deleteDialog')).toBeVisible()
            const delReq = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/automation/rules/${ruleId}`) &&
                    r.request().method() === 'DELETE',
            )
            await byQa(page, 'automation.list.deleteConfirm').click()
            await delReq
            await expect(byQa(page, 'automation.list.card', { rule: ruleId })).toHaveCount(0, {
                timeout: 15_000,
            })
        } finally {
            await api.cleanupAutomationRules(pid)
            await api.archiveProject(pid)
        }
    })

    test('#50 manual run dialog submits entity id', async ({ page, api, useProject }) => {
        const pid = await seedProject(api, useProject)
        const contactId = await api.createContact(pid, {
            firstName: 'E2E',
            lastName: uniqueName('run'),
            email: `${uniqueName('run')}@example.test`,
        })
        const ruleId = await api.createAutomationRule(pid, {
            name: uniqueName('manual'),
            enabled: true,
        })
        try {
            await page.goto('/automation')
            await byQa(page, 'automation.list.manualRun', { rule: ruleId }).click()
            await byQa(page, 'automation.list.manualRunEntityId').fill(contactId)
            const runReq = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/automation/rules/${ruleId}/run`) &&
                    r.request().method() === 'POST',
            )
            await byQa(page, 'automation.list.manualRunSubmit').click()
            const res = await runReq
            expect(res.ok(), `manual run POST (${res.status()})`).toBeTruthy()
        } finally {
            await api.deleteContact(pid, contactId)
            await api.deleteAutomationRule(pid, ruleId)
            await api.archiveProject(pid)
        }
    })
})
