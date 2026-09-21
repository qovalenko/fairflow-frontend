import type { Page } from '@playwright/test'
import { byQa } from './qa'
import type { ApiClient } from '../fixtures/api'

const DEFAULT_MODULES = ['deals', 'contacts']

/** Open header search overlay (catalog #13). */
export async function openSearchDialog(page: Page): Promise<void> {
    await byQa(page, 'host.search.trigger').click()
    await byQa(page, 'host.search.dialog').waitFor({ state: 'visible', timeout: 15_000 })
}

/** Type into overlay input and wait for debounced query (300ms + network). */
export async function typeInSearchDialog(page: Page, text: string): Promise<void> {
    const input = byQa(page, 'host.search.dialog.input')
    await input.fill(text)
    await page.waitForTimeout(400)
}

/**
 * Seed a contact, reindex, poll until query finds it in the search API.
 * Returns contact id and a stable query token (unique substring).
 */
export async function seedIndexedContact(
    api: ApiClient,
    projectId: string,
    data: { firstName: string; lastName: string; email?: string; phone?: string },
    queryToken: string,
): Promise<string> {
    const contactId = await api.createContact(projectId, data)
    await api.reindexSearch(projectId)

    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
        try {
            const resp = await api.searchQuery(projectId, queryToken, { perTypeLimit: 25 })
            const hit = resp.groups
                .flatMap((g) => g.list)
                .find((h) => h.entity_id === contactId)
            if (hit) return contactId
        } catch {
            /* stand may still warm up */
        }
        await new Promise((r) => setTimeout(r, 2000))
    }
    throw new Error(`search index did not include contact ${contactId} for "${queryToken}" within 90s`)
}

export { DEFAULT_MODULES }
