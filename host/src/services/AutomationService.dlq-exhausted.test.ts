import { describe, it, expect } from 'vitest'
import { DLQ_STATUS_COLOR, DLQ_STATUS_LABEL } from '@/services/AutomationService'

describe('AutomationService DLQ statuses (ui-debt exhausted)', () => {
    it('maps terminal exhausted status for DLQ UI', () => {
        expect(DLQ_STATUS_LABEL.exhausted).toBe('Исчерпано')
        expect(DLQ_STATUS_COLOR.exhausted).toContain('red')
    })
})
