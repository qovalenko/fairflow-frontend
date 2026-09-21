import appConfig from '@/configs/app.config'
import {
    TOKEN_TYPE,
    REQUEST_HEADER_AUTH_KEY,
    TOKEN_NAME_IN_STORAGE,
} from '@/constants/api.constant'
import { useProjectStore } from '@/store/projectStore'
import type { InternalAxiosRequestConfig } from 'axios'

const PROJECT_ID_HEADER = 'X-Project-Id'

/**
 * Корни, которые НЕ scoped на проект (аккаунт/юзер-скоуп). Точное совпадение
 * пути (без `/:id/...`), поэтому под-роуты вроде `/v1/projects/:id/...`, которым
 * контекст проекта НУЖЕН, не затрагиваются.
 *  - `/v1/projects`      — список «мои проекты» (GET `?userId=`) и создание
 *    проекта (POST). У нового/сменившегося юзера нет membership в stale/чужом
 *    проекте → gateway 403 на юзер-скоуп bootstrap и на POST create (T-001-FE).
 *  - `/v1/system` — единственная Система сессии (GET, box single-tenant), тоже
 *    аккаунт-скоуп; чужой X-Project-Id даёт 403 на bootstrap после смены юзера.
 */
const ACCOUNT_SCOPED_ROOTS = new Set([
    '/v1/projects',
    '/api/v1/projects',
    '/v1/system',
    '/api/v1/system',
])

/**
 * Запросы, для которых контекст проекта не нужен и НЕ должен подставляться:
 *  - auth-роуты (`/v1/auth/...`): вход/регистрация/профиль — контекст проекта
 *    отсутствует, а чужой X-Project-Id ломает смену сессии.
 *  - аккаунт-скоуп корни (ACCOUNT_SCOPED_ROOTS, точный путь): загрузка проектов/
 *    организаций текущего юзера и создание проекта — контекст проекта тут либо
 *    отсутствует, либо ещё не сверён с membership; чужой заголовок → 403.
 */
function shouldOmitProjectHeader(config: InternalAxiosRequestConfig): boolean {
    const rawUrl = config.url ?? ''
    const path = rawUrl.split('?')[0].split('#')[0]

    // Auth-роуты (baseURL `/api` → config.url `/v1/auth/...`).
    if (path.includes('/auth/')) return true

    // Аккаунт/юзер-скоуп корни — только точный путь (без `/:id/...`).
    const normalized = path.replace(/\/+$/, '')
    if (ACCOUNT_SCOPED_ROOTS.has(normalized)) return true

    return false
}

const AxiosRequestIntrceptorConfigCallback = (
    config: InternalAxiosRequestConfig,
) => {
    // Централизованно проставляем X-Project-Id для всех /api-запросов из
    // текущего проекта (projectStore). Если вызов уже задал заголовок явно —
    // не перетираем; на TO-BE gateway читает его как контекст проекта.
    // Исключения (shouldOmitProjectHeader): auth-роуты и аккаунт-скоуп корни
    // (мои проекты/организации, создание проекта) — там контекст проекта не
    // нужен/не сверён, а чужой заголовок даёт 403 после смены юзера (T-001-FE).
    if (!config.headers[PROJECT_ID_HEADER] && !shouldOmitProjectHeader(config)) {
        const projectId = useProjectStore.getState().currentProjectId
        if (projectId) {
            config.headers[PROJECT_ID_HEADER] = projectId
        }
    }

    const strategy = appConfig.accessTokenPersistStrategy

    // При стратегии 'cookies' токен в HTTP-only cookie — не добавляем Authorization (кука уходит с withCredentials)
    if (strategy === 'cookies') {
        return config
    }

    if (strategy === 'localStorage' || strategy === 'sessionStorage') {
        let accessToken = ''
        if (strategy === 'localStorage') {
            accessToken = localStorage.getItem(TOKEN_NAME_IN_STORAGE) || ''
        }
        if (strategy === 'sessionStorage') {
            accessToken = sessionStorage.getItem(TOKEN_NAME_IN_STORAGE) || ''
        }
        if (accessToken) {
            config.headers[REQUEST_HEADER_AUTH_KEY] =
                `${TOKEN_TYPE}${accessToken}`
        }
    }

    return config
}

export default AxiosRequestIntrceptorConfigCallback
