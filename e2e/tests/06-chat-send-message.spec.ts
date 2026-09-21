import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { openSelfDmConversation, sendChatMessage } from '../support/chat'

/**
 * CHAT-04 (TEST-SCENARIOS §14) — отправка сообщения в беседе.
 * Chat remote served locally with qa-ids; API + остальные remotes — the stand.
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test('CHAT-04: send message in self-DM conversation', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts', 'chat']
    const pid = await api.createProject(uniqueName('chat-send'), modules)
    await useProject(pid, modules)

    const body = uniqueName('hello')
    let conversationId: string | undefined
    let messageId: string | undefined

    try {
        conversationId = await openSelfDmConversation(page, pid)
        messageId = await sendChatMessage(page, body)

        if (messageId) {
            await expect(
                byQa(page, 'chat.message.text', { message: messageId }),
            ).toBeVisible({ timeout: 30_000 })
        } else {
            await expect(byQa(page, 'chat.message.row').first()).toBeVisible({ timeout: 30_000 })
        }
    } finally {
        if (conversationId) await api.archiveChatConversation(pid, conversationId)
        await api.archiveProject(pid)
    }
})
