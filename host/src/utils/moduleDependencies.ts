/**
 * Hard module dependencies aligned with backend MODULE_REGISTRY (wizard step 3).
 * Soft dependencies (e.g. orders → products) are intentionally excluded.
 */
export const WIZARD_MODULE_DEPENDENCIES: Record<string, readonly string[]> = {
  deals: [],
  contacts: [],
  companies: [],
  orders: ['deals'],
  products: [],
  activities: ['deals'],
  reports: [],
  settings: [],
  integrations: [],
  automation: ['deals', 'activities'],
  search: ['contacts', 'companies', 'deals'],
  chat: ['notifications'],
  notifications: [],
  statistics: [],
  documents: [],
  profile: [],
}

const LOCKED_MODULES = new Set(['deals', 'statistics', 'notifications', 'profile'])

export function resolveWizardModuleDependencies(
  enabledIds: Iterable<string>,
): string[] {
  const resolved = new Set<string>(LOCKED_MODULES)
  for (const id of enabledIds) {
    if (id in WIZARD_MODULE_DEPENDENCIES) resolved.add(id)
  }
  let changed = true
  while (changed) {
    changed = false
    for (const moduleId of Array.from(resolved)) {
      for (const dep of WIZARD_MODULE_DEPENDENCIES[moduleId] ?? []) {
        if (!resolved.has(dep)) {
          resolved.add(dep)
          changed = true
        }
      }
    }
  }
  return Array.from(resolved)
}

/** FR-PSET-050 / FR-PSET-420: modules auto-enabled when turning on `moduleId`. */
export function previewWizardEnableCascade(
  moduleId: string,
  currentlyEnabled: Iterable<string>,
): string[] {
  if (!(moduleId in WIZARD_MODULE_DEPENDENCIES)) return []
  const before = new Set(resolveWizardModuleDependencies(currentlyEnabled))
  const after = resolveWizardModuleDependencies([...currentlyEnabled, moduleId])
  return after.filter((id) => !before.has(id) && id !== moduleId).sort()
}
