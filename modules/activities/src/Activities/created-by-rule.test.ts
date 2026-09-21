import { describe, expect, it } from 'vitest'
import { automationRuleBadge } from './created-by-rule'

describe('automationRuleBadge (FR-AUTOM-120)', () => {
  it('returns null when rule metadata is absent', () => {
    expect(automationRuleBadge(undefined)).toBeNull()
    expect(automationRuleBadge({ ruleId: '', name: '' })).toBeNull()
  })

  it('prefers rule name over id', () => {
    expect(automationRuleBadge({ ruleId: 'r1', name: 'Напоминание' })).toBe('Авто: Напоминание')
  })
})
