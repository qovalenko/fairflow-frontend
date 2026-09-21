import { create } from 'zustand'
import {
    DEFAULT_PUBLIC_CONFIG,
    type PublicConfig,
} from '@/@types/publicConfig'

/**
 * Стор публичного конфига развёртывания (box vs saas), контракт §5.3.
 * Наполняется один раз на старте приложения (PublicConfigGate) через
 * `loadPublicConfig()`. До загрузки — безопасные дефолты SaaS (обратная
 * совместимость: host без коробочного бэка ведёт себя как раньше).
 *
 * Экспонируем как zustand-стор, чтобы гейтинг можно было читать и в React
 * (`usePublicConfig`), и синхронно вне рендера (`getPublicConfig()` — для
 * фильтрации маршрутов в routes.config).
 */
type PublicConfigState = {
    config: PublicConfig
    /** true после первого ответа (успех или fail-soft к дефолтам). */
    loaded: boolean
    setConfig: (config: PublicConfig) => void
}

export const usePublicConfigStore = create<PublicConfigState>((set) => ({
    config: DEFAULT_PUBLIC_CONFIG,
    loaded: false,
    setConfig: (config) => set({ config, loaded: true }),
}))

/** Синхронный доступ к текущему конфигу вне React (routes-фильтр и т.п.). */
export const getPublicConfig = (): PublicConfig =>
    usePublicConfigStore.getState().config
