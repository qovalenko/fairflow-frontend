import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { AUTOMATION_PROJECT_MODULES, grantAutomationWriteWithoutManage } from '../support/automation'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test.describe('automation connections + DLQ (catalog #113–114, #133, #116–117 P1)', () => {
    test('#113 create connection via form', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-conn-form'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        const name = uniqueName('conn')
        try {
            await page.goto('/automation/connections/new')
            await byQa(page, 'automation.connectionForm.name').fill(name)
            await byQa(page, 'automation.connectionForm.url').fill(
                'https://webhook.site/fairflow-e2e-test',
            )
            const post = page.waitForResponse(
                (r) =>
                    r.url().includes('/v1/automation/connections') &&
                    r.request().method() === 'POST',
            )
            await byQa(page, 'automation.connectionForm.save').click()
            expect((await post).ok()).toBeTruthy()
            await expect(page).toHaveURL(/\/automation\/connections$/, { timeout: 20_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#114 CC1: deny-listed URL shows inline error', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-conn-deny'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/connections/new')
            await byQa(page, 'automation.connectionForm.name').fill(uniqueName('bad-url'))
            await byQa(page, 'automation.connectionForm.url').fill('http://127.0.0.1/hook')
            await byQa(page, 'automation.connectionForm.save').click()
            await expect(byQa(page, 'automation.connectionForm.urlError')).toBeVisible({
                timeout: 15_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#116 CC3 P1: connection form without manage — NoPermissionState', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('autom-conn-nom'), AUTOMATION_PROJECT_MODULES)
        await grantAutomationWriteWithoutManage(page, pid)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/connections/new')
            await expect(byQa(page, 'automation.shared.noPermission')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#117 CC4 P1: edit connection 404', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-conn-404'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/connections/missing-id/edit')
            await expect(byQa(page, 'automation.shared.notFound')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#133 happy: DLQ retry queues another attempt', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-dlq-retry'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        const contactId = await api.createContact(pid, {
            firstName: 'DLQ',
            lastName: uniqueName('retry'),
            email: `${uniqueName('dlq')}@example.test`,
        })
        const connId = await api.createAutomationConnection(pid, {
            name: uniqueName('fail-hook'),
            url: 'https://httpstat.us/500',
        })
        const ruleId = await api.createAutomationRule(pid, {
            name: uniqueName('wh-fail'),
            enabled: true,
            actions: [{ type: 'send_webhook', connectionId: connId, config: {} }],
        })
        try {
            await api.runAutomationRule(pid, ruleId, contactId)
            let dlqId: string | undefined
            for (let i = 0; i < 12; i++) {
                const rows = await api.listAutomationDlq(pid, 'failed')
                if (rows.length > 0) {
                    dlqId = rows[0].id
                    break
                }
                await page.waitForTimeout(2000)
            }
            test.skip(!dlqId, 'DLQ entry not seeded on stand — webhook failure path unavailable')

            await page.goto('/automation/dlq')
            const retryBtn = byQa(page, 'automation.dlq.retry', { dlq: dlqId! })
            await expect(retryBtn).toBeVisible({ timeout: 30_000 })
            const retryReq = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/automation/dlq/${dlqId}/retry`) &&
                    r.request().method() === 'POST',
            )
            await retryBtn.click()
            const res = await retryReq
            expect(res.ok(), `DLQ retry POST (${res.status()})`).toBeTruthy()
        } finally {
            await api.deleteContact(pid, contactId)
            await api.deleteAutomationRule(pid, ruleId)
            await api.deleteAutomationConnection(pid, connId)
            await api.archiveProject(pid)
        }
    })
})
