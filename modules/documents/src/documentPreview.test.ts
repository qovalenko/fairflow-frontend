import { describe, it, expect } from 'vitest'
import { isPdfMime } from './documentPreview'

describe('documentPreview (TODO-396)', () => {
    it('detects PDF mime for inline iframe preview', () => {
        expect(isPdfMime('application/pdf')).toBe(true)
        expect(isPdfMime('APPLICATION/PDF')).toBe(true)
        expect(isPdfMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false)
        expect(isPdfMime(undefined)).toBe(false)
    })
})
