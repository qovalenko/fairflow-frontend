import type { Page } from '@playwright/test'
import { byQa } from './qa'

/** Modules required for full products flows (catalog + order types for sales). */
export const PRODUCT_MODULES = ['deals', 'contacts', 'orders', 'products'] as const

/** Cross-module GETs that 403 on a slim project — expected, not T-001 regressions. */
export const PRODUCTS_FORBIDDEN_ALLOW = ['/v1/companies', '/v1/activities'] as const

export async function gotoProductsList(page: Page): Promise<void> {
    await page.goto('/products')
    await byQa(page, 'products.list').waitFor({ state: 'visible', timeout: 30_000 })
}

/** Open react-select control and pick an option by data-qa-* on the menu item. */
export async function pickSelectOption(
    page: Page,
    controlId: string,
    optionId: string,
    optionData: Record<string, string>,
): Promise<void> {
    await byQa(page, controlId).click()
    await byQa(page, optionId, optionData).click()
}
