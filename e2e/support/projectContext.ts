import type { Page } from '@playwright/test'
import { STORAGE_KEYS } from './env'

/** Drop the active project from localStorage (minimal-chrome / guard scenarios). */
export async function clearProjectContext(page: Page): Promise<void> {
    await page.evaluate(
        ({ idKey, projKey }) => {
            localStorage.removeItem(idKey)
            localStorage.removeItem(projKey)
        },
        { idKey: STORAGE_KEYS.projectId, projKey: STORAGE_KEYS.project },
    )
}
