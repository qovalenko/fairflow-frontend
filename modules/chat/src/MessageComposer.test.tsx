import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import MessageComposer from './MessageComposer'
import type { MemberVM, MessageVM } from './chatTypes'

const apiUploadAttachment = vi.fn()
vi.mock('./chatService', () => ({
    apiUploadAttachment: (...a: unknown[]) => apiUploadAttachment(...a),
}))
vi.mock('./chatUi', () => ({ notifyChatError: vi.fn() }))

const members: MemberVM[] = [{ userId: 'u2', role: 'member' }]

describe('MessageComposer', () => {
    beforeEach(() => {
        apiUploadAttachment.mockReset()
    })

    it('disabled: показывает причину no_permission', () => {
        render(
            <MessageComposer
                conversationId="c1"
                scope={{ kind: 'project', scopeId: 'p1' }}
                members={members}
                disabled
                disabledReason="no_permission"
                onSend={vi.fn()}
            />,
        )
        expect(screen.getByText('Нет права на отправку сообщений')).toBeInTheDocument()
    })

    it('отправка текста по кнопке и очистка поля', async () => {
        const onSend = vi.fn().mockResolvedValue(undefined)
        render(
            <MessageComposer
                conversationId="c1"
                scope={{ kind: 'project', scopeId: 'p1' }}
                members={members}
                onSend={onSend}
            />,
        )
        const area = screen.getByPlaceholderText(/Сообщение/)
        fireEvent.change(area, { target: { value: 'Привет всем' } })
        fireEvent.click(screen.getByText('Отправить'))
        await waitFor(() =>
            expect(onSend).toHaveBeenCalledWith({
                text: 'Привет всем',
                attachments: [],
                mentionIds: [],
                replyToId: null,
            }),
        )
        // setText('') идёт после await onSend — ждём ре-рендер, иначе гонка
        await waitFor(() => expect(area).toHaveValue(''))
    })

    it('Enter без Shift отправляет сообщение', async () => {
        const onSend = vi.fn().mockResolvedValue(undefined)
        render(
            <MessageComposer
                conversationId="c1"
                scope={{ kind: 'project', scopeId: 'p1' }}
                members={members}
                onSend={onSend}
            />,
        )
        const area = screen.getByPlaceholderText(/Сообщение/)
        fireEvent.change(area, { target: { value: 'Быстро' } })
        fireEvent.keyDown(area, { key: 'Enter', shiftKey: false })
        await waitFor(() => expect(onSend).toHaveBeenCalled())
    })

    it('reply-превью и отмена', () => {
        const reply: MessageVM = {
            id: 'm1',
            seq: 1,
            conversationId: 'c1',
            senderId: 'u2',
            senderType: 'user',
            kind: 'text',
            text: 'исходник',
            attachments: [],
            mentionIds: [],
            sentAt: 0,
        }
        const onCancelReply = vi.fn()
        render(
            <MessageComposer
                conversationId="c1"
                scope={{ kind: 'project', scopeId: 'p1' }}
                members={members}
                replyTo={reply}
                onCancelReply={onCancelReply}
                onSend={vi.fn()}
            />,
        )
        expect(screen.getByText(/Ответ: исходник/)).toBeInTheDocument()
        fireEvent.click(screen.getByText('×'))
        expect(onCancelReply).toHaveBeenCalled()
    })

    it('@mention: автокомплит и выбор участника', () => {
        render(
            <MessageComposer
                conversationId="c1"
                scope={{ kind: 'project', scopeId: 'p1' }}
                members={members}
                resolveName={(id) => (id === 'u2' ? 'Пётр' : id)}
                onSend={vi.fn()}
            />,
        )
        fireEvent.change(screen.getByPlaceholderText(/Сообщение/), {
            target: { value: '@П' },
        })
        expect(screen.getByText(/@Пётр/)).toBeInTheDocument()
        fireEvent.click(screen.getByText(/@Пётр/))
        expect(screen.getByPlaceholderText(/Сообщение/)).toHaveValue('@Пётр ')
    })

    it('onTyping при вводе текста', () => {
        const onTyping = vi.fn()
        render(
            <MessageComposer
                conversationId="c1"
                scope={{ kind: 'project', scopeId: 'p1' }}
                members={members}
                onTyping={onTyping}
                onSend={vi.fn()}
            />,
        )
        fireEvent.change(screen.getByPlaceholderText(/Сообщение/), { target: { value: 'x' } })
        expect(onTyping).toHaveBeenCalled()
    })
})
