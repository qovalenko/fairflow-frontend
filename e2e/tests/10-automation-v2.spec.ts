import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { pickSelectOption } from '../support/select'
import { AUTOMATION_PROJECT_MODULES } from '../support/automation'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test.describe('automation v2 canvas (catalog #161, #164–169, #174, #177 P1)', () => {
    test('#164 happy: v2 new editor shows palette and canvas', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-v2-new'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/v2/new')
            await expect(byQa(page, 'automation.v2editor.palette')).toBeVisible({
                timeout: 30_000,
            })
            await expect(byQa(page, 'automation.v2editor.canvas')).toBeVisible()
            await expect(byQa(page, 'automation.v2editor.toolbar')).toBeVisible()
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#165 add trigger node from palette', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-v2-tr'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/v2/new')
            await byQa(page, 'automation.v2editor.paletteItem', {
                kind: 'trigger',
                type: 'crm.contact.created',
            }).click()
            await expect(byQa(page, 'automation.v2editor.canvas')).toBeVisible()
            await byQa(page, 'automation.v2editor.node', { kind: 'trigger' }).click()
            await expect(byQa(page, 'automation.v2editor.properties')).toBeVisible({
                timeout: 15_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#168 add create_activity action node', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-v2-act'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/v2/new')
            await byQa(page, 'automation.v2editor.paletteItem', {
                kind: 'trigger',
                type: 'crm.contact.created',
            }).click()
            await byQa(page, 'automation.v2editor.paletteItem', {
                kind: 'action',
                type: 'create_activity',
            }).click()
            await expect(byQa(page, 'automation.v2editor.node', { kind: 'action' })).toBeVisible({
                timeout: 15_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#166 condition node: predicate fields and true/false handles', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('autom-v2-cond'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/v2/new')
            await byQa(page, 'automation.v2editor.paletteItem', {
                kind: 'trigger',
                type: 'crm.contact.created',
            }).click()
            await byQa(page, 'automation.v2editor.paletteItem', {
                kind: 'condition',
                type: 'condition',
            }).click()
            await byQa(page, 'automation.v2editor.node', { kind: 'condition' }).click()
            await expect(byQa(page, 'automation.v2editor.properties')).toBeVisible({
                timeout: 15_000,
            })
            await byQa(page, 'automation.v2editor.conditionField').fill('contact.email')
            await pickSelectOption(page, 'automation.v2editor.conditionOp', 'eq')
            await byQa(page, 'automation.v2editor.conditionValue').fill('test@example.test')
            await expect(byQa(page, 'automation.v2editor.handleTrue')).toHaveCount(1)
            await expect(byQa(page, 'automation.v2editor.handleFalse')).toHaveCount(1)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#169 send_webhook action with connection select on canvas', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('autom-v2-wh'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        const connId = await api.createAutomationConnection(pid, {
            name: uniqueName('v2-hook'),
            url: 'https://webhook.site/fairflow-v2-e2e',
        })
        try {
            await page.goto('/automation/v2/new')
            await byQa(page, 'automation.v2editor.paletteItem', {
                kind: 'trigger',
                type: 'crm.contact.created',
            }).click()
            await byQa(page, 'automation.v2editor.paletteItem', {
                kind: 'action',
                type: 'send_webhook',
            }).click()
            await byQa(page, 'automation.v2editor.node', { kind: 'action' }).click()
            await pickSelectOption(page, 'automation.v2editor.actionType', 'send_webhook')
            await pickSelectOption(page, 'automation.v2editor.webhookConnection', connId)
            await expect(byQa(page, 'automation.v2editor.webhookConnection')).toBeVisible()
        } finally {
            await api.deleteAutomationConnection(pid, connId)
            await api.archiveProject(pid)
        }
    })

    test('#174 save new v2 scenario disabled redirects to /automation/v2/:id', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('autom-v2-save'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        const name = uniqueName('v2-scenario')
        try {
            await page.goto('/automation/v2/new')
            await byQa(page, 'automation.v2editor.name').fill(name)
            await byQa(page, 'automation.v2editor.paletteItem', {
                kind: 'trigger',
                type: 'crm.contact.created',
            }).click()
            await byQa(page, 'automation.v2editor.paletteItem', {
                kind: 'action',
                type: 'create_activity',
            }).click()
            const post = page.waitForResponse(
                (r) => r.url().includes('/v1/automation/rules') && r.request().method() === 'POST',
            )
            await byQa(page, 'automation.v2editor.saveDisabled').click()
            const res = await post
            expect(res.ok(), `v2 save POST (${res.status()})`).toBeTruthy()
            await expect(page).toHaveURL(/\/automation\/v2\/[^/]+$/, { timeout: 30_000 })
        } finally {
            await api.cleanupAutomationRules(pid)
            await api.archiveProject(pid)
        }
    })

    test('#161 open v2 rule from list', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-v2-open'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        const ruleId = await api.createAutomationRule(pid, {
            name: uniqueName('v2-open'),
            engineVersion: 2,
            graph: {
                version: 2,
                nodes: [
                    {
                        id: 'n1',
                        type: 'trigger',
                        position: { x: 0, y: 0 },
                        config: { triggerType: 'crm.contact.created', event_name: 'crm.contact.created' },
                    },
                    {
                        id: 'n2',
                        type: 'action',
                        position: { x: 200, y: 0 },
                        config: { actionType: 'create_activity', title: 'x' },
                    },
                ],
                edges: [
                    {
                        id: 'e1',
                        source: 'n1',
                        sourceHandle: 'out',
                        target: 'n2',
                    },
                ],
            },
        })
        try {
            await page.goto('/automation/v2')
            await byQa(page, 'automation.v2list.open', { rule: ruleId }).click()
            await expect(page).toHaveURL(new RegExp(`/automation/v2/${ruleId}$`))
            await expect(byQa(page, 'automation.v2editor.canvas')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.deleteAutomationRule(pid, ruleId)
            await api.archiveProject(pid)
        }
    })

    test('#177 ST-9 P1: v2 bad id shows NotFoundState', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-v2-404'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/v2/bad-scenario-id')
            await expect(byQa(page, 'automation.shared.notFound')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })
})
