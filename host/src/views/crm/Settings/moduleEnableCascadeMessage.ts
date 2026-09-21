export type EnableCascadeModule = { id: string; name: string }

export function moduleEnableCascadeMessage(
  moduleName: string,
  cascadeModules: EnableCascadeModule[],
): string {
  if (cascadeModules.length === 0) {
    return `Модуль «${moduleName}» будет включён.`
  }
  const names = cascadeModules.map((m) => `«${m.name}»`).join(', ')
  return `Включение модуля «${moduleName}» также включит: ${names}.`
}
