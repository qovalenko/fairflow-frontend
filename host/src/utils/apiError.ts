import type { AxiosError } from 'axios'

type ApiErrorBody = {
    code?: string
    message?: string
    error?: string
    retryAfter?: number
}

/**
 * Normalised view of a backend error for profile/auth screens.
 * Source of error codes: docs/tz/contracts/auth.md §6.1 + §11.
 */
export type NormalizedApiError = {
    status?: number
    /** Machine code (e.g. `EMAIL_TAKEN`, `INVALID_TOTP`) when surfaced by gateway. */
    code?: string
    /** Human-friendly RU message for inline / toast display. */
    message: string
    retryAfter?: number
}

const isAxiosLike = (e: unknown): e is AxiosError<ApiErrorBody> =>
    typeof e === 'object' && e !== null && 'isAxiosError' in e

/** Map of (status / code) → localized message (UX layer; truth is backend). */
const CODE_MESSAGES: Record<string, string> = {
    EMAIL_TAKEN: 'Этот email уже используется. Укажите другой адрес.',
    ALREADY_EXISTS: 'Этот email уже используется. Укажите другой адрес.',
    INVALID_CREDENTIALS: 'Неверный текущий пароль.',
    REAUTH_REQUIRED: 'Требуется повторная аутентификация.',
    PERMISSION_DENIED: 'Неверный текущий пароль.',
    INVALID_TOTP: 'Неверный код подтверждения.',
    INVALID_TOKEN: 'Ссылка недействительна.',
    TOKEN_EXPIRED: 'Ссылка устарела или уже использована.',
    WEAK_PASSWORD: 'Пароль слишком слабый. Минимум 8 символов и разные классы.',
    NO_PENDING_2FA: 'Сначала инициализируйте подключение 2FA.',
    TWO_FACTOR_REQUIRED_BY_POLICY:
        'Отключение запрещено политикой организации.',
    SYSTEM_ACCESS_DENIED:
        'Создание проектов доступно только владельцу или администратору системы.',
    FAILED_PRECONDITION: 'Отключение запрещено политикой организации.',
    TOO_MANY_ATTEMPTS: 'Слишком много попыток. Повторите позже.',
    SESSION_REVOKED: 'Сессия завершена. Войдите снова.',
    UNSUPPORTED_MEDIA_TYPE: 'Недопустимый формат файла.',
    PAYLOAD_TOO_LARGE: 'Файл слишком большой (макс. 5 МБ).',
    INVALID_TIMEZONE: 'Недопустимый часовой пояс.',
}

const STATUS_FALLBACK: Record<number, string> = {
    400: 'Некорректный запрос.',
    401: 'Сессия завершена. Войдите снова.',
    403: 'Недостаточно прав или неверные данные.',
    // 404 — эндпоинт ещё не доступен на gateway (например 2FA TO-BE):
    // даём понятное сообщение вместо сырого "Request failed with status code 404".
    404: 'Функция временно недоступна. Обратитесь к администратору.',
    409: 'Конфликт данных.',
    410: 'Ссылка устарела или уже использована.',
    413: 'Файл слишком большой (макс. 5 МБ).',
    415: 'Недопустимый формат файла.',
    422: 'Проверьте корректность введённых данных.',
    429: 'Слишком много попыток. Повторите позже.',
}

export function normalizeApiError(
    e: unknown,
    fallback = 'Что-то пошло не так. Повторите попытку.',
): NormalizedApiError {
    if (isAxiosLike(e)) {
        const status = e.response?.status
        const body = e.response?.data
        const code = body?.code || body?.error
        const message =
            (code && CODE_MESSAGES[code]) ||
            (status && STATUS_FALLBACK[status]) ||
            body?.message ||
            e.message ||
            fallback
        return { status, code, message, retryAfter: body?.retryAfter }
    }
    if (typeof e === 'string') return { message: e }
    return { message: fallback }
}

/** True when the error indicates the session is gone (ST-21). */
export const isSessionRevoked = (e: NormalizedApiError) =>
    e.status === 401 || e.code === 'SESSION_REVOKED'
