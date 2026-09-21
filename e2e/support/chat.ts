import type { Page } from '@playwright/test'
import { expect } from '../fixtures/test'
import { byQa } from './qa'

/** Open project-scoped chat and start a self-DM («Заметки себе»). Returns conversation id from URL. */
export async function openSelfDmConversation(page: Page, projectId: string): Promise<string> {
    await page.goto(`/p/${projectId}/chat`)

    const selfNotes = byQa(page, 'chat.list.selfNotes')
    const openCreate = byQa(page, 'chat.list.create').or(byQa(page, 'chat.list.createEmpty'))

    if (await selfNotes.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await selfNotes.click()
    } else {
        await expect(openCreate.first()).toBeVisible({ timeout: 30_000 })
        await openCreate.first().click()
        await expect(byQa(page, 'chat.create.drawer')).toBeVisible({ timeout: 15_000 })
        await byQa(page, 'chat.create.selfNotes').click()
    }

    await expect(page).toHaveURL(/\/chat\/[^/?#]+/, { timeout: 30_000 })
    const match = page.url().match(/\/chat\/([^/?#]+)/)
    expect(match?.[1], 'conversation id in URL').toBeTruthy()
    await expect(byQa(page, 'chat.composer.input')).toBeVisible({ timeout: 30_000 })
    return match![1]
}

/**
 * Send the current composer draft. If `text` is non-empty, fill the input first.
 * Passing '' would wipe an already-inserted CRM entity token (`insertEntity`
 * writes into the same textarea) and disable Send — leave text unset to submit
 * whatever is already in the composer.
 */
export async function sendChatMessage(page: Page, text?: string): Promise<string | undefined> {
    const createResponse = page.waitForResponse(
        (r) =>
            r.url().includes('/v1/chat/conversations/') &&
            r.url().includes('/messages') &&
            r.request().method() === 'POST',
        { timeout: 30_000 },
    )
    if (text) {
        await byQa(page, 'chat.composer.input').fill(text)
    }
    await expect(byQa(page, 'chat.composer.send')).toBeEnabled()
    await byQa(page, 'chat.composer.send').click()
    const res = await createResponse
    expect(res.ok(), `message POST ok (${res.status()})`).toBeTruthy()
    return ((await res.json()) as { id?: string }).id
}
