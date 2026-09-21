/** FR-AUTOM-120: badge label for automation-created activities. */
export function automationRuleBadge(
  createdByRule?: { ruleId: string; name: string },
): string | null {
  if (!createdByRule?.ruleId) return null
  const name = String(createdByRule.name ?? '').trim()
  return name ? `Авто: ${name}` : `Авто: ${createdByRule.ruleId}`
}
