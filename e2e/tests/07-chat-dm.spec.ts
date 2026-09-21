import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'

/**
 * CHAT-01 (TEST-SCENARIOS §14) — создание DM через UI.
 * На общем стенде один admin → self-DM («Заметки себе», FR-CHAT-030) как
 * доступный DM-путь без второго участника проекта.
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test('CHAT-01: create self-DM via new conversation drawer', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts', 'chat']
    const pid = await api.createProject(uniqueName('chat-dm'), modules)
    await useProject(pid, modules)

    let conversationId: string | undefined

    try {
        await page.goto(`/p/${pid}/chat`)

        const openCreate = byQa(page, 'chat.list.create').or(byQa(page, 'chat.list.createEmpty'))
        await expect(openCreate.first()).toBeVisible({ timeout: 30_000 })
        await openCreate.first().click()

        await expect(byQa(page, 'chat.create.drawer')).toBeVisible({ timeout: 15_000 })
        const createResponse = page.waitForResponse(
            (r) => r.url().includes('/v1/chat/conversations') && r.request().method() === 'POST',
            { timeout: 30_000 },
        )
        await byQa(page, 'chat.create.selfNotes').click()
        const res = await createResponse
        expect(res.ok(), `conversation POST ok (${res.status()})`).toBeTruthy()
        conversationId = ((await res.json()) as { id?: string }).id

        expect(conversationId, 'created conversation id').toBeTruthy()
        await expect(page).toHaveURL(new RegExp(`/chat/${conversationId}`), { timeout: 30_000 })
        await expect(
            byQa(page, 'chat.list.row', { conversation: conversationId! }),
        ).toBeVisible({ timeout: 30_000 })
        await expect(byQa(page, 'chat.composer.input')).toBeVisible({ timeout: 15_000 })
    } finally {
        if (conversationId) await api.archiveChatConversation(pid, conversationId)
        await api.archiveProject(pid)
    }
})
