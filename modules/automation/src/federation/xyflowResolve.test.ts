import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { xyflowFederationResolve } from './xyflowResolve'

const federationDir = path.dirname(fileURLToPath(import.meta.url))

describe('xyflowFederationResolve — alias для Module Federation', () => {
    it('перенаправляет with-selector shim на локальный ESM-файл', () => {
        const expected = path.join(federationDir, 'useSyncExternalStoreWithSelector.ts')
        expect(xyflowFederationResolve.alias['use-sync-external-store/shim/with-selector.js']).toBe(
            expected,
        )
        expect(xyflowFederationResolve.alias['use-sync-external-store/shim/with-selector']).toBe(
            expected,
        )
    })

    it('заменяет базовый shim на react и дедуплицирует singleton-зависимости', () => {
        expect(xyflowFederationResolve.alias['use-sync-external-store/shim']).toBe('react')
        expect(xyflowFederationResolve.dedupe).toEqual(
            expect.arrayContaining(['react', 'react-dom', 'zustand', 'use-sync-external-store']),
        )
    })
})
