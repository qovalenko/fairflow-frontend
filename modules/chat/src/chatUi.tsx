import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import type { AxiosError } from 'axios'
import { CHAT_ERROR_CODES } from './chatTypes'

type ApiErrorEnvelope = {
    error?: { code?: string; message?: string; httpStatus?: number }
    code?: string
    message?: string
}

/** Извлекает message+code из rejected API-вызова (конверт ошибки контракта §6). */
export function extractChatError(err: unknown): {
    message: string
    code?: string
    status?: number
} {
    const ax = err as AxiosError<ApiErrorEnvelope>
    const data = ax?.response?.data
    const status = ax?.response?.status
    if (data?.error) {
        return { message: data.error.message || 'Произошла ошибка', code: data.error.code, status }
    }
    if (typeof data?.code === 'string') {
        return { message: data.message || 'Произошла ошибка', code: data.code, status }
    }
    if (data?.message) return { message: data.message, status }
    if (ax?.message) return { message: ax.message, status }
    return { message: 'Произошла ошибка', status }
}

/** Маппинг кода ошибки → user-facing toast-сообщение (§3.5). */
export function chatErrorMessage(err: unknown): string {
    const { code, message } = extractChatError(err)
    switch (code) {
        case CHAT_ERROR_CODES.EDIT_WINDOW_EXPIRED:
            return 'Время редактирования истекло'
        case CHAT_ERROR_CODES.RATE_LIMITED:
            return 'Слишком часто, повторите позже'
        case CHAT_ERROR_CODES.FORBIDDEN_CROSS_ORG:
            return 'Нельзя начать беседу с пользователем вне вашей организации'
        case CHAT_ERROR_CODES.NOT_A_MEMBER:
            return 'Вы не участник беседы'
        case CHAT_ERROR_CODES.FORBIDDEN_NOT_AUTHOR:
            return 'Нельзя редактировать чужое сообщение'
        case CHAT_ERROR_CODES.MODULE_DISABLED:
        case 'MODULE_DISABLED':
            return 'Модуль «Чат» выключен в проекте'
        default:
            return message
    }
}

export function notifySuccess(message: string) {
    toast.push(
        <Notification type="success" duration={2500}>
            {message}
        </Notification>,
        { placement: 'top-center' },
    )
}

export function notifyError(message: string) {
    toast.push(
        <Notification type="danger" duration={3500}>
            {message}
        </Notification>,
        { placement: 'top-center' },
    )
}

export function notifyChatError(err: unknown) {
    notifyError(chatErrorMessage(err))
}
