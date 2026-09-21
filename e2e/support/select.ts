import type { Page, Locator } from '@playwright/test'
import { byQa } from './qa'

/**
 * Pick an option in a react-select control wrapped with a qa-id.
 * Uses keyboard navigation (no text/class selectors on menu items).
 */
export async function pickSelectByKeyboard(
    page: Page,
    qaId: string,
    downPresses = 1,
    data?: Record<string, string | number>,
): Promise<void> {
    await byQa(page, qaId, data).click()
    for (let i = 0; i < downPresses; i++) {
        await page.keyboard.press('ArrowDown')
    }
    await page.keyboard.press('Enter')
}

/** Open a react-select wrapped in a qa container and pick an option by value. */
export async function pickSelectOption(
    page: Page,
    selectQaId: string,
    optionValue: string,
): Promise<void> {
    const container = byQa(page, selectQaId)
    await container.locator('.select-control').click()
    await byQa(page, 'automation.form.selectOption', { value: optionValue }).click()
}

export async function pickSelectOptionIn(
    scope: Locator,
    page: Page,
    selectQaId: string,
    optionValue: string,
): Promise<void> {
    const container = byQa(scope, selectQaId)
    await container.locator('.select-control').click()
    await byQa(page, 'automation.form.selectOption', { value: optionValue }).click()
}
