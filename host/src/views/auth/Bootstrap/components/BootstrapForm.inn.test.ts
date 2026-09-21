import { describe, expect, it } from 'vitest'
import { z } from 'zod'

/** Mirrors BootstrapForm validation (FR-AUTH-024). */
const innSchema = z
    .string()
    .refine((v) => !v.trim() || /^(\d{10}|\d{12})$/.test(v.trim()), {
        message: 'ИНН — 10 цифр (юрлицо) или 12 (ИП)',
    })

describe('BootstrapForm inn validation (FR-AUTH-024)', () => {
    it('accepts empty inn', () => {
        expect(innSchema.safeParse('').success).toBe(true)
        expect(innSchema.safeParse('   ').success).toBe(true)
    })

    it('accepts valid 10/12 digit inn', () => {
        expect(innSchema.safeParse('1234567890').success).toBe(true)
        expect(innSchema.safeParse('123456789012').success).toBe(true)
    })

    it('rejects malformed inn when provided', () => {
        expect(innSchema.safeParse('123').success).toBe(false)
    })
})
