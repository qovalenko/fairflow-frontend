/**
 * Публичный конфиг развёртывания (box vs saas), отдаётся gateway ДО логина.
 * Контракт: documents/box/03-ARCHITECTURE.md §5.3 (`GET /api/public-config`).
 *
 * Эндпоинт публичный (без JWT). По нему фронт до логина понимает: коробка это
 * или SaaS, нужен ли bootstrap первого админа, и какие фичи включены (billing /
 * multiOrg) — чтобы загейтить UI.
 */
export type DeploymentMode = 'box' | 'saas'

export type PublicConfigFeatures = {
    /** SaaS — true; box — false (биллинг выпилен). */
    billing: boolean
    /** SaaS — true; box — false (single-tenant, вторую орг не создать). */
    multiOrg: boolean
}

export type PublicConfig = {
    deploymentMode: DeploymentMode
    /** box && пользователей ещё нет → нужен экран create-first-admin `/bootstrap`. */
    needsBootstrap: boolean
    features: PublicConfigFeatures
    appName: string
}

/**
 * box single-tenant дефолты: если `GET /api/public-config` не существует / упал /
 * вернул мусор — считаем box (одна Система, invite-only). `multiOrg:false` —
 * box-инвариант (DEORG-W4/CONFIG-15): ранний bootstrap НЕ должен показать выбор
 * организации даже до ответа gateway. Совместимость с SaaS больше не нужна (box).
 */
export const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
    deploymentMode: 'saas',
    needsBootstrap: false,
    features: { billing: true, multiOrg: false },
    appName: 'Fairflow',
}
