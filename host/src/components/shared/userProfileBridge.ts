/**
 * Cross-MF bridge for opening a colleague mini-profile drawer (FR-PROFILE-320).
 * Host registers the opener at bootstrap; remotes call `openUserProfile` without
 * importing host components (same pattern as hostSlotBridge).
 */
export type OpenUserProfileFn = (userId: string) => void;
export type OpenEntityDrawerFn = (entityType: string, entityId: string) => void;

interface UserProfileBridgeGlobal {
  __FF_OPEN_USER_PROFILE__?: OpenUserProfileFn;
  __FF_OPEN_ENTITY_DRAWER__?: OpenEntityDrawerFn;
}

const registry = globalThis as UserProfileBridgeGlobal;

export function registerUserProfileOpener(fn: OpenUserProfileFn): void {
  registry.__FF_OPEN_USER_PROFILE__ = fn;
}

export function registerEntityDrawerOpener(fn: OpenEntityDrawerFn): void {
  registry.__FF_OPEN_ENTITY_DRAWER__ = fn;
}

export function openUserProfile(userId: string): void {
  const id = userId?.trim();
  if (!id) return;
  registry.__FF_OPEN_USER_PROFILE__?.(id);
}

/** global.drawer.entity slot — entityType=user opens the colleague profile drawer. */
export function openEntityDrawer(entityType: string, entityId: string): void {
  const type = entityType?.trim();
  const id = entityId?.trim();
  if (!type || !id) return;
  if (type === 'user') {
    openUserProfile(id);
    return;
  }
  registry.__FF_OPEN_ENTITY_DRAWER__?.(type, id);
}

export function resetUserProfileBridge(): void {
  delete registry.__FF_OPEN_USER_PROFILE__;
  delete registry.__FF_OPEN_ENTITY_DRAWER__;
}
