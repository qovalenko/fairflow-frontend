import { useEffect } from 'react';
import { useUnsavedChangesStore } from '@/store/unsavedChangesStore';

/** ST-30 / FR-PROJ-380 — register a scoped dirty flag for project-switch guard. */
export function useUnsavedChangesGuard(dirty: boolean, scope = 'default') {
  const markDirty = useUnsavedChangesStore((s) => s.markDirty);
  const clearDirty = useUnsavedChangesStore((s) => s.clearDirty);

  useEffect(() => {
    if (dirty) markDirty(scope);
    else clearDirty(scope);
    return () => clearDirty(scope);
  }, [dirty, scope, markDirty, clearDirty]);
}

export function hasUnsavedChanges(): boolean {
  return useUnsavedChangesStore.getState().isDirty();
}
