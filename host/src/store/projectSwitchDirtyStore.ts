import { create } from 'zustand'

type ProjectSwitchDirtyState = {
    dirtyKeys: Set<string>
    registerDirty: (key: string, dirty: boolean) => void
    hasDirty: () => boolean
    clearAll: () => void
}

export const useProjectSwitchDirtyStore = create<ProjectSwitchDirtyState>((set, get) => ({
    dirtyKeys: new Set(),
    registerDirty: (key, dirty) =>
        set((state) => {
            const next = new Set(state.dirtyKeys)
            if (dirty) next.add(key)
            else next.delete(key)
            return { dirtyKeys: next }
        }),
    hasDirty: () => get().dirtyKeys.size > 0,
    clearAll: () => set({ dirtyKeys: new Set() }),
}))

export function hasProjectSwitchDirtyState(): boolean {
    return useProjectSwitchDirtyStore.getState().hasDirty()
}
