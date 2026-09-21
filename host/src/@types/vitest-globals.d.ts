/**
 * Ambient test types so `tsc --noEmit` (which includes `src/**`, and therefore the
 * co-located `*.test.ts(x)` files) knows about vitest's globals (`describe`, `it`,
 * `expect`, `vi`, …) and the jest-dom matchers. Runtime is provided by
 * testing/vitest.shared.ts (`globals: true`) + testing/vitest.setup.ts.
 */
/// <reference types="vitest/globals" />
import '@testing-library/jest-dom/vitest'
