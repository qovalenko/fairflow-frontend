import { describe, it, expect } from 'vitest'
import { isChunkLoadError } from './isChunkLoadError'

describe('isChunkLoadError', () => {
    it('detects Vite dynamic import fetch failures', () => {
        expect(
            isChunkLoadError(
                new TypeError(
                    'Failed to fetch dynamically imported module: http://host/assets/chunk.js',
                ),
            ),
        ).toBe(true)
    })

    it('ignores unrelated errors', () => {
        expect(isChunkLoadError(new Error('network'))).toBe(false)
    })
})
