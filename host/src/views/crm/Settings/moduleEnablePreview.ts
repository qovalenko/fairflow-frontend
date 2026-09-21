type ModuleRef = { id: string; name: string; dependencies: string[] };

/**
 * FR-PROJ-300: modules that control will auto-enable via resolveDependencies
 * when `moduleId` is turned on (transitive deps not yet enabled).
 */
export function computeAutoEnabledModules(
  moduleId: string,
  currentlyEnabled: ReadonlySet<string>,
  registry: ModuleRef[],
): ModuleRef[] {
  const depsById = new Map(registry.map((m) => [m.id, m.dependencies]));
  const pending = new Set<string>();

  const visit = (id: string) => {
    for (const dep of depsById.get(id) ?? []) {
      if (currentlyEnabled.has(dep) || pending.has(dep)) continue;
      pending.add(dep);
      visit(dep);
    }
  };

  visit(moduleId);
  return registry.filter((m) => pending.has(m.id));
}

export function moduleEnablePreviewMessage(
  moduleName: string,
  autoEnabled: ModuleRef[],
): string {
  if (autoEnabled.length === 0) {
    return `Будет включён модуль «${moduleName}».`;
  }
  const names = autoEnabled.map((m) => `«${m.name}»`).join(', ');
  return `При включении «${moduleName}» автоматически будут включены зависимости: ${names}.`;
}
