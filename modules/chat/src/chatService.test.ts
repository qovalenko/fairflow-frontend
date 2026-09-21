import { describe, it, expect, vi, beforeEach } from 'vitest'

const fetchDataWithAxios = vi.fn()

vi.mock('@/services/ApiService', () => ({
    default: { fetchDataWithAxios: (...a: unknown[]) => fetchDataWithAxios(...a) },
}))

vi.mock('@/store/projectStore', () => ({
    useProjectStore: {
        getState: () => ({ currentProjectId: 'proj-1' }),
    },
}))

vi.mock('@/services/ChatService', () => ({
    newClientMessageId: () => 'client-msg-1',
}))

const apiGetDeals = vi.fn()
const apiGetContacts = vi.fn()
const apiGetCompanies = vi.fn()
const apiGetOrders = vi.fn()

vi.mock('@/services/CrmService', () => ({
    apiGetDeals: (...a: unknown[]) => apiGetDeals(...a),
    apiGetContacts: (...a: unknown[]) => apiGetContacts(...a),
    apiGetCompanies: (...a: unknown[]) => apiGetCompanies(...a),
    apiGetOrders: (...a: unknown[]) => apiGetOrders(...a),
}))

import {
    normConversation,
    normMessage,
    normMember,
    apiListConversations,
    apiGetConversation,
    apiGetMessages,
    apiSendMessage,
    apiEditMessage,
    apiDeleteMessage,
    apiCreateConversation,
    apiUpdateMembers,
    apiTransferOwnership,
    apiArchiveConversation,
    apiMarkRead,
    apiMarkAllRead,
    apiGetUnreadCount,
    apiGetReadReceipts,
    apiGetPresence,
    apiUploadAttachment,
    apiGetAttachmentDownloadUrl,
    apiSearchEntities,
    apiListProjectMembers,
    chatSocketUrl,
    chatStreamUrl,
    realtimeToken,
} from './chatService'

describe('chatService — нормализация', () => {
    it('normConversation: snake_case поля', () => {
        const vm = normConversation({
            id: 'c1',
            type: 'dm',
            title: 'DM',
            scope: { kind: 'project', scope_id: 'p1' },
            last_message_at: 1000,
            unread_count: 2,
            members: [{ user_id: 'u2', role: 'member' }],
        })
        expect(vm.id).toBe('c1')
        expect(vm.scope.scopeId).toBe('p1')
        expect(vm.lastMessageAt).toBe(1000)
        expect(vm.unreadCount).toBe(2)
        expect(vm.members?.[0].userId).toBe('u2')
    })

    it('normMessage: Long seq через toNum', () => {
        const vm = normMessage({
            id: 'm2',
            seq: { low: 7, high: 0 } as unknown as number,
            conversation_id: 'c1',
            sender_id: 'u1',
            text: 'x',
            sent_at: 1,
        })
        expect(vm.seq).toBe(7)
    })

    it('normMessage: entityRefs и replyToId', () => {
        const vm = normMessage({
            id: 'm1',
            seq: 5,
            conversation_id: 'c1',
            sender_id: 'u1',
            text: 'hi',
            entity_refs: [{ type: 'contact', id: 'ct1', label: 'Иван' }],
            reply_to_id: 'm0',
            sent_at: 123,
        })
        expect(vm.entityRefs?.[0]).toEqual({ type: 'contact', id: 'ct1', label: 'Иван' })
        expect(vm.replyToId).toBe('m0')
        expect(vm.sentAt).toBe(123)
    })

    it('normMember: defaults', () => {
        expect(normMember({})).toEqual({ userId: '', role: 'member', leftAt: null })
    })

    it('normConversation: lastMessage и archivedAt', () => {
        const vm = normConversation({
            id: 'c2',
            type: 'group',
            title: 'G',
            scope: { kind: 'project', scopeId: 'p1' },
            last_message: { id: 'm1', text: 'Hi', sender_id: 'u1', sent_at: 5, kind: 'text' },
            archived_at: 999,
        })
        expect(vm.lastMessage?.text).toBe('Hi')
        expect(vm.archivedAt).toBe(999)
    })

    it('normMessage: editedAt/deletedAt через Long', () => {
        const vm = normMessage({
            id: 'm3',
            seq: 1,
            conversation_id: 'c1',
            sender_id: 'u1',
            text: 'x',
            edited_at: { low: 100, high: 0 } as unknown as number,
            deleted_at: { low: 200, high: 0 } as unknown as number,
            sent_at: 1,
        })
        expect(vm.editedAt).toBe(100)
        expect(vm.deletedAt).toBe(200)
    })
})

