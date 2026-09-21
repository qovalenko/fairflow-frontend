/**
 * Ambient test types so `tsc --noEmit` knows vitest globals + jest-dom matchers
 * for the co-located `*.test.tsx` specs. Runtime setup: host/testing/vitest.shared.ts.
 */
/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest'
