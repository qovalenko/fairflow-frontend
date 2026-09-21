import { describe, expect, it } from 'vitest'
import { isAbacGroup, type AbacLeaf, type AbacGroup } from './types'

describe('isAbacGroup — type guard ABAC-IR', () => {
    it('возвращает false для листового предиката field/op/value', () => {
        const leaf: AbacLeaf = { field: 'status', op: 'eq', value: 'open' }
        expect(isAbacGroup(leaf)).toBe(false)
    })

    it.each(['and', 'or', 'not'] as const)(
        'возвращает true для группы с op=%s',
        (op) => {
            const group: AbacGroup = { op, args: [] }
            expect(isAbacGroup(group)).toBe(true)
        },
    )
})
