import { describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSyncExternalStoreWithSelector } from './useSyncExternalStoreWithSelector'

type Store = { count: number; label: string }

function createStore(initial: Store) {
    let snapshot = initial
    const listeners = new Set<() => void>()
    return {
        getSnapshot: () => snapshot,
        setSnapshot: (next: Store) => {
            snapshot = next
            listeners.forEach((l) => l())
        },
        subscribe: (onChange: () => void) => {
            listeners.add(onChange)
            return () => listeners.delete(onChange)
        },
    }
}

describe('useSyncExternalStoreWithSelector — federated zustand shim', () => {
    it('возвращает выбранное поле из snapshot', () => {
        const store = createStore({ count: 3, label: 'a' })
        const { result } = renderHook(() =>
            useSyncExternalStoreWithSelector(
                store.subscribe,
                store.getSnapshot,
                undefined,
                (s) => s.count,
            ),
        )
        expect(result.current).toBe(3)
    })

    it('обновляет selection при изменении store', () => {
        const store = createStore({ count: 1, label: 'a' })
        const { result } = renderHook(() =>
            useSyncExternalStoreWithSelector(
                store.subscribe,
                store.getSnapshot,
                undefined,
                (s) => s.count,
            ),
        )
        act(() => store.setSnapshot({ count: 5, label: 'a' }))
        expect(result.current).toBe(5)
    })

    it('isEqual стабилизирует selection при семантически равном значении', () => {
        const store = createStore({ count: 1, label: 'x' })
        const isEqual = (a: number, b: number) => a === b
        const { result } = renderHook(() =>
            useSyncExternalStoreWithSelector(
                store.subscribe,
                store.getSnapshot,
                undefined,
                (s) => s.count,
                isEqual,
            ),
        )
        const first = result.current
        act(() => store.setSnapshot({ count: 1, label: 'y' }))
        expect(result.current).toBe(first)
    })

    it('default export содержит named hook для CJS interop', async () => {
        const mod = await import('./useSyncExternalStoreWithSelector')
        expect(mod.default.useSyncExternalStoreWithSelector).toBe(
            useSyncExternalStoreWithSelector,
        )
    })
})
