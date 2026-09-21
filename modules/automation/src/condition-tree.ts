/**
 * v1 condition tree wire format (FR-AUTOM-090): flat leaves + one optional nested AND/OR group.
 */

export type ConditionLeaf = { field?: string; op?: string; value?: unknown }

export type ConditionOp = 'and' | 'or'

export type UiCondition = {
  id: string
  field: string
  operator: string
  value: string
}

export const conditionToWire = (c: Pick<UiCondition, 'field' | 'operator' | 'value'>): ConditionLeaf => {
  switch (c.operator) {
    case 'ne':
      return { field: c.field, op: 'neq', value: c.value }
    case 'is_empty':
      return { field: c.field, op: 'exists', value: false }
    case 'is_not_empty':
      return { field: c.field, op: 'exists', value: true }
    default:
      return { field: c.field, op: c.operator, value: c.value }
  }
}

export const conditionFromWire = (
  leaf: ConditionLeaf,
): Pick<UiCondition, 'field' | 'operator' | 'value'> => {
  const op = String(leaf.op ?? 'eq')
  if (op === 'neq') {
    return { field: leaf.field ?? '', operator: 'ne', value: leaf.value != null ? String(leaf.value) : '' }
  }
  if (op === 'exists') {
    return {
      field: leaf.field ?? '',
      operator: leaf.value === false ? 'is_empty' : 'is_not_empty',
      value: '',
    }
  }
  return { field: leaf.field ?? '', operator: op, value: leaf.value != null ? String(leaf.value) : '' }
}

export const parseConditionTree = (
  parsed: unknown,
): { rootOp: ConditionOp; conditions: UiCondition[]; nestedOp: ConditionOp | ''; nested: UiCondition[] } => {
  const empty = {
    rootOp: 'and' as const,
    conditions: [] as UiCondition[],
    nestedOp: '' as const,
    nested: [] as UiCondition[],
  }
  if (!parsed || typeof parsed !== 'object') return empty
  const rootKey = 'and' in (parsed as object) ? 'and' : 'or' in (parsed as object) ? 'or' : null
  if (!rootKey) return empty
  const items = (parsed as Record<string, unknown>)[rootKey]
  if (!Array.isArray(items)) return empty
  const flat: UiCondition[] = []
  let nestedOp: ConditionOp | '' = ''
  let nested: UiCondition[] = []
  items.forEach((item, i) => {
    if (item && typeof item === 'object' && ('and' in item || 'or' in item)) {
      const sub = item as { and?: ConditionLeaf[]; or?: ConditionLeaf[] }
      nestedOp = sub.or ? 'or' : 'and'
      const leaves = (sub.or ?? sub.and ?? []) as ConditionLeaf[]
      nested = leaves.map((a, j) => ({
        id: `nested_${j}`,
        ...conditionFromWire(a),
      }))
      return
    }
    flat.push({
      id: `cond_${i}`,
      ...conditionFromWire(item as ConditionLeaf),
    })
  })
  return { rootOp: rootKey, conditions: flat, nestedOp, nested }
}

export const wireConditionTree = (
  rootOp: ConditionOp,
  conditions: UiCondition[],
  nestedOp: ConditionOp | '',
  nested: UiCondition[],
): Record<string, unknown> => {
  const leaves = conditions.map(conditionToWire)
  if (nestedOp && nested.length > 0) {
    const group = { [nestedOp]: nested.map(conditionToWire) }
    if (leaves.length === 0) return group
    return { [rootOp]: [...leaves, group] }
  }
  if (leaves.length === 0) return {}
  return { [rootOp]: leaves }
}
