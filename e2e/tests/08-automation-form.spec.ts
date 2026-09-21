import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { pickSelectOption } from '../support/select'
import { AUTOMATION_PROJECT_MODULES, grantAutomationWriteWithoutManage } from '../support/automation'
import { fillClassicRuleForm } from '../support/automationForm'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test.describe('automation classic form (catalog #57–58, #64, #73, #75, #77–78, #88–89, #102)', () => {
    test('#57 create disabled rule returns to list', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-form'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        const name = uniqueName('created-off')
        try {
            await page.goto('/automation/new')
            await fillClassicRuleForm(page, name)
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/automation/rules') && r.request().method() === 'POST',
            )
            await byQa(page, 'automation.form.saveDisabled').click()
            const res = await post
            expect(res.ok()).toBeTruthy()
            await expect(page).toHaveURL(/\/automation$/, { timeout: 20_000 })
            const rules = await api.listAutomationRules(pid, name)
            expect(rules.some((r) => r.name === name)).toBeTruthy()
        } finally {
            await api.cleanupAutomationRules(pid)
            await api.archiveProject(pid)
        }
    })

    test('#58 create and enable rule', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-form-on'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        const name = uniqueName('created-on')
        try {
            await page.goto('/automation/new')
            await fillClassicRuleForm(page, name)
            await byQa(page, 'automation.form.saveEnabled').click()
            await expect(page).toHaveURL(/\/automation$/, { timeout: 20_000 })
            const rules = await api.listAutomationRules(pid, name)
            expect(rules.length).toBeGreaterThan(0)
        } finally {
            await api.cleanupAutomationRules(pid)
            await api.archiveProject(pid)
        }
    })

    test('#64 B6 / #77 C4: send_webhook blocked without manage', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-no-manage'), AUTOMATION_PROJECT_MODULES)
        await grantAutomationWriteWithoutManage(page, pid)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/new')
            await byQa(page, 'automation.form.name').fill(uniqueName('webhook-block'))
            await pickSelectOption(page, 'automation.form.triggerSelect', 'crm.contact.created')
            await byQa(page, 'automation.form.addAction').click()
            const actionRow = byQa(page, 'automation.form.actionRow').first()
            await actionRow
                .locator('[data-qa-id="automation.form.actionTypeSelect"] .select-control')
                .click()
            await expect(
                byQa(page, 'automation.form.selectOption', { value: 'send_webhook' }),
            ).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#73 webhook rule with connection select', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-wh'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        const connId = await api.createAutomationConnection(pid, {
            name: uniqueName('hook'),
            url: 'https://webhook.site/test-e2e-fairflow',
        })
        const name = uniqueName('wh-rule')
        try {
            await page.goto('/automation/new')
            await byQa(page, 'automation.form.name').fill(name)
            await pickSelectOption(page, 'automation.form.triggerSelect', 'crm.contact.created')
            await byQa(page, 'automation.form.addAction').click()
            const actionRow = byQa(page, 'automation.form.actionRow').first()
            await actionRow
                .locator('[data-qa-id="automation.form.actionTypeSelect"] .select-control')
                .click()
            await byQa(page, 'automation.form.selectOption', { value: 'send_webhook' }).click()
            const webhookSelect = byQa(page, 'automation.form.webhookConnection').first()
            await webhookSelect.locator('.select-control').click()
            await byQa(page, 'automation.form.selectOption', { value: connId }).click()
            await byQa(page, 'automation.form.saveDisabled').click()
            await expect(page).toHaveURL(/\/automation$/, { timeout: 20_000 })
        } finally {
            await api.cleanupAutomationRules(pid)
            await api.deleteAutomationConnection(pid, connId)
            await api.archiveProject(pid)
        }
    })

    test('#75 C2: no arbitrary URL input for send_webhook', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-no-url'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/new')
            await byQa(page, 'automation.form.addAction').click()
            const actionRow = byQa(page, 'automation.form.actionRow').first()
            await actionRow
                .locator('[data-qa-id="automation.form.actionTypeSelect"] .select-control')
                .click()
            await byQa(page, 'automation.form.selectOption', { value: 'send_webhook' }).click()
            await expect(byQa(page, 'automation.form.webhookConnection')).toBeVisible()
            await expect(byQa(page, 'automation.connectionForm.url')).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#78 edit existing rule and save', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-edit'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        const ruleId = await api.createAutomationRule(pid, { name: uniqueName('before') })
        const newName = uniqueName('after')
        try {
            await page.goto(`/automation/${ruleId}/edit`)
            await expect(byQa(page, 'automation.form.name')).toBeVisible({ timeout: 30_000 })
            await byQa(page, 'automation.form.name').fill(newName)
            const put = page.waitForResponse(
                (r) =>
                    r.url().includes(`/v1/automation/rules/${ruleId}`) &&
                    r.request().method() === 'PUT',
            )
            await byQa(page, 'automation.form.save').click()
            expect((await put).ok()).toBeTruthy()
        } finally {
            await api.deleteAutomationRule(pid, ruleId)
            await api.archiveProject(pid)
        }
    })

    test('#88 rule log section on edit form', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-log'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        const ruleId = await api.createAutomationRule(pid, { name: uniqueName('log-rule') })
        try {
            await page.goto(`/automation/${ruleId}/edit`)
            await expect(byQa(page, 'automation.log.section')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.deleteAutomationRule(pid, ruleId)
            await api.archiveProject(pid)
        }
    })

    test('#89 SF1: empty execution log message', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-log-empty'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        const ruleId = await api.createAutomationRule(pid, { name: uniqueName('no-runs') })
        try {
            await page.goto(`/automation/${ruleId}/edit`)
            await expect(byQa(page, 'automation.log.empty')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.deleteAutomationRule(pid, ruleId)
            await api.archiveProject(pid)
        }
    })

    test('#102 DR1 P1 (не #101 happy): dry-run overlay empty samples', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-dry'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        const ruleId = await api.createAutomationRule(pid, { name: uniqueName('dry') })
        try {
            await page.goto(`/automation/${ruleId}/edit`)
            await byQa(page, 'automation.form.dryRun').click()
            await expect(byQa(page, 'automation.dryRun.overlay')).toBeVisible()
            await byQa(page, 'automation.dryRun.run').click()
            await expect(byQa(page, 'automation.dryRun.empty')).toBeVisible({ timeout: 20_000 })
        } finally {
            await api.deleteAutomationRule(pid, ruleId)
            await api.archiveProject(pid)
        }
    })

    test('#79 D1 P1: edit 404 shows NotFoundState', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-404'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/nonexistent-rule-id/edit')
            await expect(byQa(page, 'automation.shared.notFound')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })
})
