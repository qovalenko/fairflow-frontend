import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import {
    AUTOMATION_PROJECT_MODULES,
    clearProjectContext,
    denyAutomationRead,
    grantAutomationWriteWithoutManage,
    useProjectWithoutAutomationModule,
} from '../support/automation'

test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test.describe('automation cross-cutting states (catalog #1–3, #109–110, #126–127, #143, #156)', () => {
    test('#1 ST-19: no project — NoProjectState on /automation', async ({ page }) => {
        await clearProjectContext(page)
        await page.goto('/automation')
        await expect(byQa(page, 'automation.shared.noProject')).toBeVisible({ timeout: 30_000 })
    })

    test('#2 ST-10: no automation:read — NoPermissionState', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('autom-deny'), AUTOMATION_PROJECT_MODULES)
        await denyAutomationRead(page, pid)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation')
            await expect(byQa(page, 'automation.shared.noPermission')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#3 ST-17: automation nav hidden when module disabled', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('autom-no-mod'), ['deals', 'contacts'])
        await useProjectWithoutAutomationModule(useProject, pid)
        try {
            await page.goto(`/p/${pid}`)
            await expect(byQa(page, 'host.sidebar.item', { nav: 'portfolio.deals' })).toBeVisible({
                timeout: 30_000,
            })
            await expect(
                byQa(page, 'host.sidebar.item', { nav: 'portfolio.automation' }),
            ).toHaveCount(0)
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#109 happy: /automation/connections list title', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-conn'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/connections')
            await expect(byQa(page, 'automation.connections.title')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#110 ST-10/11: connections without manage — NoPermissionState', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('autom-conn-deny'), AUTOMATION_PROJECT_MODULES)
        await grantAutomationWriteWithoutManage(page, pid)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/connections')
            await expect(byQa(page, 'automation.shared.noPermission')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#126 happy: /automation/dlq title', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-dlq'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/dlq')
            await expect(byQa(page, 'automation.dlq.title')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#127 ST-10: dlq without manage — NoPermissionState', async ({
        page,
        api,
        useProject,
    }) => {
        const pid = await api.createProject(uniqueName('autom-dlq-deny'), AUTOMATION_PROJECT_MODULES)
        await grantAutomationWriteWithoutManage(page, pid)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/dlq')
            await expect(byQa(page, 'automation.shared.noPermission')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#128 ST-3 P1: empty DLQ message', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-dlq-empty'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/dlq')
            await expect(byQa(page, 'automation.dlq.empty')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#143 happy: /automation/problems title', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-prob'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/problems')
            await expect(byQa(page, 'automation.problems.title')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#144 TP1 P1: problems empty period message', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-prob-empty'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/problems')
            await expect(byQa(page, 'automation.problems.empty')).toBeVisible({
                timeout: 30_000,
            })
        } finally {
            await api.archiveProject(pid)
        }
    })

    test('#156 happy: /automation/v2 list title', async ({ page, api, useProject }) => {
        const pid = await api.createProject(uniqueName('autom-v2'), AUTOMATION_PROJECT_MODULES)
        await useProject(pid, AUTOMATION_PROJECT_MODULES)
        try {
            await page.goto('/automation/v2')
            await expect(byQa(page, 'automation.v2list.title')).toBeVisible({ timeout: 30_000 })
        } finally {
            await api.archiveProject(pid)
        }
    })
})
