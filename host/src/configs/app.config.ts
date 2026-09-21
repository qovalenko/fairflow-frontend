export type AppConfig = {
    apiPrefix: string
    authenticatedEntryPath: string
    unAuthenticatedEntryPath: string
    locale: string
    /** cookies = токен в HTTP-only cookie (бэкенд Set-Cookie), без хранения в JS */
    accessTokenPersistStrategy: 'localStorage' | 'sessionStorage' | 'cookies'
    activeNavTranslation: boolean
    /**
     * Режим «подготовка к продакшн-запуску» (app.example.com). Включается флагом
     * окружения `VITE_PRODUCTION_LAUNCH=true`. Когда включён:
     *  - показывается глобальный баннер «идёт подготовка к запуску» (kernel-UI);
     *  - скрываются неготовые к проду разделы (биллинг/тарифы и пр.).
     * По умолчанию выключен — поведение стендов не меняется.
     */
    productionLaunch: boolean
    /** Необязательный override текста баннера (VITE_PRODUCTION_LAUNCH_MESSAGE). */
    productionLaunchMessage: string
}

const resolveTokenPersistStrategy = (): AppConfig['accessTokenPersistStrategy'] => {
    const raw = import.meta.env.VITE_AUTH_PERSIST_STRATEGY
    if (
        raw === 'localStorage' ||
        raw === 'sessionStorage' ||
        raw === 'cookies'
    ) {
        return raw
    }
    return 'cookies'
}

const appConfig: AppConfig = {
    apiPrefix: import.meta.env.VITE_API_PREFIX?.trim() || '/api',
    authenticatedEntryPath: '/',
    unAuthenticatedEntryPath: '/auth/signin',
    locale: 'en',
    accessTokenPersistStrategy: resolveTokenPersistStrategy(),
    activeNavTranslation: false,
    productionLaunch: import.meta.env.VITE_PRODUCTION_LAUNCH === 'true',
    productionLaunchMessage:
        import.meta.env.VITE_PRODUCTION_LAUNCH_MESSAGE?.trim() || '',
}

export default appConfig
