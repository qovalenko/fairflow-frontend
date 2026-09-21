import { usePublicConfigStore } from '@/store/publicConfigStore'
import type { PublicConfig } from '@/@types/publicConfig'

/**
 * Доступ к публичному конфигу развёртывания (box vs saas) + фиче-флагам.
 * Значение до загрузки — безопасные дефолты SaaS (см. publicConfigStore).
 */
export default function usePublicConfig(): PublicConfig & { loaded: boolean } {
    const config = usePublicConfigStore((s) => s.config)
    const loaded = usePublicConfigStore((s) => s.loaded)
    return { ...config, loaded }
}
