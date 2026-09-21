import ApiService from './ApiService'
import {
    DEFAULT_PUBLIC_CONFIG,
    type PublicConfig,
    type PublicConfigFeatures,
} from '@/@types/publicConfig'

/**
 * Публичный конфиг развёртывания (без JWT). Контракт §5.3:
 *   GET /api/public-config → { deploymentMode, needsBootstrap, features, appName }
 */
export async function apiGetPublicConfig() {
    return ApiService.fetchDataWithAxios<PublicConfig>({
        url: '/public-config',
        method: 'get',
    })
}

/** Нормализуем сырой ответ к валидному PublicConfig (fail-soft к дефолтам SaaS). */
function normalizePublicConfig(raw: Partial<PublicConfig> | null | undefined): PublicConfig {
    if (!raw || typeof raw !== 'object') return DEFAULT_PUBLIC_CONFIG
    const deploymentMode =
        raw.deploymentMode === 'box' ? 'box' : 'saas'
    const features: Partial<PublicConfigFeatures> = raw.features ?? {}
    return {
        deploymentMode,
        needsBootstrap: Boolean(raw.needsBootstrap),
        features: {
            // Отсутствие поля трактуем консервативно как «включено» (SaaS-режим),
            // чтобы старый бэкенд без этого поля не спрятал разделы.
            billing: features.billing !== false,
            // box single-tenant: multiOrg включён ТОЛЬКО при явном true — иначе
            // (поле отсутствует/мусор) считаем single-org (box-инвариант W4).
            multiOrg: features.multiOrg === true,
        },
        appName:
            typeof raw.appName === 'string' && raw.appName.trim()
                ? raw.appName
                : DEFAULT_PUBLIC_CONFIG.appName,
    }
}

/**
 * Устойчиво загружает public-config. Любая ошибка/404/мусор → дефолты SaaS
 * (обратная совместимость: текущий SaaS-host, где эндпоинта ещё нет, работает
 * как раньше — `deploymentMode:'saas', needsBootstrap:false, все фичи on`).
 */
export async function loadPublicConfig(): Promise<PublicConfig> {
    try {
        const raw = await apiGetPublicConfig()
        return normalizePublicConfig(raw)
    } catch {
        return DEFAULT_PUBLIC_CONFIG
    }
}
