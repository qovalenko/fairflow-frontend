import { test, expect } from '../fixtures/test'
import { byQa } from '../support/qa'
import { uniqueName } from '../support/env'
import { openSelfDmConversation, sendChatMessage } from '../support/chat'

/**
 * CHAT-CRM-01 — inline-ссылка на CRM-сущность в сообщении (P2.c / FR-CHAT-440).
 * В TEST-SCENARIOS §14 отдельного ID нет; сценарий из scope волны chat e2e.
 */
test.use({ forbiddenAllow: ['/v1/companies', '/v1/activities'] })

test('CHAT-CRM-01: send message with contact entity chip', async ({ page, api, useProject }) => {
    const modules = ['deals', 'contacts', 'chat']
    const pid = await api.createProject(uniqueName('chat-entity'), modules)
    await useProject(pid, modules)

    const last = uniqueName('link').replace(/[^a-zA-Z0-9-]/g, '')
    let contactId: string | undefined
    let conversationId: string | undefined

    try {
        contactId = await api.createContact(pid, {
            firstName: 'T029',
            lastName: last,
            email: `${last}@example.test`.toLowerCase(),
        })

        conversationId = await openSelfDmConversation(page, pid)

        await byQa(page, 'chat.composer.entityLink').click()
        await expect(byQa(page, 'chat.entityPicker.panel')).toBeVisible({ timeout: 15_000 })
        await byQa(page, 'chat.entityPicker.type', { type: 'contact' }).click()
        await byQa(page, 'chat.entityPicker.search').fill(last)

        await expect(
            byQa(page, 'chat.entityPicker.option', { entity: `contact_${contactId}` }),
        ).toBeVisible({ timeout: 30_000 })
        await byQa(page, 'chat.entityPicker.option', { entity: `contact_${contactId}` }).click()

        const messageId = await sendChatMessage(page)

        await expect(
            byQa(page, 'chat.message.entityChip', { entity: `contact_${contactId}` }),
        ).toBeVisible({ timeout: 30_000 })

        if (messageId) {
            await expect(
                byQa(page, 'chat.message.text', { message: messageId }),
            ).toBeVisible()
        }
    } finally {
        if (conversationId) await api.archiveChatConversation(pid, conversationId)
        if (contactId) await api.deleteContact(pid, contactId)
        await api.archiveProject(pid)
    }
})
