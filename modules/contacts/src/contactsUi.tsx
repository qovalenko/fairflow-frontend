import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import type { AxiosError } from 'axios'

type ApiErrorEnvelope = {
    error?: { code?: string; message?: string; httpStatus?: number }
    message?: string
}

/** Extract a user-facing message + code from a rejected API call (contract error envelope). */
export function extractApiError(err: unknown): { message: string; code?: string; status?: number } {
    const ax = err as AxiosError<ApiErrorEnvelope>
    const data = ax?.response?.data
    const status = ax?.response?.status
    if (data?.error) {
        return { message: data.error.message || 'Произошла ошибка', code: data.error.code, status }
    }
    if (data?.message) return { message: data.message, status }
    if (ax?.message) return { message: ax.message, status }
    return { message: 'Произошла ошибка', status }
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
