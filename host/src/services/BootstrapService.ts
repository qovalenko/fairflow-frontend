import ApiService from './ApiService'
import type { BackendAuthUser } from '@/@types/auth'

/**
 * Bootstrap первого администратора коробки. Контракт §5.4:
 *   POST /api/bootstrap { email, password, name, organizationName }
 *     → 201 { token, user, organization: { id, name } }   (авто-логин)
 *     → 409 { code: "ALREADY_INITIALIZED" }
 *     → 403 { code: "BOOTSTRAP_DISABLED" }
 *     → 400 валидация
 * Эндпоинт публичный, но single-shot (после успеха всегда 409).
 */
export type BootstrapPayload = {
    email: string
    password: string
    name: string
    organizationName: string
    inn?: string
}

export type BootstrapResponse = {
    token?: string
    user: Partial<BackendAuthUser> & {
        id?: string
        userId?: string
        email?: string
        name?: string
        login?: string
    }
    organization: { id: string; name: string }
}

export async function apiBootstrap(data: BootstrapPayload) {
    return ApiService.fetchDataWithAxios<BootstrapResponse>({
        url: '/bootstrap',
        method: 'post',
        data,
    })
}
