/**
 * PostCSS config — контракт сборки Tailwind v4.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const postcssConfig = require(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../postcss.config.cjs'),
)

describe('postcss.config.cjs', () => {
    it('подключает @tailwindcss/postcss', () => {
        expect(postcssConfig.plugins).toEqual({
            '@tailwindcss/postcss': {},
        })
    })
})
