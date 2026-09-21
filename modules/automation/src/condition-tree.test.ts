import { describe, expect, it } from 'vitest'
import { parseConditionTree, wireConditionTree } from './condition-tree'

describe('condition-tree (FR-AUTOM-090)', () => {
  it('round-trips flat AND leaves', () => {
    const wire = {
      and: [
        { field: 'status', op: 'eq', value: 'open' },
        { field: 'amount', op: 'gt', value: '100' },
      ],
    }
    const parsed = parseConditionTree(wire)
    expect(parsed.rootOp).toBe('and')
    expect(parsed.conditions).toHaveLength(2)
    expect(parsed.nested).toHaveLength(0)
    expect(wireConditionTree(parsed.rootOp, parsed.conditions, parsed.nestedOp, parsed.nested)).toEqual(
      wire,
    )
  })

  it('round-trips root AND with nested OR group', () => {
    const wire = {
      and: [
        { field: 'a', op: 'eq', value: '1' },
        {
          or: [
            { field: 'b', op: 'eq', value: '2' },
            { field: 'c', op: 'eq', value: '3' },
          ],
        },
      ],
    }
    const parsed = parseConditionTree(wire)
    expect(parsed.nestedOp).toBe('or')
    expect(parsed.nested).toHaveLength(2)
    expect(wireConditionTree(parsed.rootOp, parsed.conditions, parsed.nestedOp, parsed.nested)).toEqual(
      wire,
    )
  })
})
