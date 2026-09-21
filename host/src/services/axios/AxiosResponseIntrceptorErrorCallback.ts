import axios from 'axios'
import { useSessionUser, useToken } from '@/store/authStore'
import appConfig from '@/configs/app.config'
import {
    TOKEN_TYPE,
    REQUEST_HEADER_AUTH_KEY,
    TOKEN_NAME_IN_STORAGE,
} from '@/constants/api.constant'
import type { AxiosError } from 'axios'

const unauthorizedCode = [401, 419, 440]
const useCookies = appConfig.accessTokenPersistStrategy === 'cookies'

/**
 * Отдельный axios-клиент БЕЗ signout-интерсептора — только для проверки сессии.
 * Его 401 не должен повторно входить в этот колбэк (иначе рекурсия).
 */
const probeClient = axios.create({
    baseURL: appConfig.apiPrefix,
    withCredentials: useCookies,
    timeout: 10000,
})

let verifyInFlight: Promise<boolean> | null = null

/**
 * Жив ли ещё вход. true — сессия валидна (или временная инфра-ошибка), false —
 * только если /me вернул реальный auth-отказ (401/419/440).
 */
async function sessionStillValid(): Promise<boolean> {
    try {
        const headers: Record<string, string> = {}
        if (!useCookies) {
            const storage =
                appConfig.accessTokenPersistStrategy === 'sessionStorage'
                    ? sessionStorage
                    : localStorage
            const token = storage.getItem(TOKEN_NAME_IN_STORAGE)
            if (token) {
                headers[REQUEST_HEADER_AUTH_KEY] = `${TOKEN_TYPE}${token}`
            }
        }
        await probeClient.get('/v1/auth/me', { headers })
        return true
    } catch (e) {
        const status = (e as AxiosError)?.response?.status
        // Реальный auth-отказ → сессия мертва. Сеть/5xx → не разлогиниваем.
        return !(status && unauthorizedCode.includes(status))
    }
}

function extractAuthReason(error: AxiosError): string {
    const data = error.response?.data
    if (
        data &&
        typeof data === 'object' &&
        'reason' in data &&
        typeof (data as { reason?: unknown }).reason === 'string'
    ) {
        return (data as { reason: string }).reason
    }
    return 'session_revoked'
}

function forceSignOut(reason = 'session_revoked') {
    // 401 на страницах входа (неверный пароль / неверный TOTP) тоже попадает
    // сюда: сессии не было — редирект на logout-forced только для реально
    // разлогиненного пользователя, иначе формы логина теряют inline-ошибку.
    const wasSignedIn = useSessionUser.getState().session.signedIn
    if (!useCookies) {
        useToken().setToken('')
    }
    useSessionUser.getState().setUser({})
    useSessionUser.getState().setSessionSignedIn(false)
    if (
        wasSignedIn &&
        typeof window !== 'undefined' &&
        !window.location.pathname.includes('/account/logout-forced')
    ) {
        window.location.assign(
            `/account/logout-forced?reason=${encodeURIComponent(reason)}`,
        )
    }
}

/**
 * Одиночный 401/419/440 от ЛЮБОГО (часто фонового) запроса больше НЕ рвёт
 * валидную сессию. Сначала одна дедуплицированная проверка сессии через /me —
 * разлогиниваемся только если она тоже отдаёт auth-отказ.
 */
const AxiosResponseIntrceptorErrorCallback = (error: AxiosError) => {
    const { response } = error
    if (!response || !unauthorizedCode.includes(response.status)) {
        return
    }
    if (!verifyInFlight) {
        verifyInFlight = sessionStillValid().finally(() => {
            verifyInFlight = null
        })
    }
    void verifyInFlight.then((ok) => {
        if (!ok) {
            forceSignOut(extractAuthReason(error))
        }
    })
}

export default AxiosResponseIntrceptorErrorCallback