describe('chatService — API граница', () => {
    beforeEach(() => {
        fetchDataWithAxios.mockReset()
    })

    it('apiListConversations подмешивает projectId из store', async () => {
        fetchDataWithAxios.mockResolvedValue({
            conversations: [{ id: 'c1', type: 'group', title: 'G', scope: { kind: 'project', scopeId: 'p1' } }],
        })
        const list = await apiListConversations({ scopeFilter: 'current' })
        expect(fetchDataWithAxios).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/v1/chat/conversations',
                params: expect.objectContaining({ projectId: 'proj-1', scopeFilter: 'current' }),
            }),
        )
        expect(list[0].id).toBe('c1')
    })

    it('apiSendMessage шлёт POST с idempotency payload', async () => {
        fetchDataWithAxios.mockResolvedValue({
            id: 'm1',
            seq: 1,
            conversation_id: 'c1',
            sender_id: 'u1',
            text: 'Привет',
            sent_at: 1,
        })
        const saved = await apiSendMessage('c1', {
            text: 'Привет',
            clientMessageId: 'cid-1',
            attachments: [],
            mentionIds: [],
        })
        expect(fetchDataWithAxios).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/v1/chat/conversations/c1/messages',
                method: 'post',
                data: expect.objectContaining({ text: 'Привет', clientMessageId: 'cid-1' }),
            }),
        )
        expect(saved.text).toBe('Привет')
    })

    it('apiListProjectMembers возвращает [] без projectId', async () => {
        expect(await apiListProjectMembers()).toEqual([])
        expect(fetchDataWithAxios).not.toHaveBeenCalled()
    })

    it('apiListProjectMembers мапит list из envelope', async () => {
        fetchDataWithAxios.mockResolvedValue({
            list: [{ userId: 'u1', name: 'Анна' }],
        })
        const members = await apiListProjectMembers('p1')
        expect(members).toEqual([{ id: 'u1', name: 'Анна' }])
    })

    it('apiListProjectMembers возвращает [] при ошибке API', async () => {
        fetchDataWithAxios.mockRejectedValue(new Error('403'))
        expect(await apiListProjectMembers('p1')).toEqual([])
    })

    it('apiGetConversation возвращает members', async () => {
        fetchDataWithAxios.mockResolvedValue({
            id: 'c1',
            type: 'group',
            title: 'G',
            scope: { kind: 'project', scopeId: 'p1' },
            members: [{ userId: 'u1', role: 'owner' }],
        })
        const conv = await apiGetConversation('c1', 'p1')
        expect(conv.members[0].userId).toBe('u1')
        expect(fetchDataWithAxios).toHaveBeenCalledWith(
            expect.objectContaining({ url: '/v1/chat/conversations/c1', params: { projectId: 'p1' } }),
        )
    })

    it('apiGetMessages с beforeSeq для keyset', async () => {
        fetchDataWithAxios.mockResolvedValue({
            messages: [{ id: 'm0', seq: 0, conversation_id: 'c1', sender_id: 'u1', text: 'old', sent_at: 1 }],
        })
        const msgs = await apiGetMessages({ conversationId: 'c1', beforeSeq: 5, limit: 50, projectId: 'p1' })
        expect(msgs[0].seq).toBe(0)
        expect(fetchDataWithAxios).toHaveBeenCalledWith(
            expect.objectContaining({ params: expect.objectContaining({ beforeSeq: 5 }) }),
        )
    })

    it('apiCreateConversation POST с idempotency', async () => {
        fetchDataWithAxios.mockResolvedValue({
            id: 'c-new',
            type: 'group',
            title: 'New',
            scope: { kind: 'project', scopeId: 'p1' },
        })
        const conv = await apiCreateConversation({ type: 'group', title: 'New', projectId: 'p1' })
        expect(conv.id).toBe('c-new')
        expect(fetchDataWithAxios).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'post',
                headers: expect.objectContaining({ 'Idempotency-Key': 'client-msg-1' }),
            }),
        )
    })

    it('apiUpdateMembers add через POST', async () => {
        fetchDataWithAxios.mockResolvedValue({
            id: 'c1',
            type: 'group',
            title: 'G',
            scope: { kind: 'project', scopeId: 'p1' },
            members: [{ userId: 'u2', role: 'member' }],
        })
        const conv = await apiUpdateMembers('c1', { add: ['u2'] })
        expect(conv.members).toHaveLength(1)
        expect(fetchDataWithAxios).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'post', data: expect.objectContaining({ add: ['u2'] }) }),
        )
    })

    it('apiUpdateMembers self-leave через DELETE', async () => {
        fetchDataWithAxios.mockResolvedValue({
            id: 'c1',
            type: 'group',
            title: 'G',
            scope: { kind: 'project', scopeId: 'p1' },
            members: [],
        })
        await apiUpdateMembers('c1', { remove: ['u1'] }, 'delete')
        expect(fetchDataWithAxios).toHaveBeenCalledWith(expect.objectContaining({ method: 'delete' }))
    })

    it('apiTransferOwnership POST newOwnerUserId', async () => {
        fetchDataWithAxios.mockResolvedValue({
            id: 'c1',
            type: 'group',
            title: 'G',
            scope: { kind: 'project', scopeId: 'p1' },
        })
        await apiTransferOwnership('c1', 'u2')
        expect(fetchDataWithAxios).toHaveBeenCalledWith(
            expect.objectContaining({ data: { newOwnerUserId: 'u2' } }),
        )
    })

    it('apiArchiveConversation POST archive', async () => {
        fetchDataWithAxios.mockResolvedValue({
            id: 'c1',
            type: 'group',
            title: 'G',
            scope: { kind: 'project', scopeId: 'p1' },
            archived_at: 1,
        })
        const conv = await apiArchiveConversation('c1')
        expect(conv.archivedAt).toBe(1)
    })

    it('apiEditMessage PATCH text', async () => {
        fetchDataWithAxios.mockResolvedValue({
            id: 'm1',
            seq: 1,
            conversation_id: 'c1',
            sender_id: 'u1',
            text: 'edited',
            edited_at: 2,
            sent_at: 1,
        })
        const msg = await apiEditMessage('m1', 'edited')
        expect(msg.text).toBe('edited')
        expect(msg.editedAt).toBe(2)
    })

    it('apiDeleteMessage DELETE tombstone', async () => {
        fetchDataWithAxios.mockResolvedValue({
            id: 'm1',
            seq: 1,
            conversation_id: 'c1',
            sender_id: 'u1',
            text: '',
            deleted_at: 3,
            sent_at: 1,
        })
        const msg = await apiDeleteMessage('m1')
        expect(msg.deletedAt).toBe(3)
    })

    it('apiMarkRead возвращает счётчики', async () => {
        fetchDataWithAxios.mockResolvedValue({ unreadCount: 2, totalUnread: 5 })
        const r = await apiMarkRead('c1', 10)
        expect(r).toEqual({ unreadCount: 2, totalUnread: 5 })
    })

    it('apiMarkAllRead возвращает updated', async () => {
        fetchDataWithAxios.mockResolvedValue({ updated: 3 })
        expect(await apiMarkAllRead('p1')).toEqual({ updated: 3 })
    })

    it('apiGetUnreadCount возвращает count и byProject', async () => {
        fetchDataWithAxios.mockResolvedValue({
            count: 4,
            byProject: [{ projectId: 'p1', count: 4 }],
        })
        const r = await apiGetUnreadCount({ projectId: 'p1', scopeFilter: 'current' })
        expect(r.count).toBe(4)
        expect(r.byProject?.[0]?.projectId).toBe('p1')
    })

    it('apiGetReadReceipts нормализует readBy', async () => {
        fetchDataWithAxios.mockResolvedValue({
            readBy: [{ user_id: 'u1', role: 'member' }],
            readCount: 1,
            totalMembers: 2,
            aggregateOnly: false,
        })
        const r = await apiGetReadReceipts('c1', 5)
        expect(r.readBy[0].userId).toBe('u1')
        expect(r.readCount).toBe(1)
    })

    it('apiGetPresence мапит snake_case', async () => {
        fetchDataWithAxios.mockResolvedValue({
            presence: [{ user_id: 'u1', online: true, last_seen_at: 100 }],
        })
        const list = await apiGetPresence('c1')
        expect(list[0]).toEqual({ userId: 'u1', online: true, lastSeenAt: 100 })
    })

    it('apiUploadAttachment multipart FormData', async () => {
        fetchDataWithAxios.mockResolvedValue({
            document_id: 'd1',
            version_id: 'v1',
            file_name: 'a.pdf',
            mime: 'application/pdf',
            size: 100,
        })
        const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
        const att = await apiUploadAttachment('c1', file)
        expect(att.documentId).toBe('d1')
        expect(att.fileName).toBe('a.pdf')
    })

    it('apiGetAttachmentDownloadUrl возвращает url', async () => {
        fetchDataWithAxios.mockResolvedValue({ url: 'https://cdn/x', expires_at: 999 })
        const r = await apiGetAttachmentDownloadUrl('v1')
        expect(r.url).toBe('https://cdn/x')
        expect(r.expiresAt).toBe(999)
    })
})

