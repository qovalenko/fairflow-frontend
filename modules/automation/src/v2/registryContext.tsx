import { createContext, useContext } from 'react'
import type { NodeRegistry } from './types'
import { FALLBACK_REGISTRY } from './registry'

/**
 * Контекст реестра нод — кастомные ноды читают метки/externalEffect без
 * проп-дрилла. Дефолт — fallback-реестр (канва работает даже без backend-ручки).
 */
const RegistryContext = createContext<NodeRegistry>(FALLBACK_REGISTRY)

export const RegistryProvider = RegistryContext.Provider

export function useRegistry(): NodeRegistry {
    return useContext(RegistryContext)
}
