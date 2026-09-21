import { create } from 'zustand'

export type GlobalEntityDrawerState = {
    entityType: string | null
    entityId: string | null
    open: (entityType: string, entityId: string) => void
    close: () => void
}

export const useGlobalEntityDrawer = create<GlobalEntityDrawerState>((set) => ({
    entityType: null,
    entityId: null,
    open: (entityType, entityId) => set({ entityType, entityId }),
    close: () => set({ entityType: null, entityId: null }),
}))