describe('chatService — apiSearchEntities', () => {
    beforeEach(() => {
        apiGetDeals.mockReset()
        apiGetContacts.mockReset()
        apiGetCompanies.mockReset()
        apiGetOrders.mockReset()
    })

    it('возвращает [] без projectId', async () => {
        expect(await apiSearchEntities('deal', 'foo')).toEqual([])
    })

    it('deal: метка из name', async () => {
        apiGetDeals.mockResolvedValue({ list: [{ id: 'd1', name: 'Big deal' }] })
        const refs = await apiSearchEntities('deal', 'big', 'p1')
        expect(refs[0]).toEqual({ type: 'deal', id: 'd1', label: 'Big deal' })
    })

    it('contact: метка из firstName lastName', async () => {
        apiGetContacts.mockResolvedValue({ list: [{ id: 'c1', firstName: 'Иван', lastName: 'Петров' }] })
        const refs = await apiSearchEntities('contact', 'иван', 'p1')
        expect(refs[0].label).toBe('Иван Петров')
    })

    it('company: метка из name', async () => {
        apiGetCompanies.mockResolvedValue({ list: [{ id: 'co1', name: 'Acme' }] })
        const refs = await apiSearchEntities('company', 'ac', 'p1')
        expect(refs[0].label).toBe('Acme')
    })

    it('order: метка из number и typeName', async () => {
        apiGetOrders.mockResolvedValue({ list: [{ id: 'o1', number: '42', typeName: 'Sale' }] })
        const refs = await apiSearchEntities('order', '42', 'p1')
        expect(refs[0].label).toBe('№ 42 · Sale')
    })

    it('бросает entity-search-failed при ошибке CRM', async () => {
        apiGetDeals.mockRejectedValue(new Error('500'))
        await expect(apiSearchEntities('deal', 'x', 'p1')).rejects.toThrow('entity-search-failed')
    })
})

describe('chatService — realtime URLs', () => {
    it('chatSocketUrl и chatStreamUrl включают projectId', () => {
        expect(chatSocketUrl({ projectId: 'p1' })).toContain('projectId=p1')
        expect(chatStreamUrl({ projectId: 'p1' })).toContain('projectId=p1')
    })

    it('realtimeToken читает cookie/localStorage через host helper', () => {
        expect(realtimeToken()).toBeNull()
    })
})
