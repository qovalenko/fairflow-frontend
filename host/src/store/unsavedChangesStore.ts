import { create } from 'zustand';

type UnsavedChangesState = {
  scopes: Set<string>;
  markDirty: (scope: string) => void;
  clearDirty: (scope: string) => void;
  isDirty: () => boolean;
};

export const useUnsavedChangesStore = create<UnsavedChangesState>((set, get) => ({
  scopes: new Set<string>(),
  markDirty: (scope) =>
    set((state) => {
      const next = new Set(state.scopes);
      next.add(scope);
      return { scopes: next };
    }),
  clearDirty: (scope) =>
    set((state) => {
      if (!state.scopes.has(scope)) return state;
      const next = new Set(state.scopes);
      next.delete(scope);
      return { scopes: next };
    }),
  isDirty: () => get().scopes.size > 0,
}));
