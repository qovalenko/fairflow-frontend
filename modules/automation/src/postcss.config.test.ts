import { describe, expect, it } from 'vitest'
// @ts-expect-error — cjs postcss config без d.ts
import postcssConfig from '../postcss.config.cjs'

describe('postcss.config — tailwind pipeline', () => {
    it('подключает @tailwindcss/postcss', () => {
        expect(postcssConfig.plugins).toHaveProperty('@tailwindcss/postcss')
    })
})
