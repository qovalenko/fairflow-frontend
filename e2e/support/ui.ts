import { expect, type Locator } from '@playwright/test'

/**
 * Interactions for widgets whose real control is NOT the element carrying the
 * `data-qa-id`. Kept here so specs stay qa-id-only (T-028) instead of reaching
 * into class names / DOM structure themselves.
 */

/**
 * Choose an option in a `react-select` field.
 *
 * The qa-id sits on the WRAPPER div (react-select drops unknown props, so it
 * never reaches the DOM input — see the comment next to the filters in
 * CompanyList). Clicking the wrapper focuses the hidden combobox input; the
 * field is searchable, so typing narrows the menu to one option and Enter picks
 * the highlighted one.
 */
export async function pickSelectOption(field: Locator, label: string): Promise<void> {
    await expect(field).toBeVisible()
    await field.click()
    await field.page().keyboard.type(label, { delay: 20 })
    await field.page().keyboard.press('Enter')
}

/**
 * Tick the selection checkbox of a `DataTable` row.
 *
 * The checkbox is rendered by the shared `DataTable` (host) inside the row's
 * first cell and carries no qa-id of its own — only the row does. Scoping the
 * checkbox lookup to a qa-identified row keeps the selector stable enough:
 * the row identity still comes from `data-qa-company`, and the only structural
 * assumption is "selection is a checkbox inside the row".
 */
export async function selectRow(row: Locator): Promise<void> {
    await expect(row).toBeVisible()
    // Row qa-id sits on the name cell span, not the `<tr>` — checkbox lives in the
    // first column, so scope the click to the table row ancestor.
    await row.locator('xpath=ancestor::tr[1]//input[@type="checkbox"]').first().click()
}

/**
 * Toggle a `Switcher`.
 *
 * The qa-id lands on the `<input type=checkbox>` inside the styled `.switcher`
 * label, and that input is visually hidden (opacity:0) — it is never
 * `toBeVisible` and cannot be clicked. Click its label hit target instead
 * (same trick as 03-module-menu for the module toggle).
 */
export async function toggleSwitcher(switcher: Locator): Promise<void> {
    await expect(switcher).toBeAttached()
    await switcher.locator('xpath=ancestor::label[1]').click()
}

/**
 * Pick a `Radio` inside a `Radio.Group`. Same visually-hidden-input story as
 * `toggleSwitcher`: the qa-id is on the input, the clickable surface is its label.
 */
export async function pickRadio(radio: Locator): Promise<void> {
    await expect(radio).toBeAttached()
    await radio.locator('xpath=ancestor::label[1]').click()
}
