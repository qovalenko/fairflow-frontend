/**
 * ESM re-export of React's with-selector shim.
 * zustand/traditional (used by @xyflow/react) pulls CJS use-sync-external-store,
 * which Vite inlines with a second React copy — breaks Module Federation singletons.
 * This file keeps all hooks on the federated `react` import.
 */
import {
  useDebugValue,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'

const objectIs = Object.is

export function useSyncExternalStoreWithSelector<T, S>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot: undefined | null | (() => T),
  selector: (snapshot: T) => S,
  isEqual?: (a: S, b: S) => boolean,
): S {
  const instRef = useRef<{ hasValue: boolean; value: S | null } | null>(null)
  if (instRef.current === null) {
    instRef.current = { hasValue: false, value: null }
  }
  const inst = instRef.current!

  const [getSelectedSnapshot, getSelectedServerSnapshot] = useMemo(() => {
    let hasMemo = false
    let memoizedSnapshot: T
    let memoizedSelection: S

    const memoizedSelector = (nextSnapshot: T): S => {
      if (!hasMemo) {
        hasMemo = true
        memoizedSnapshot = nextSnapshot
        const nextSelection = selector(nextSnapshot)
        if (isEqual !== undefined && inst.hasValue) {
          const currentSelection = inst.value as S
          if (isEqual(currentSelection, nextSelection)) {
            return (memoizedSelection = currentSelection)
          }
        }
        return (memoizedSelection = nextSelection)
      }

      const currentSelection = memoizedSelection
      if (objectIs(memoizedSnapshot, nextSnapshot)) {
        return currentSelection
      }

      const nextSelection = selector(nextSnapshot)
      if (isEqual !== undefined && isEqual(currentSelection, nextSelection)) {
        memoizedSnapshot = nextSnapshot
        return currentSelection
      }

      memoizedSnapshot = nextSnapshot
      return (memoizedSelection = nextSelection)
    }

    const maybeGetServerSnapshot =
      getServerSnapshot === undefined ? null : getServerSnapshot

    return [
      () => memoizedSelector(getSnapshot()),
      maybeGetServerSnapshot === null
        ? undefined
        : () => memoizedSelector(maybeGetServerSnapshot()),
    ] as const
  }, [getSnapshot, getServerSnapshot, selector, isEqual])

  const value = useSyncExternalStore(
    subscribe,
    getSelectedSnapshot,
    getSelectedServerSnapshot,
  )

  useEffect(() => {
    inst.hasValue = true
    inst.value = value
  }, [value, inst])

  useDebugValue(value)
  return value
}

export default { useSyncExternalStoreWithSelector }
