import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import MessageItem from './MessageItem'
import { serializeEntityRef } from './chatEntityRefs'
import type { MessageVM } from './chatTypes'

const msg = (over: Partial<MessageVM> = {}): MessageVM => ({
    id: 'm1',
    seq: 1,
    conversationId: 'c1',
    senderId: 'u1',
    senderType: 'user',
    kind: 'text',
    text: 'Привет',
    attachments: [],
    mentionIds: [],
    sentAt: Date.now(),
    ...over,
})

describe('MessageItem', () => {
    it('чужое сообщение: имя отправителя и действие «ответить»', () => {
        const onReply = vi.fn()
        render(
            <MessageItem
                message={msg({ senderId: 'u2', text: 'Как дела?' })}
                isOwn={false}
                senderName="Пётр"
                onReply={onReply}
            />,
        )
        expect(screen.getByText('Пётр')).toBeInTheDocument()
        expect(screen.getByText('Как дела?')).toBeInTheDocument()
        fireEvent.click(screen.getByText('ответить'))
        expect(onReply).toHaveBeenCalled()
    })

    it('своё сообщение: редактирование и удаление', () => {
        const onEdit = vi.fn()
        const onDelete = vi.fn()
        render(
            <MessageItem
                message={msg()}
                isOwn
                canEdit
                onEdit={onEdit}
                onDelete={onDelete}
            />,
        )
        fireEvent.click(screen.getByText('изменить'))
        const area = screen.getByRole('textbox')
        fireEvent.change(area, { target: { value: 'Привет!' } })
        fireEvent.click(screen.getByText('Сохранить'))
        expect(onEdit).toHaveBeenCalledWith('m1', 'Привет!')

        fireEvent.click(screen.getByText('удалить'))
        expect(onDelete).toHaveBeenCalledWith('m1')
    })

    it('tombstone: удалённое сообщение', () => {
        render(<MessageItem message={msg({ deletedAt: Date.now() })} isOwn />)
        expect(screen.getByText('сообщение удалено')).toBeInTheDocument()
        expect(screen.queryByText('изменить')).not.toBeInTheDocument()
    })

    it('failed: кнопка «повторить»', () => {
        const onRetry = vi.fn()
        render(
            <MessageItem message={msg({ failed: true, clientMessageId: 'c1' })} isOwn onRetry={onRetry} />,
        )
        fireEvent.click(screen.getByText('повторить'))
        expect(onRetry).toHaveBeenCalled()
    })

    it('entity-токен в тексте → чип с label', () => {
        const token = serializeEntityRef({ type: 'deal', id: 'd1', label: 'Сделка №1' })
        render(
            <MemoryRouter>
                <MessageItem message={msg({ text: `Смотри ${token}` })} isOwn />
            </MemoryRouter>,
        )
        expect(screen.getByText('Сделка №1')).toBeInTheDocument()
    })

    it('replyPreview отображает цитату', () => {
        render(
            <MessageItem
                message={msg({ text: 'ответ' })}
                isOwn
                replyPreview={{ text: 'было', senderName: 'Анна' }}
            />,
        )
        expect(screen.getByText(/Анна:/)).toBeInTheDocument()
        expect(screen.getByText(/было/)).toBeInTheDocument()
    })

    it('canModerate: удаление чужого', () => {
        const onDelete = vi.fn()
        render(
            <MessageItem
                message={msg({ senderId: 'u2' })}
                isOwn={false}
                canModerate
                onDelete={onDelete}
            />,
        )
        fireEvent.click(screen.getByText('удалить'))
        expect(onDelete).toHaveBeenCalledWith('m1')
    })
})
