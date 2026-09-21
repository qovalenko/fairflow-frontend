import type { Page } from '@playwright/test'
import { byQa } from './qa'
import { STORAGE_KEYS } from './env'
import { omitPermissions } from './statistics'
import { clearProjectContext } from './projectContext'

/** Default modules for deals e2e projects. */
export const DEALS_MODULES = ['deals', 'contacts'] as const

export const DEALS_WITH_COMPANIES = ['deals', 'contacts', 'companies'] as const

export const DEALS_WITH_ORDERS = ['deals', 'contacts', 'orders'] as const

/** Navigate to deals list and wait for the shell to render. */
export async function gotoDealsList(page: Page): Promise<void> {
    await page.goto('/deals')
    await byQa(page, 'deals.list.create')
        .or(byQa(page, 'deals.list.empty'))
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 })
}

/** Open deals via sidebar nav item (catalog #1). */
export async function openDealsFromSidebar(page: Page): Promise<void> {
    await page.goto('/')
    await byQa(page, 'host.sidebar.item', { nav: 'portfolio.deals' }).click()
    await byQa(page, 'deals.list.create')
        .or(byQa(page, 'deals.list.empty'))
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 })
}

/** Open the list create drawer. */
export async function openListCreateDrawer(page: Page): Promise<void> {
    const open = byQa(page, 'deals.list.create').or(byQa(page, 'deals.list.createEmpty'))
    await open.first().click()
}

/** Switch list/kanban segment on deals screens. */
export async function switchDealsView(page: Page, view: 'list' | 'kanban'): Promise<void> {
    await byQa(page, `deals.view.segment.${view}`).click()
}

/** Pick a react-select option by qa-id (`<selectId>.option` + data-qa-value). */
export async function pickSelectOption(
    page: Page,
    selectId: string,
    value: string,
): Promise<void> {
    await byQa(page, selectId).click()
    await byQa(page, `${selectId}.option`, { value }).click()
}

/** Confirm a native browser dialog (delete/confirm flows). */
export async function acceptDialog(page: Page): Promise<void> {
    page.once('dialog', (d) => d.accept())
}

/** Navigate to deals kanban and wait for the shell to render. */
export async function gotoDealsKanban(page: Page): Promise<void> {
    await page.goto('/deals/kanban')
    await byQa(page, 'deals.kanban.create')
        .or(byQa(page, 'deals.view.segment.kanban'))
        .or(byQa(page, 'deals.kanban.empty'))
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 })
}

/** Navigate to deals dashboard and wait for shell. */
export async function gotoDealsDashboard(page: Page): Promise<void> {
    await page.goto('/deals/dashboard')
    await byQa(page, 'deals.dashboard.root')
        .or(byQa(page, 'deals.dashboard.empty'))
        .or(byQa(page, 'deals.dashboard.error'))
        .or(byQa(page, 'deals.dashboard.noPermission'))
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 })
}

/** Navigate to deals trash and wait for shell. */
export async function gotoDealsTrash(page: Page): Promise<void> {
    await page.goto('/deals/trash')
    await byQa(page, 'deals.trash.empty')
        .or(byQa(page, 'deals.trash.row'))
        .or(byQa(page, 'deals.trash.error'))
        .or(byQa(page, 'deals.trash.noPermission'))
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 })
}

/** Count visible deal rows in the list. */
export async function countDealRows(page: Page): Promise<number> {
    return byQa(page, 'deals.list.row').count()
}

/** Drop active project from localStorage (host ST-19 guard scenarios). */
export { clearProjectContext }

/** Strip permission keys from PDP projection (negative permission cases). */
export { omitPermissions }

/** Force project role in persisted session (reopen/member gating). */
export async function forceSessionProjectRole(
    page: Page,
    projectId: string,
    role: string,
): Promise<void> {
    await page.addInitScript(
        ({ sessionKey, pid, role: projectRole }) => {
            const patch = () => {
                const raw = localStorage.getItem(sessionKey)
                if (!raw) return
                try {
                    const envelope = JSON.parse(raw) as {
                        state?: { user?: { projects?: Array<{ id: string; role?: string }> } }
                    }
                    const projects = envelope.state?.user?.projects ?? []
                    for (const p of projects) {
                        if (p.id === pid) p.role = projectRole
                    }
                    localStorage.setItem(sessionKey, JSON.stringify(envelope))
                } catch {
                    /* best-effort */
                }
            }
            patch()
        },
        { sessionKey: STORAGE_KEYS.sessionUser, pid: projectId, role },
    )
}

/** Default extra pipeline payload for filter e2e (non-default, 1 active + terminals). */
export function defaultExtraPipeline(name: string): Record<string, unknown> {
    return {
        name,
        isDefault: false,
        stages: [
            { name: 'Новая', kind: 'active', order: 0, color: '#3b82f6' },
            { name: 'Выиграна', kind: 'won', order: 1, color: '#10b981' },
            { name: 'Проиграна', kind: 'lost', order: 2, color: '#ef4444' },
        ],
    }
}
