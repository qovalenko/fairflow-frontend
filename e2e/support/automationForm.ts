import type { Page } from '@playwright/test'
import { byQa } from '../support/qa'
import { pickSelectOption } from '../support/select'

/** Fill minimal v1 rule form: trigger + create_activity action. */
export async function fillClassicRuleForm(
    page: Page,
    name: string,
    trigger = 'crm.contact.created',
): Promise<void> {
    await byQa(page, 'automation.form.name').fill(name)
    await pickSelectOption(page, 'automation.form.triggerSelect', trigger)
    await byQa(page, 'automation.form.addAction').click()
    const actionRow = byQa(page, 'automation.form.actionRow').first()
    await pickSelectOptionInAction(page, actionRow, 'create_activity')
    await byQa(page, 'automation.form.activityTitle').first().fill('E2E auto activity')
}

async function pickSelectOptionInAction(
    page: Page,
    actionRow: ReturnType<typeof byQa>,
    actionType: string,
): Promise<void> {
    await actionRow.locator('[data-qa-id="automation.form.actionTypeSelect"] .select-control').click()
    await byQa(page, 'automation.form.selectOption', { value: actionType }).click()
}
