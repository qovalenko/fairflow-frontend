import type { Page, Locator } from '@playwright/test'

/**
 * Resolve an element by its stable `data-qa-id` (T-028 convention).
 * Selectors in this suite go through here ONLY — never text/class/DOM structure.
 *
 *   byQa(page, 'host.login.email')
 *   byQa(page, 'contacts.list.row', { contact: id })
 *     -> [data-qa-id="contacts.list.row"][data-qa-contact="<id>"]
 *
 * The optional `data` map matches the extra `data-qa-<key>` attributes the helper
 * emits for entity identity (rows etc.), see notes/build/plans/QA-ID-CONVENTION.md.
 */
export function qaSelector(id: string, data?: Record<string, string | number>): string {
    if (!data || Object.keys(data).length === 0) {
        return `[data-qa-id="${id}"],[data-qa-id-legacy="${id}"]`
    }
    let suffix = ''
    for (const [key, value] of Object.entries(data)) {
        suffix += `[data-qa-${key}="${value}"]`
    }
    // Apply data-qa-* filters to BOTH OR branches — otherwise the first branch matches all
    // siblings sharing the same data-qa-id (e.g. host.createProject.module × N modules).
    return `[data-qa-id="${id}"]${suffix},[data-qa-id-legacy="${id}"]${suffix}`
}

export function byQa(
    scope: Page | Locator,
    id: string,
    data?: Record<string, string | number>,
): Locator {
    return scope.locator(qaSelector(id, data))
}

/** Active tab/button variant (`data-qa-active="true"`). */
export function byQaActive(
    scope: Page | Locator,
    id: string,
    data?: Record<string, string | number>,
): Locator {
    return byQa(scope, id, { ...data, active: 'true' })
}
