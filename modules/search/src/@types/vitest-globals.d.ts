/**
 * Ambient test types so `tsc --noEmit` knows vitest globals + jest-dom matchers
 * for the co-located `*.test.tsx` specs. Runtime setup: host/testing/vitest.shared.ts.
 *
 * `reference types="vitest/globals"` не резолвится через `paths` tsconfig — только
 * через node_modules. Remote берёт vitest из host (см. vitest.config.ts), поэтому
 * явный path на host/node_modules.
 */
/// <reference path="../../../../host/node_modules/vitest/globals.d.ts" />
import '@testing-library/jest-dom/vitest'
