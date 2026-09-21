import { describe, it, expect, vi } from 'vitest'
import { chatErrorMessage, extractChatError, notifySuccess, notifyError, notifyChatError } from './chatUi'
import { CHAT_ERROR_CODES } from './chatTypes'

const toastPush = vi.fn()
vi.mock('@/components/ui/toast', () => ({
    default: { push: (...a: unknown[]) => toastPush(...a) },
}))

describe('chatUi — маппинг ошибок', () => {
    it('extractChatError: конверт error.message', () => {
        expect(
            extractChatError({
                response: { status: 403, data: { error: { code: 'X', message: 'запрещено' } } },
            }),
        ).toEqual({ message: 'запрещено', code: 'X', status: 403 })
    })

    it('chatErrorMessage: известные коды → user-facing текст', () => {
        expect(
            chatErrorMessage({
                response: { data: { error: { code: CHAT_ERROR_CODES.NOT_A_MEMBER } } },
            }),
        ).toBe('Вы не участник беседы')
        expect(
            chatErrorMessage({
                response: { data: { error: { code: CHAT_ERROR_CODES.RATE_LIMITED } } },
            }),
        ).toBe('Слишком часто, повторите позже')
    })

    it('chatErrorMessage: неизвестный код → message с сервера', () => {
        expect(
            chatErrorMessage({
                response: { data: { error: { code: 'OTHER', message: 'что-то пошло не так' } } },
            }),
        ).toBe('что-то пошло не так')
    })

    it('chatErrorMessage: EDIT_WINDOW_EXPIRED и FORBIDDEN_NOT_AUTHOR', () => {
        expect(
            chatErrorMessage({
                response: { data: { error: { code: CHAT_ERROR_CODES.EDIT_WINDOW_EXPIRED } } },
            }),
        ).toBe('Время редактирования истекло')
        expect(
            chatErrorMessage({
                response: { data: { error: { code: CHAT_ERROR_CODES.FORBIDDEN_NOT_AUTHOR } } },
            }),
        ).toBe('Нельзя редактировать чужое сообщение')
    })
})

describe('chatUi — toast уведомления', () => {
    it('notifySuccess и notifyError пушат Notification', () => {
        notifySuccess('Сохранено')
        notifyError('Ошибка')
        expect(toastPush).toHaveBeenCalledTimes(2)
    })

    it('notifyChatError мапит ошибку в danger toast', () => {
        toastPush.mockClear()
        notifyChatError({
            response: { data: { error: { code: CHAT_ERROR_CODES.NOT_A_MEMBER } } },
        })
        expect(toastPush).toHaveBeenCalledTimes(1)
    })
})
